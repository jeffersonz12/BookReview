import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";
import authRouter from "./routes/auth.js";
import booksRouter from "./routes/books.js";
import reviewsRouter from "./routes/reviews.js";
import classesRouter from "./routes/classes.js";
import assignmentsRouter from "./routes/assignments.js";
import adminRouter from "./routes/admin.js";
import notificationsRouter from "./routes/notifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(__dirname, "../book-reviews");

const { MONGODB_URI, SESSION_SECRET } = process.env;
const PORT = 5000;

if (!MONGODB_URI) throw new Error("MONGODB_URI environment variable is required");
if (!SESSION_SECRET) throw new Error("SESSION_SECRET environment variable is required");

await mongoose.connect(MONGODB_URI);
console.log("Connected to MongoDB");

const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: MONGODB_URI, ttl: 7 * 24 * 60 * 60 }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

app.use("/api", authRouter);
app.use("/api", booksRouter);
app.use("/api", reviewsRouter);
app.use("/api", classesRouter);
app.use("/api", assignmentsRouter);
app.use("/api", adminRouter);
app.use("/api", notificationsRouter);
app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

app.use(express.static(FRONTEND));
app.get("/{*path}", (_req, res) => res.sendFile(path.join(FRONTEND, "index.html")));

app.listen(Number(PORT), () => {
  console.log(`Server listening on port ${PORT}`);
});
