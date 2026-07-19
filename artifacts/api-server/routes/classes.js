import { Router } from "express";
import mongoose from "mongoose";
import { Class, User } from "../models.js";

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

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function formatClass(cls) {
  return {
    id: cls._id.toString(), name: cls.name, description: cls.description, code: cls.code,
    bookIds: cls.bookIds.map((id) => id.toString()), studentCount: cls.studentIds?.length ?? 0,
    createdAt: cls.createdAt.toISOString(),
    createdBy: cls.createdBy ? cls.createdBy.toString() : null,
  };
}

router.get("/classes", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  let classes;
  if (req.session.role === "admin") {
    classes = await Class.find().lean();
  } else {
    const user = await User.findById(userId).lean();
    classes = await Class.find({ _id: { $in: user?.classIds ?? [] } }).lean();
  }
  res.json(classes.map(formatClass));
});

router.post("/classes", requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  let code = generateCode();
  let tries = 0;
  while (await Class.findOne({ code })) { code = generateCode(); if (++tries > 10) break; }
  const cls = await Class.create({ name, description: description || null, code, bookIds: [], studentIds: [], createdBy: new mongoose.Types.ObjectId(req.session.userId) });
  res.status(201).json(formatClass(cls));
});

router.get("/classes/:classId", requireAuth, async (req, res) => {
  const { classId } = req.params;
  if (!mongoose.isValidObjectId(classId)) { res.status(404).json({ error: "Class not found" }); return; }
  const cls = await Class.findById(classId);
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  res.json(formatClass(cls));
});

router.get("/classes/:classId/students", requireAdmin, async (req, res) => {
  const { classId } = req.params;
  if (!mongoose.isValidObjectId(classId)) { res.status(404).json({ error: "Class not found" }); return; }
  const cls = await Class.findById(classId).lean();
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  const students = await User.find({ _id: { $in: cls.studentIds } }).lean();
  res.json(students.map((s) => ({
    id: s._id.toString(),
    username: s.username,
    displayName: s.displayName,
    nameForcedBy: s.nameForcedBy ? s.nameForcedBy.toString() : null,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.put("/classes/:classId", requireAdmin, async (req, res) => {
  const { classId } = req.params;
  const { name, description, bookIds } = req.body;
  const cls = await Class.findByIdAndUpdate(classId, {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(bookIds !== undefined && { bookIds: bookIds.map((id) => new mongoose.Types.ObjectId(id)) }),
  }, { new: true });
  if (!cls) { res.status(404).json({ error: "Class not found" }); return; }
  res.json(formatClass(cls));
});

router.delete("/classes/:classId", requireAdmin, async (req, res) => {
  await Class.findByIdAndDelete(req.params.classId);
  res.json({ success: true, message: "Class deleted" });
});

router.post("/classes/join", requireAuth, async (req, res) => {
  const { code } = req.body;
  const userId = req.session.userId;
  if (!code) { res.status(400).json({ error: "Class code is required" }); return; }
  const cls = await Class.findOne({ code: code.trim().toUpperCase() });
  if (!cls) { res.status(404).json({ error: "No class found with that code" }); return; }
  const userObjId = new mongoose.Types.ObjectId(userId);
  if (!cls.studentIds.some((id) => id.equals(userObjId))) { cls.studentIds.push(userObjId); await cls.save(); }
  await User.findByIdAndUpdate(userId, { $addToSet: { classIds: cls._id } });
  res.json({ success: true, message: "Joined class", class: formatClass(cls) });
});

router.post("/classes/:classId/leave", requireAuth, async (req, res) => {
  const { classId } = req.params;
  const userId = req.session.userId;
  const userObjId = new mongoose.Types.ObjectId(userId);
  await Class.findByIdAndUpdate(classId, { $pull: { studentIds: userObjId } });
  await User.findByIdAndUpdate(userId, { $pull: { classIds: new mongoose.Types.ObjectId(classId) } });
  res.json({ success: true, message: "Left class" });
});

export default router;
