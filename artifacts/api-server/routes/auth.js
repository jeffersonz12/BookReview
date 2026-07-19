import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User, Book, Review } from "../models.js";

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}

function formatUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    classIds: (user.classIds || []).map((id) => id.toString()),
    favoriteBookIds: (user.favoriteBookIds || []).map((id) => id.toString()),
    nameForcedBy: user.nameForcedBy ? user.nameForcedBy.toString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post("/auth/register", async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) { res.status(400).json({ error: "Username and password are required" }); return; }
  if (username.length < 2) { res.status(400).json({ error: "Username must be at least 2 characters" }); return; }
  if (password.length < 6) { res.status(400).json({ error: "Password must be at least 6 characters" }); return; }

  const existing = await User.findOne({ username: username.toLowerCase() });
  if (existing) { res.status(409).json({ error: "Username already taken" }); return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ username: username.toLowerCase(), passwordHash, displayName: displayName || null, role: "student", classIds: [] });

  req.session.userId = user._id.toString();
  req.session.username = user.username;
  req.session.role = user.role;

  res.status(201).json({ user: formatUser(user) });
});

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const user = await User.findOne({ username: username.toLowerCase() });
  if (!user) { res.status(401).json({ error: "Invalid credentials" }); return; }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }

  req.session.userId = user._id.toString();
  req.session.username = user.username;
  req.session.role = user.role;

  res.json({ user: formatUser(user) });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json(formatUser(user));
});

router.put("/users/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (req.body.displayName !== undefined) {
    if (user.nameForcedBy) {
      res.status(403).json({ error: "Your display name has been set by an admin and cannot be changed" }); return;
    }
    user.displayName = req.body.displayName?.trim() || null;
  }

  await user.save();
  res.json(formatUser(user));
});

router.get("/users/me/reviews", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  const reviews = await Review.find({ userId: new mongoose.Types.ObjectId(userId) }).sort({ createdAt: -1 });
  const bookIds = [...new Set(reviews.map((r) => r.bookId.toString()))];
  const books = await Book.find({ _id: { $in: bookIds } }).lean();
  const bookMap = Object.fromEntries(books.map((b) => [b._id.toString(), b]));
  res.json(reviews.map((r) => ({
    id: r._id.toString(),
    bookId: r.bookId.toString(),
    bookTitle: bookMap[r.bookId.toString()]?.title || "Unknown",
    bookAuthor: bookMap[r.bookId.toString()]?.author || "",
    bookCoverUrl: bookMap[r.bookId.toString()]?.coverUrl || null,
    rating: r.rating,
    text: r.text,
    spoiler: r.spoiler,
    flagged: r.flagged,
    hidden: r.hidden,
    editCount: r.editCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/books/:bookId/favorite", requireAuth, async (req, res) => {
  const { bookId } = req.params;
  if (!mongoose.isValidObjectId(bookId)) { res.status(400).json({ error: "Invalid book ID" }); return; }
  const user = await User.findById(req.session.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const bookObjId = new mongoose.Types.ObjectId(bookId);
  const idx = (user.favoriteBookIds || []).findIndex((id) => id.equals(bookObjId));
  if (idx === -1) {
    user.favoriteBookIds = [...(user.favoriteBookIds || []), bookObjId];
  } else {
    user.favoriteBookIds.splice(idx, 1);
  }
  await user.save();
  res.json({ favorited: idx === -1, favoriteBookIds: user.favoriteBookIds.map((id) => id.toString()) });
});

export default router;
