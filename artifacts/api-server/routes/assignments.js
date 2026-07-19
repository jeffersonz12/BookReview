import { Router } from "express";
import mongoose from "mongoose";
import { Assignment, Class, Book, Review, User, Grade, createNotification } from "../models.js";

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

function formatAssignment(a, bookTitle, bookAuthor) {
  return {
    id: a._id.toString(),
    classId: a.classId.toString(),
    bookId: a.bookId.toString(),
    bookTitle: bookTitle ?? null,
    bookAuthor: bookAuthor ?? null,
    deadline: a.deadline ? a.deadline.toISOString() : null,
    minWordCount: a.minWordCount ?? null,
    maxGrade: a.maxGrade ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

async function createAssignmentForClass(classId, bookId, deadline, minWordCount, maxGrade) {
  const [cls, book] = await Promise.all([Class.findById(classId), Book.findById(bookId)]);
  if (!cls || !book) return null;

  let assignment;
  try {
    assignment = await Assignment.create({
      classId: new mongoose.Types.ObjectId(classId),
      bookId: new mongoose.Types.ObjectId(bookId),
      deadline: deadline ? new Date(deadline) : null,
      minWordCount: minWordCount ? Number(minWordCount) : null,
      maxGrade: maxGrade != null ? Number(maxGrade) : null,
    });
  } catch (err) {
    if (err.code === 11000) return { alreadyExists: true };
    throw err;
  }

  const bookObjId = new mongoose.Types.ObjectId(bookId);
  const classObjId = new mongoose.Types.ObjectId(classId);
  if (!cls.bookIds.some((id) => id.equals(bookObjId))) { cls.bookIds.push(bookObjId); await cls.save(); }
  if (!book.classIds.some((id) => id.equals(classObjId))) { book.classIds.push(classObjId); await book.save(); }

  return { assignment, book };
}

router.get("/classes/:classId/assignments", requireAuth, async (req, res) => {
  const { classId } = req.params;
  if (!mongoose.isValidObjectId(classId)) { res.status(404).json({ error: "Class not found" }); return; }
  const assignments = await Assignment.find({ classId: new mongoose.Types.ObjectId(classId) }).lean();
  const bookIds = assignments.map((a) => a.bookId);
  const books = await Book.find({ _id: { $in: bookIds } }).lean();
  const bookMap = Object.fromEntries(books.map((b) => [b._id.toString(), b]));
  res.json(assignments.map((a) => {
    const book = bookMap[a.bookId.toString()];
    return formatAssignment(a, book?.title, book?.author);
  }));
});

router.post("/classes/:classId/assignments", requireAdmin, async (req, res) => {
  const { classId } = req.params;
  const { bookId, deadline, minWordCount, maxGrade, additionalClassIds = [] } = req.body;

  if (!mongoose.isValidObjectId(classId)) { res.status(404).json({ error: "Class not found" }); return; }
  if (!bookId || !mongoose.isValidObjectId(bookId)) { res.status(400).json({ error: "Valid bookId is required" }); return; }

  const primaryResult = await createAssignmentForClass(classId, bookId, deadline, minWordCount, maxGrade);
  if (!primaryResult) { res.status(404).json({ error: "Class or book not found" }); return; }
  if (primaryResult.alreadyExists) { res.status(400).json({ error: "This book is already assigned to this class" }); return; }

  const { assignment, book } = primaryResult;

  const additionalAssignments = [];
  for (const extraId of additionalClassIds) {
    if (!mongoose.isValidObjectId(extraId) || extraId === classId) continue;
    const result = await createAssignmentForClass(extraId, bookId, deadline, minWordCount, maxGrade);
    if (result && !result.alreadyExists && result.assignment) {
      additionalAssignments.push(formatAssignment(result.assignment, book.title, book.author));
    }
  }

  const cls = await Class.findById(classId).lean();
  const notices = [];
  if (cls?.studentIds?.length) {
    const bookObjId = new mongoose.Types.ObjectId(bookId);
    const reviews = await Review.find({ bookId: bookObjId, userId: { $in: cls.studentIds }, hidden: false }).lean();
    const userIds = reviews.map((r) => r.userId);
    const users = await User.find({ _id: { $in: userIds } }).lean();
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));
    for (const review of reviews) {
      const wordCount = review.text.trim().split(/\s+/).filter(Boolean).length;
      const required = assignment.minWordCount;
      const meetsRequirement = !required || wordCount >= required;
      const u = userMap[review.userId.toString()];
      notices.push({ userId: review.userId.toString(), username: u?.username ?? "unknown", displayName: u?.displayName ?? null, reviewId: review._id.toString(), wordCount, required: required ?? null, meetsRequirement });
    }
  }

  if (cls?.studentIds?.length) {
    const primaryBody = `"${book.title}" has been assigned in ${cls.name}.`;
    await Promise.all(cls.studentIds.map(sid =>
      createNotification(sid, "new_assignment", "📋 New Assignment", primaryBody, "#/classes")
    ));
  }
  for (const extraId of additionalClassIds) {
    if (!mongoose.isValidObjectId(extraId) || extraId === classId) continue;
    const extraCls = await Class.findById(extraId).lean();
    if (extraCls?.studentIds?.length) {
      const extraBody = `"${book.title}" has been assigned in ${extraCls.name}.`;
      await Promise.all(extraCls.studentIds.map(sid =>
        createNotification(sid, "new_assignment", "📋 New Assignment", extraBody, "#/classes")
      ));
    }
  }

  res.status(201).json({ assignment: formatAssignment(assignment, book.title, book.author), additionalAssignments, notices });
});

