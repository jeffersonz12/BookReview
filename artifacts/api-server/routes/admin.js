import { Router } from "express";
import mongoose from "mongoose";
import { Report, Review, ReviewHistory, Book, User, Class, FilterWords, getFilterWordList, createNotification } from "../models.js";

const router = Router();

function requireAdmin(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

async function formatReviewAdmin(review) {
  const [user, book] = await Promise.all([User.findById(review.userId).lean(), Book.findById(review.bookId).lean()]);
  const reportCount = await Report.countDocuments({ reviewId: review._id, status: "pending" });
  return {
    id: review._id.toString(), bookId: review.bookId.toString(), bookTitle: book?.title || "Unknown",
    userId: review.userId.toString(), username: user?.username || "unknown", displayName: user?.displayName || null,
    rating: review.rating, text: review.text, spoiler: review.spoiler, flagged: review.flagged,
    flagReason: review.flagReason, hidden: review.hidden, reportCount,
    helpfulCount: review.helpfulVotes?.length ?? 0, editCount: review.editCount,
    createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
  };
}

async function saveHistory(review, opts = {}) {
  await ReviewHistory.create({
    reviewId: review._id, bookId: review.bookId, userId: review.userId,
    rating: review.rating, text: review.text, spoiler: review.spoiler,
    editedAt: new Date(), deleted: opts.deleted || false,
  });
}

function containsBannedWords(text, words) {
  const lower = text.toLowerCase();
  for (const word of words) { if (word && lower.includes(word.toLowerCase())) return word; }
  return null;
}

router.get("/admin/reports", requireAdmin, async (req, res) => {
  const reports = await Report.find({ status: "pending" }).sort({ createdAt: -1 }).lean();
  const formatted = await Promise.all(reports.map(async (report) => {
    const [review, reporter] = await Promise.all([Review.findById(report.reviewId).lean(), User.findById(report.reportedBy).lean()]);
    const book = review ? await Book.findById(review.bookId).lean() : null;
    return {
      id: report._id.toString(), reviewId: report.reviewId.toString(),
      reviewText: review?.text || "[deleted]", bookTitle: book?.title || "Unknown",
      bookId: review?.bookId?.toString() || null,
      userId: review?.userId?.toString() || null,
      reportedByUsername: reporter?.username || "unknown", reason: report.reason,
      status: report.status, createdAt: report.createdAt.toISOString(),
    };
  }));
  res.json(formatted);
});

router.get("/admin/reports/auto", requireAdmin, async (req, res) => {
  const flagged = await Review.find({ flagged: true }).sort({ updatedAt: -1 }).lean();
  const formatted = await Promise.all(flagged.map(async (review) => {
    const [user, book] = await Promise.all([User.findById(review.userId).lean(), Book.findById(review.bookId).lean()]);
    const reportCount = await Report.countDocuments({ reviewId: review._id, status: "pending" });
    return {
      id: review._id.toString(), reviewId: review._id.toString(),
      reviewText: review.text, bookTitle: book?.title || "Unknown",
      bookId: review.bookId.toString(), userId: review.userId.toString(),
      username: user?.username || "unknown", displayName: user?.displayName || null,
      reason: review.flagReason || "Contains filtered word",
      hidden: review.hidden, rating: review.rating, reportCount,
      createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
    };
  }));
  res.json(formatted);
});

router.put("/admin/reports/:reportId", requireAdmin, async (req, res) => {
  const { reportId } = req.params;
  const { action } = req.body;
  const report = await Report.findById(reportId);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (action === "dismiss") {
    report.status = "dismissed"; await report.save();
  } else if (action === "hide_review") {
    const hiddenReview = await Review.findByIdAndUpdate(report.reviewId, { hidden: true }, { new: true }).lean();
    if (hiddenReview) {
      const hiddenBook = await Book.findById(hiddenReview.bookId).lean();
      await createNotification(
        hiddenReview.userId, "review_hidden", "🙈 Review Hidden",
        `Your review of "${hiddenBook?.title || "a book"}" was hidden by an admin.`,
        `#/books/${hiddenReview.bookId}`
      );
    }
    report.status = "actioned"; await report.save();
  } else if (action === "delete_review") {
    const review = await Review.findById(report.reviewId);
    if (review) {
      await saveHistory(review, { deleted: true });
      await Review.findByIdAndDelete(report.reviewId);
    }
    await Report.updateMany({ reviewId: report.reviewId, status: "pending" }, { status: "actioned" });
    return res.json({ success: true });
  } else {
    res.status(400).json({ error: "Invalid action" }); return;
  }
  res.json({ success: true });
});


router.get("/admin/reviews", requireAdmin, async (req, res) => {
  const { flagged, hidden } = req.query;
  const filter = {};
  if (flagged === "true") filter.flagged = true;
  if (hidden === "true") filter.hidden = true;
  if (hidden === "false") filter.hidden = false;
  const reviews = await Review.find(filter).sort({ createdAt: -1 });
  res.json(await Promise.all(reviews.map(formatReviewAdmin)));
});

router.put("/admin/reviews/:reviewId/visibility", requireAdmin, async (req, res) => {
  const hidden = !!req.body.hidden;
  const review = await Review.findByIdAndUpdate(req.params.reviewId, { hidden }, { new: true }).lean();
  if (hidden && review) {
    const book = await Book.findById(review.bookId).lean();
    await createNotification(
      review.userId, "review_hidden", "🙈 Review Hidden",
      `Your review of "${book?.title || "a book"}" was hidden by an admin.`,
      `#/books/${review.bookId}`
    );
  }
  res.json({ success: true });
});

router.put("/admin/reviews/:reviewId/dismiss-flag", requireAdmin, async (req, res) => {
  const review = await Review.findByIdAndUpdate(
    req.params.reviewId,
    { flagged: false, flagReason: null },
    { new: true }
  );
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  res.json({ success: true });
});

router.put("/admin/reviews/:reviewId/force-edit", requireAdmin, async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }

  await saveHistory(review);

  const { rating, text, spoiler } = req.body;
  const newText = text !== undefined ? text.trim() : review.text;
  const filterWords = await getFilterWordList();
  const banned = containsBannedWords(newText, filterWords);

  if (rating !== undefined) review.rating = Number(rating);
  if (text !== undefined) review.text = newText;
  if (spoiler !== undefined) review.spoiler = !!spoiler;
  review.editCount = (review.editCount || 0) + 1;

  if (!banned) {
    review.flagged = false; review.flagReason = null;
    await Report.updateMany({ reviewId: review._id, status: "pending" }, { status: "dismissed" });
  } else {
    review.flagged = true; review.flagReason = `Contains filtered word: "${banned}"`;
  }

  await review.save();
  res.json(await formatReviewAdmin(review));
});

