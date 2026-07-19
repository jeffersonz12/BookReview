import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: null },
    role: { type: String, enum: ["student", "admin"], default: "student" },
    classIds: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    favoriteBookIds: [{ type: Schema.Types.ObjectId, ref: "Book" }],
    nameForcedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
export const User = mongoose.model("User", UserSchema);

const ClassSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    code: { type: String, required: true, unique: true, uppercase: true },
    bookIds: [{ type: Schema.Types.ObjectId, ref: "Book" }],
    studentIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
export const Class = mongoose.model("Class", ClassSchema);

const AssignmentSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    deadline: { type: Date, default: null },
    minWordCount: { type: Number, default: null },
    maxGrade: { type: Number, default: null },
  },
  { timestamps: true }
);
AssignmentSchema.index({ classId: 1, bookId: 1 }, { unique: true });
export const Assignment = mongoose.model("Assignment", AssignmentSchema);

const GradeSchema = new Schema(
  {
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    grade: { type: String, default: null },
    feedback: { type: String, default: null },
    gradedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
GradeSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });
export const Grade = mongoose.model("Grade", GradeSchema);

const BookSchema = new Schema(
  {
    title: { type: String, required: true },
    author: { type: String, required: true },
    coverUrl: { type: String, default: null },
    openLibKey: { type: String, default: null },
    description: { type: String, default: null },
    isArchived: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    classIds: [{ type: Schema.Types.ObjectId, ref: "Class" }],
  },
  { timestamps: true }
);
export const Book = mongoose.model("Book", BookSchema);

const ReviewSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: "Book", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true },
    spoiler: { type: Boolean, default: false },
    flagged: { type: Boolean, default: false },
    flagReason: { type: String, default: null },
    hidden: { type: Boolean, default: false },
    helpfulVotes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    editCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
ReviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
export const Review = mongoose.model("Review", ReviewSchema);

const ReviewHistorySchema = new Schema({
  reviewId: { type: Schema.Types.ObjectId, ref: "Review", required: true },
  bookId: { type: Schema.Types.ObjectId, ref: "Book", default: null },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  rating: { type: Number, required: true },
  text: { type: String, required: true },
  spoiler: { type: Boolean, default: false },
  editedAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
});
export const ReviewHistory = mongoose.model("ReviewHistory", ReviewHistorySchema);

const ReportSchema = new Schema(
  {
    reviewId: { type: Schema.Types.ObjectId, ref: "Review", required: true },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "dismissed", "actioned"], default: "pending" },
  },
  { timestamps: true }
);
export const Report = mongoose.model("Report", ReportSchema);

const FilterWordsSchema = new Schema({ words: [{ type: String }] });
export const FilterWords = mongoose.model("FilterWords", FilterWordsSchema);

export async function getFilterWordList() {
  const doc = await FilterWords.findOne();
  return doc?.words ?? [];
}

const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: null },
    link: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
export const Notification = mongoose.model("Notification", NotificationSchema);

export async function createNotification(userId, type, title, body, link) {
  try {
    await Notification.create({
      userId: new mongoose.Types.ObjectId(userId.toString()),
      type, title, body: body ?? null, link: link ?? null,
    });
  } catch { }
}