router.put("/assignments/:assignmentId", requireAdmin, async (req, res) => {
  const { assignmentId } = req.params;
  if (!mongoose.isValidObjectId(assignmentId)) { res.status(404).json({ error: "Assignment not found" }); return; }
  const { deadline, minWordCount, maxGrade } = req.body;
  const assignment = await Assignment.findByIdAndUpdate(
    assignmentId,
    {
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      ...(minWordCount !== undefined && { minWordCount: minWordCount ? Number(minWordCount) : null }),
      ...(maxGrade !== undefined && { maxGrade: maxGrade != null ? Number(maxGrade) : null }),
    },
    { new: true }
  );
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }
  const book = await Book.findById(assignment.bookId).lean();

  const updatedCls = await Class.findById(assignment.classId).lean();
  if (updatedCls?.studentIds?.length) {
    const updateBody = `Requirements for "${book?.title || "an assignment"}" in ${updatedCls.name} were updated.`;
    await Promise.all(updatedCls.studentIds.map(sid =>
      createNotification(sid, "assignment_updated", "📝 Assignment Updated", updateBody, "#/classes")
    ));
  }

  res.json(formatAssignment(assignment, book?.title, book?.author));
});

router.delete("/assignments/:assignmentId", requireAdmin, async (req, res) => {
  const { assignmentId } = req.params;
  if (!mongoose.isValidObjectId(assignmentId)) { res.status(404).json({ error: "Assignment not found" }); return; }
  const assignment = await Assignment.findByIdAndDelete(assignmentId);
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  const remaining = await Assignment.findOne({ classId: assignment.classId, bookId: assignment.bookId });
  if (!remaining) {
    await Class.findByIdAndUpdate(assignment.classId, { $pull: { bookIds: assignment.bookId } });
    await Book.findByIdAndUpdate(assignment.bookId, { $pull: { classIds: assignment.classId } });
  }
  res.json({ success: true });
});

router.get("/assignments/:assignmentId/submissions", requireAdmin, async (req, res) => {
  const { assignmentId } = req.params;
  if (!mongoose.isValidObjectId(assignmentId)) { res.status(404).json({ error: "Assignment not found" }); return; }
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) { res.status(404).json({ error: "Assignment not found" }); return; }

  const cls = await Class.findById(assignment.classId).lean();
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }

  const studentIds = cls.studentIds;
  const [students, reviews, grades] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).lean(),
    Review.find({ bookId: assignment.bookId, userId: { $in: studentIds }, hidden: false }).lean(),
    Grade.find({ assignmentId: new mongoose.Types.ObjectId(assignmentId) }).lean(),
  ]);

  const reviewMap = Object.fromEntries(reviews.map((r) => [r.userId.toString(), r]));
  const gradeMap = Object.fromEntries(grades.map((g) => [g.studentId.toString(), g]));

  res.json(students.map((s) => {
    const review = reviewMap[s._id.toString()] || null;
    const grade = gradeMap[s._id.toString()] || null;
    const wordCount = review ? review.text.trim().split(/\s+/).filter(Boolean).length : null;
    return {
      student: { id: s._id.toString(), username: s.username, displayName: s.displayName || null },
      review: review ? { id: review._id.toString(), rating: review.rating, text: review.text, spoiler: review.spoiler, wordCount, createdAt: review.createdAt.toISOString() } : null,
      meetsWordCount: assignment.minWordCount && wordCount !== null ? wordCount >= assignment.minWordCount : null,
      grade: grade ? { grade: grade.grade, feedback: grade.feedback, updatedAt: grade.updatedAt.toISOString() } : null,
    };
  }));
});

