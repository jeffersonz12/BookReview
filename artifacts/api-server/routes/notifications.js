import { Router } from "express";
import mongoose from "mongoose";
import { Notification } from "../models.js";

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session?.userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  next();
}

function fmt(n) {
  return {
    id: n._id.toString(),
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.session.userId);
  const notifs = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json(notifs.map(fmt));
});

router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.session.userId);
  const count = await Notification.countDocuments({ userId, read: false });
  res.json({ count });
});

router.put("/notifications/:id/read", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ error: "Not found" }); return; }
  await Notification.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(id), userId: new mongoose.Types.ObjectId(req.session.userId) },
    { read: true }
  );
  res.json({ success: true });
});

router.put("/notifications/read-all", requireAuth, async (req, res) => {
  await Notification.updateMany(
    { userId: new mongoose.Types.ObjectId(req.session.userId), read: false },
    { read: true }
  );
  res.json({ success: true });
});

router.delete("/notifications/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) { res.status(404).json({ error: "Not found" }); return; }
  await Notification.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(id),
    userId: new mongoose.Types.ObjectId(req.session.userId),
  });
  res.json({ success: true });
});

router.delete("/notifications", requireAuth, async (req, res) => {
  await Notification.deleteMany({ userId: new mongoose.Types.ObjectId(req.session.userId) });
  res.json({ success: true });
});

export default router;
