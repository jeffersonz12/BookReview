import { Router } from "express";
import mongoose from "mongoose";
import { Review, ReviewHistory, User, Book, Report, getFilterWordList } from "../models.js";

const router = Router();

function optionalAuth(req, res, next) { next(); }
function requireAuth(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}

function containsBannedWords(text, words) {
  const lower = text.toLowerCase();
  for (const word of words) { if (word && lower.includes(word.toLowerCase())) return word; }
  return null;
}

async function formatReview(review, userId) {
  const user = await User.findById(review.userId).lean();
  const reportCount = await Report.countDocuments({ reviewId: review._id, status: "pending" });
  return {
    id: review._id.toString(), bookId: review.bookId.toString(), userId: review.userId.toString(),
    username: user?.username || "unknown", displayName: user?.displayName || null,
    rating: review.rating, text: review.text, spoiler: review.spoiler,
    flagged: review.flagged, flagReason: review.flagReason, hidden: review.hidden,
    reportCount,
    helpfulCount: review.helpfulVotes?.length ?? 0,
    isHelpfulByMe: userId ? (review.helpfulVotes || []).some((id) => id.toString() === userId) : false,
    editCount: review.editCount,
    createdAt: review.createdAt.toISOString(), updatedAt: review.updatedAt.toISOString(),
  };
}

async function saveHistory(review, opts = {}) {
  await ReviewHistory.create({
    reviewId: review._id,
    bookId: review.bookId,
    userId: review.userId,
    rating: review.rating,
    text: review.text,
    spoiler: review.spoiler,
    editedAt: new Date(),
    deleted: opts.deleted || false,
  });
}

router.get("/books/:bookId/reviews", optionalAuth, async (req, res) => {
  const { bookId } = req.params;
  const { sort } = req.query;
  const userId = req.session?.userId;
  if (!mongoose.isValidObjectId(bookId)) { res.json([]); return; }
  const sortMap = { newest: { createdAt: -1 }, highest: { rating: -1 }, lowest: { rating: 1 }, helpful: { helpfulVotes: -1 } };
  const reviews = await Review.find({ bookId: new mongoose.Types.ObjectId(bookId), hidden: false }).sort(sortMap[sort] || { createdAt: -1 });
  res.json(await Promise.all(reviews.map((r) => formatReview(r, userId))));
});

router.post("/books/:bookId/reviews", requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.session.userId;
  const { rating, text, spoiler } = req.body;
  if (!mongoose.isValidObjectId(bookId)) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const book = await Book.findById(bookId);
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  if (!rating || rating < 1 || rating > 5) { res.status(400).json({ error: "Rating must be 1-5" }); return; }
  if (!text || text.trim().length === 0) { res.status(400).json({ error: "Review text is required" }); return; }
  const filterWords = await getFilterWordList();
  const banned = containsBannedWords(text, filterWords);
  try {
    const review = await Review.create({
      bookId: new mongoose.Types.ObjectId(bookId), userId: new mongoose.Types.ObjectId(userId),
      rating: Number(rating), text: text.trim(), spoiler: spoiler === true,
      flagged: banned !== null, flagReason: banned ? `Contains filtered word: "${banned}"` : null,
      hidden: false, helpfulVotes: [], editCount: 0,
    });
    res.status(201).json(await formatReview(review, userId));
  } catch (err) {
    if (err.code === 11000) { res.status(400).json({ error: "You have already reviewed this book" }); }
    else throw err;
  }
});

router.get("/reviews/:reviewId", requireAuth, async (req, res) => {
  const { reviewId } = req.params;
  if (!mongoose.isValidObjectId(reviewId)) { res.status(404).json({ error: "Review not found" }); return; }
  const review = await Review.findById(reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  res.json(await formatReview(review, req.session.userId));
});

router.put("/reviews/:reviewId", requireAuth, async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.session.userId;
  const review = await Review.findById(reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  if (req.session.role !== "admin" && review.userId.toString() !== userId) { res.status(403).json({ error: "Not allowed" }); return; }

  await saveHistory(review);

  const { rating, text, spoiler } = req.body;
  const newText = text !== undefined ? text.trim() : review.text;
  const filterWords = await getFilterWordList();
  const banned = containsBannedWords(newText, filterWords);

  review.rating = rating !== undefined ? Number(rating) : review.rating;
  review.text = newText;
  review.spoiler = spoiler !== undefined ? spoiler : review.spoiler;
  review.editCount = (review.editCount || 0) + 1;

  if (banned) {
    review.flagged = true;
    review.flagReason = `Contains filtered word: "${banned}"`;
  } else {
    review.flagged = false;
    review.flagReason = null;
  }

  await review.save();

  await Report.updateMany({ reviewId: review._id, status: "pending" }, { status: "dismissed" });

  res.json(await formatReview(review, userId));
});

router.delete("/reviews/:reviewId", requireAuth, async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.session.userId;
  const review = await Review.findById(reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  if (req.session.role !== "admin" && review.userId.toString() !== userId) { res.status(403).json({ error: "Not allowed" }); return; }

  await saveHistory(review, { deleted: true });

  await Report.updateMany({ reviewId: review._id, status: "pending" }, { status: "actioned" });

  await Review.findByIdAndDelete(reviewId);
  res.json({ success: true, message: "Review deleted" });
});

router.get("/reviews/:reviewId/history", requireAuth, async (req, res) => {
  const history = await ReviewHistory.find({ reviewId: new mongoose.Types.ObjectId(req.params.reviewId) }).sort({ editedAt: -1 });
  res.json(history.map((h) => ({
    id: h._id.toString(), reviewId: h.reviewId.toString(),
    rating: h.rating, text: h.text, spoiler: h.spoiler,
    editedAt: h.editedAt.toISOString(),
    deleted: h.deleted || false,
  })));
});

router.post("/reviews/:reviewId/helpful", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const userObjId = new mongoose.Types.ObjectId(userId);
  const review = await Review.findById(req.params.reviewId);
  if (!review) { res.status(404).json({ error: "Review not found" }); return; }
  const alreadyVoted = review.helpfulVotes.some((id) => id.equals(userObjId));
  if (alreadyVoted) review.helpfulVotes = review.helpfulVotes.filter((id) => !id.equals(userObjId));
  else review.helpfulVotes.push(userObjId);
  await review.save();
  res.json({ helpfulCount: review.helpfulVotes.length, isHelpfulByMe: !alreadyVoted });
});

router.post("/reviews/:reviewId/report", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const { reason } = req.body;
  if (!reason) { res.status(400).json({ error: "Reason is required" }); return; }
  await Report.create({ reviewId: new mongoose.Types.ObjectId(req.params.reviewId), reportedBy: new mongoose.Types.ObjectId(userId), reason, status: "pending" });
  res.status(201).json({ success: true, message: "Report submitted" });
});

export default router;