router.delete("/admin/reviews/:reviewId", requireAdmin, async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  await saveHistory(review, { deleted: true });
  await Review.findByIdAndDelete(req.params.reviewId);
  await Report.updateMany({ reviewId: review._id }, { status: "actioned" });
  res.json({ success: true });
});


router.get("/admin/filter-words", requireAdmin, async (req, res) => {
  const doc = await FilterWords.findOne();
  res.json({ words: doc?.words ?? [] });
});

router.put("/admin/filter-words", requireAdmin, async (req, res) => {
  const { words } = req.body;
  if (!Array.isArray(words)) { res.status(400).json({ error: "words must be an array" }); return; }
  const cleaned = words.map((w) => w.trim().toLowerCase()).filter(Boolean);
  let doc = await FilterWords.findOne();
  if (doc) { doc.words = cleaned; await doc.save(); }
  else { doc = await FilterWords.create({ words: cleaned }); }
  res.json({ words: doc.words });
});


router.get("/admin/stats", requireAdmin, async (req, res) => {
  const [totalBooks, totalReviews, totalStudents, totalClasses, flaggedReviews, pendingReports, recentReviewDocs] = await Promise.all([
    Book.countDocuments({ isArchived: false, isBanned: false }),
    Review.countDocuments(),
    User.countDocuments({ role: "student" }),
    Class.countDocuments(),
    Review.countDocuments({ flagged: true, hidden: false }),
    Report.countDocuments({ status: "pending" }),
    Review.find().sort({ createdAt: -1 }).limit(5),
  ]);
  res.json({ totalBooks, totalReviews, totalStudents, totalClasses, flaggedReviews, pendingReports, recentReviews: await Promise.all(recentReviewDocs.map(formatReviewAdmin)) });
});