router.put("/assignments/:assignmentId/grades/:studentId", requireAdmin, async (req, res) => {
  const { assignmentId, studentId } = req.params;
  if (!mongoose.isValidObjectId(assignmentId) || !mongoose.isValidObjectId(studentId)) {
    res.status(400).json({ error: "Invalid ID" }); return;
  }
  const { grade, feedback } = req.body;
  const updated = await Grade.findOneAndUpdate(
    { assignmentId: new mongoose.Types.ObjectId(assignmentId), studentId: new mongoose.Types.ObjectId(studentId) },
    { grade: grade ?? null, feedback: feedback ?? null, gradedBy: new mongoose.Types.ObjectId(req.session.userId) },
    { upsert: true, new: true }
  );

  if (updated.grade) {
    const gradedAssignment = await Assignment.findById(assignmentId).lean();
    const [gradedBook, gradedCls] = await Promise.all([
      Book.findById(gradedAssignment?.bookId).lean(),
      Class.findById(gradedAssignment?.classId).lean(),
    ]);
    const gradeBody = `You received a grade of ${updated.grade} for "${gradedBook?.title || "an assignment"}" in ${gradedCls?.name || "your class"}.`;
    await createNotification(studentId, "grade_received", "🏅 Grade Posted", gradeBody, "#/classes");
  }

  res.json({ grade: updated.grade, feedback: updated.feedback, updatedAt: updated.updatedAt.toISOString() });
});

router.get("/classes/:classId/my-progress", requireAuth, async (req, res) => {
  const { classId } = req.params;
  const userId = req.session.userId;
  if (!mongoose.isValidObjectId(classId)) { res.status(404).json({ error: "Class not found" }); return; }

  const assignments = await Assignment.find({ classId: new mongoose.Types.ObjectId(classId) }).lean();
  if (!assignments.length) { res.json([]); return; }

  const bookIds = assignments.map((a) => a.bookId);
  const assignmentIds = assignments.map((a) => a._id);

  const [books, reviews, grades] = await Promise.all([
    Book.find({ _id: { $in: bookIds } }).lean(),
    Review.find({ bookId: { $in: bookIds }, userId: new mongoose.Types.ObjectId(userId), hidden: false }).lean(),
    Grade.find({ assignmentId: { $in: assignmentIds }, studentId: new mongoose.Types.ObjectId(userId) }).lean(),
  ]);

  const bookMap = Object.fromEntries(books.map((b) => [b._id.toString(), b]));
  const reviewMap = Object.fromEntries(reviews.map((r) => [r.bookId.toString(), r]));
  const gradeMap = Object.fromEntries(grades.map((g) => [g.assignmentId.toString(), g]));

  res.json(assignments.map((a) => {
    const book = bookMap[a.bookId.toString()];
    const review = reviewMap[a.bookId.toString()] || null;
    const grade = gradeMap[a._id.toString()] || null;
    const wordCount = review ? review.text.trim().split(/\s+/).filter(Boolean).length : null;
    return {
      assignment: formatAssignment(a, book?.title, book?.author),
      review: review ? { id: review._id.toString(), rating: review.rating, text: review.text, wordCount, createdAt: review.createdAt.toISOString() } : null,
      meetsWordCount: a.minWordCount && wordCount !== null ? wordCount >= a.minWordCount : null,
      grade: grade ? { grade: grade.grade, feedback: grade.feedback } : null,
    };
  }));
});

router.get("/books/:bookId/assignments", requireAuth, async (req, res) => {
  const { bookId } = req.params;
  const userId = req.session.userId;
  if (!mongoose.isValidObjectId(bookId)) { res.json([]); return; }

  const user = await User.findById(userId).lean();
  if (!user?.classIds?.length) { res.json([]); return; }

  const assignments = await Assignment.find({ bookId: new mongoose.Types.ObjectId(bookId), classId: { $in: user.classIds } }).lean();
  const classIds = assignments.map((a) => a.classId);
  const classes = await Class.find({ _id: { $in: classIds } }).lean();
  const classMap = Object.fromEntries(classes.map((c) => [c._id.toString(), c]));
  const book = await Book.findById(bookId).lean();

  res.json(assignments.map((a) => ({ ...formatAssignment(a, book?.title, book?.author), className: classMap[a.classId.toString()]?.name ?? null })));
});

export default router;
