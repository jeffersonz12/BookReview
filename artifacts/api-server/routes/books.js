import { Router } from "express";
import mongoose from "mongoose";
import { Book, Review } from "../models.js";

const router = Router();

function optionalAuth(req, res, next) { next(); }
function requireAuth(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (req.session.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

async function getBookWithStats(book) {
  const reviews = await Review.find({ bookId: book._id, hidden: false });
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    openLibKey: book.openLibKey,
    description: book.description,
    isArchived: book.isArchived,
    isBanned: book.isBanned || false,
    classIds: (book.classIds || []).map((id) => id.toString()),
    averageRating: Math.round(avgRating * 10) / 10,
    reviewCount: reviews.length,
    createdAt: book.createdAt.toISOString(),
  };
}

router.get("/books", optionalAuth, async (req, res) => {
  const { search, classId, includeArchived, includeBanned } = req.query;
  const isAdmin = req.session?.role === "admin";
  const filter = {};

  if (!(isAdmin && includeBanned === "true")) filter.isBanned = false;

  if (isAdmin && includeArchived === "true") {
  } else if (!search) {
    filter.isArchived = false;
  }

  if (search) filter.$or = [{ title: { $regex: search, $options: "i" } }, { author: { $regex: search, $options: "i" } }];
  if (classId && mongoose.isValidObjectId(classId)) filter.classIds = new mongoose.Types.ObjectId(classId);

  const books = await Book.find(filter).sort({ createdAt: -1 });
  res.json(await Promise.all(books.map((b) => getBookWithStats(b))));
});

router.get("/books/openlib/search", requireAuth, async (req, res) => {
  const q = req.query.q;
  if (!q) { res.json([]); return; }
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,cover_i,first_publish_year&limit=20`;
  const resp = await fetch(url);
  if (!resp.ok) { res.status(502).json({ error: "Open Library unavailable" }); return; }
  const data = await resp.json();
  res.json((data.docs || []).map((doc) => ({
    openLibKey: doc.key || "",
    title: doc.title || "",
    author: (doc.author_name || []).join(", ") || "Unknown",
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
    description: null,
    firstPublishYear: doc.first_publish_year || null,
  })));
});

router.post("/books", requireAdmin, async (req, res) => {
  const { title, author, coverUrl, openLibKey, description, classIds } = req.body;
  if (!title || !author) { res.status(400).json({ error: "Title and author are required" }); return; }

  if (openLibKey) {
    const existing = await Book.findOne({ openLibKey });
    if (existing) {
      if (existing.isArchived) { existing.isArchived = false; await existing.save(); }
      return res.status(200).json(await getBookWithStats(existing));
    }
  }

  const book = await Book.create({
    title, author, coverUrl: coverUrl || null, openLibKey: openLibKey || null,
    description: description || null, isArchived: false, isBanned: false,
    classIds: (classIds || []).map((id) => new mongoose.Types.ObjectId(id)),
  });
  res.status(201).json(await getBookWithStats(book));
});

router.get("/books/:bookId", optionalAuth, async (req, res) => {
  const { bookId } = req.params;
  if (!mongoose.isValidObjectId(bookId)) { res.status(404).json({ error: "Book not found" }); return; }
  const book = await Book.findById(bookId);
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  if (book.isBanned && req.session?.role !== "admin") { res.status(404).json({ error: "Book not found" }); return; }
  const reviews = await Review.find({ bookId: book._id, hidden: false });
  const keys = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };
  const ratingCounts = { one: 0, two: 0, three: 0, four: 0, five: 0 };
  reviews.forEach((r) => { if (keys[r.rating]) ratingCounts[keys[r.rating]]++; });
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  res.json({
    id: book._id.toString(), title: book.title, author: book.author, coverUrl: book.coverUrl,
    openLibKey: book.openLibKey, description: book.description, isArchived: book.isArchived,
    isBanned: book.isBanned || false,
    classIds: book.classIds.map((id) => id.toString()),
    averageRating: Math.round(avgRating * 10) / 10, reviewCount: reviews.length,
    ratingBreakdown: ratingCounts, createdAt: book.createdAt.toISOString(),
  });
});

router.put("/books/:bookId", requireAdmin, async (req, res) => {
  const { bookId } = req.params;
  const { title, author, coverUrl, description, isArchived, isBanned, classIds } = req.body;
  const book = await Book.findByIdAndUpdate(bookId, {
    ...(title !== undefined && { title }),
    ...(author !== undefined && { author }),
    ...(coverUrl !== undefined && { coverUrl }),
    ...(description !== undefined && { description }),
    ...(isArchived !== undefined && { isArchived }),
    ...(isBanned !== undefined && { isBanned }),
    ...(classIds !== undefined && { classIds: classIds.map((id) => new mongoose.Types.ObjectId(id)) }),
  }, { new: true });
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  res.json(await getBookWithStats(book));
});

router.put("/books/:bookId/hide", requireAdmin, async (req, res) => {
  const book = await Book.findById(req.params.bookId);
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  book.isArchived = !book.isArchived;
  await book.save();
  res.json(await getBookWithStats(book));
});

router.put("/books/:bookId/ban", requireAdmin, async (req, res) => {
  const book = await Book.findById(req.params.bookId);
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }
  book.isBanned = !book.isBanned;
  if (book.isBanned) book.isArchived = false;
  await book.save();
  res.json(await getBookWithStats(book));
});

router.delete("/books/:bookId", requireAdmin, async (req, res) => {
  await Book.findByIdAndUpdate(req.params.bookId, { isArchived: true });
  res.json({ success: true, message: "Book archived" });
});

export default router;