router.get("/admin/users", requireAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.json(users.map((u) => ({
    id: u._id.toString(), username: u.username, displayName: u.displayName,
    role: u.role, classIds: u.classIds.map((id) => id.toString()),
    nameForcedBy: u.nameForcedBy ? u.nameForcedBy.toString() : null,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.put("/admin/users/:userId/role", requireAdmin, async (req, res) => {
  const { role } = req.body;
  if (!["student", "admin"].includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
  const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ id: user._id.toString(), username: user.username, displayName: user.displayName, role: user.role, nameForcedBy: user.nameForcedBy?.toString() || null });
});

router.put("/admin/users/:userId/force-name", requireAdmin, async (req, res) => {
  const { displayName } = req.body;
  if (!displayName?.trim()) { res.status(400).json({ error: "Display name is required" }); return; }
  const user = await User.findByIdAndUpdate(
    req.params.userId,
    { displayName: displayName.trim(), nameForcedBy: new mongoose.Types.ObjectId(req.session.userId) },
    { new: true }
  );
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json({ id: user._id.toString(), username: user.username, displayName: user.displayName, nameForcedBy: user.nameForcedBy?.toString() || null });
});

router.delete("/admin/users/:userId", requireAdmin, async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
  const user = await User.findById(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.role === "admin") { res.status(403).json({ error: "Cannot delete an admin account" }); return; }

  const userObjId = new mongoose.Types.ObjectId(userId);
  await Class.updateMany({ studentIds: userObjId }, { $pull: { studentIds: userObjId } });

  const reviews = await Review.find({ userId: userObjId }).lean();
  for (const r of reviews) {
    await saveHistory(r, { deleted: true });
    await Report.updateMany({ reviewId: r._id }, { status: "actioned" });
  }
  await Review.deleteMany({ userId: userObjId });
  await User.findByIdAndDelete(userId);
  res.json({ success: true });
});


router.get("/admin/deleted-reviews", requireAdmin, async (req, res) => {
  const snapshots = await ReviewHistory.find({ deleted: true }).sort({ editedAt: -1 }).lean();
  const result = await Promise.all(snapshots.map(async (h) => {
    const [user, book] = await Promise.all([
      User.findById(h.userId).lean(),
      Book.findById(h.bookId).lean(),
    ]);
    return {
      id: h._id.toString(),
      reviewId: h.reviewId.toString(),
      bookId: h.bookId?.toString() || null,
      bookTitle: book?.title || "Unknown",
      userId: h.userId?.toString() || null,
      username: user?.username || "unknown",
      displayName: user?.displayName || null,
      rating: h.rating,
      text: h.text,
      spoiler: h.spoiler,
      deletedAt: h.editedAt.toISOString(),
    };
  }));
  res.json(result);
});

router.delete("/admin/deleted-reviews/:historyId", requireAdmin, async (req, res) => {
  const { historyId } = req.params;
  if (!mongoose.isValidObjectId(historyId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const entry = await ReviewHistory.findById(historyId);
  if (!entry) { res.status(404).json({ error: "Not found" }); return; }
  await ReviewHistory.deleteMany({ reviewId: entry.reviewId });
  res.json({ success: true });
});


router.get("/admin/books", requireAdmin, async (req, res) => {
  const books = await Book.find().sort({ createdAt: -1 }).lean();
  const result = await Promise.all(books.map(async (b) => {
    const reviews = await Review.find({ bookId: b._id, hidden: false });
    const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return {
      id: b._id.toString(), title: b.title, author: b.author, coverUrl: b.coverUrl,
      isArchived: b.isArchived, isBanned: b.isBanned || false,
      averageRating: Math.round(avgRating * 10) / 10, reviewCount: reviews.length,
      createdAt: b.createdAt.toISOString(),
    };
  }));
  res.json(result);
});

router.delete("/admin/books/:bookId/wipe", requireAdmin, async (req, res) => {
  const { bookId } = req.params;
  if (!mongoose.isValidObjectId(bookId)) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const reviews = await Review.find({ bookId }).lean();
  const reviewIds = reviews.map(r => r._id);
  await ReviewHistory.deleteMany({ reviewId: { $in: reviewIds } });
  await Report.updateMany({ reviewId: { $in: reviewIds } }, { status: "actioned" });
  await Review.deleteMany({ bookId });
  res.json({ success: true });
});

router.delete("/admin/books/:bookId", requireAdmin, async (req, res) => {
  const { bookId } = req.params;
  if (!mongoose.isValidObjectId(bookId)) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const book = await Book.findById(bookId);
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  await Class.updateMany({ bookIds: book._id }, { $pull: { bookIds: book._id } });
  await Book.findByIdAndDelete(bookId);
  res.json({ success: true, message: "Book permanently removed" });
});

export default router;
