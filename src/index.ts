import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { connectDB, getDB } from "./db.js";
import { requireAuth, signToken, setAuthCookie } from "./auth.js";
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "12mb" }));
app.use(cookieParser());
const db = () => getDB(),
  oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "StudioSpace API" }),
);
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, photoURL, password } = req.body;
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ message: "Name, email and password are required" });
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      password.length < 6
    )
      return res
        .status(400)
        .json({
          message:
            "Password needs uppercase, lowercase and at least 6 characters",
        });
    const normalized = email.toLowerCase().trim();
    if (await db().collection("users").findOne({ email: normalized }))
      return res
        .status(409)
        .json({ message: "An account with this email already exists" });
    const user = {
      name: name.trim(),
      email: normalized,
      photoURL: photoURL || "",
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date(),
    };
    await db().collection("users").insertOne(user);
    res.status(201).json({ message: "Account created" });
  } catch {
    res.status(500).json({ message: "Could not create account" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
        .toLowerCase()
        .trim(),
      user = await db().collection("users").findOne({ email });
    if (
      !user ||
      !(await bcrypt.compare(req.body.password || "", user.passwordHash))
    )
      return res
        .status(401)
        .json({ message: "Email or password is incorrect" });
    setAuthCookie(res, signToken(user));
    res.json({
      message: "Logged in",
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        photoURL: user.photoURL,
      },
    });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});
app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.cookies?.studio_token;
    if (!token) return res.json({ user: null });
    const jwt = (await import("jsonwebtoken")).default;
    const data = jwt.verify(
      token,
      process.env.JWT_SECRET || "development_only_change_this_secret",
    ) as any;
    const user = await db()
      .collection("users")
      .findOne(
        { _id: new ObjectId(data.id) },
        { projection: { passwordHash: 0 } },
      );
    res.json({
      user: user
        ? {
            id: String(user._id),
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
          }
        : null,
    });
  } catch {
    res.json({ user: null });
  }
});
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("studio_token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
  });
  res.json({ message: "Logged out" });
});
app.get("/api/studios", async (req, res) => {
  const filter: any = {};
  if (req.query.category) filter.category = req.query.category;
  const q = String(req.query.q || "");
  if (q)
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
    ];
  const limit = Math.min(Number(req.query.limit) || 60, 100);
  const sort =
    req.query.sort === "top"
      ? { rating: -1, createdAt: -1 }
      : { createdAt: -1 };
  const studios = await db()
    .collection("studios")
    .find(filter)
    .sort(sort as any)
    .limit(limit)
    .toArray();
  res.json({ studios: studios.map((s) => ({ ...s, _id: String(s._id) })) });
});
app.get("/api/studios/:id", async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid studio id" });
  const studio = await db().collection("studios").findOne({ _id: id });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  res.json({ studio: { ...studio, _id: String(studio._id) } });
});
app.post("/api/studios", requireAuth, async (req, res) => {
  const {
    title,
    category,
    hourlyRate,
    securityDeposit,
    maxCapacity,
    location,
    imageUrl,
    overview,
    amenities,
  } = req.body;
  if (!title || !category || !location || !imageUrl || !overview)
    return res
      .status(400)
      .json({ message: "Please complete all required studio details" });
  const doc = {
    title,
    category,
    hourlyRate: Number(hourlyRate),
    securityDeposit: Number(securityDeposit),
    maxCapacity: Number(maxCapacity),
    location,
    imageUrl,
    images: Array.isArray(req.body.images) ? req.body.images : [imageUrl],
    overview,
    amenities: Array.isArray(amenities) ? amenities : [],
    rating: 0,
    reviewCount: 0,
    hostName: (req as any).user.name,
    hostEmail: (req as any).user.email,
    createdAt: new Date(),
  };
  const result = await db().collection("studios").insertOne(doc);
  res
    .status(201)
    .json({ message: "Studio published", id: String(result.insertedId) });
});
app.patch("/api/studios/:id", requireAuth, async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid studio id" });
  const allowed: any = {};
  for (const key of [
    "title",
    "category",
    "location",
    "imageUrl",
    "overview",
    "amenities",
    "images",
    "hourlyRate",
    "securityDeposit",
    "maxCapacity",
  ]) {
    if (req.body[key] !== undefined) allowed[key] = req.body[key];
  }
  for (const key of ["hourlyRate", "securityDeposit", "maxCapacity"]) {
    if (allowed[key] !== undefined) allowed[key] = Number(allowed[key]);
  }
  const result = await db()
    .collection("studios")
    .updateOne(
      { _id: id, hostEmail: (req as any).user.email },
      { $set: { ...allowed, updatedAt: new Date() } },
    );
  if (!result.matchedCount)
    return res
      .status(404)
      .json({ message: "Your studio listing was not found" });
  res.json({ message: "Studio updated" });
});
app.delete("/api/studios/:id", requireAuth, async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid studio id" });
  const result = await db()
    .collection("studios")
    .deleteOne({ _id: id, hostEmail: (req as any).user.email });
  if (!result.deletedCount)
    return res
      .status(404)
      .json({ message: "Your studio listing was not found" });
  res.json({ message: "Studio deleted" });
});
app.get("/api/my/studios", requireAuth, async (req, res) => {
  const studios = await db()
    .collection("studios")
    .find({ hostEmail: (req as any).user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ studios: studios.map((s) => ({ ...s, _id: String(s._id) })) });
});
app.post("/api/bookings", requireAuth, async (req, res) => {
  try {
    const { studioId, date, startTime, endTime } = req.body,
      id = oid(studioId);
    if (!id || !date || !startTime || !endTime || startTime >= endTime)
      return res
        .status(400)
        .json({ message: "Choose a valid date and time range" });
    const studio = await db().collection("studios").findOne({ _id: id });
    if (!studio) return res.status(404).json({ message: "Studio not found" });
    const collision = await db()
      .collection("bookings")
      .findOne({
        studioId: String(id),
        date,
        status: "Confirmed",
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      });
    if (collision)
      return res
        .status(409)
        .json({
          message:
            "That time overlaps with a confirmed booking. Please choose another slot.",
        });
    const hours =
      (new Date(`1970-01-01T${endTime}:00`).getTime() -
        new Date(`1970-01-01T${startTime}:00`).getTime()) /
      3600000;
    if (hours <= 0)
      return res
        .status(400)
        .json({ message: "End time must be after start time" });
    const user = (req as any).user;
    const doc = {
      studioId: String(id),
      studioTitle: studio.title,
      studioImage: studio.imageUrl,
      date,
      startTime,
      endTime,
      total: Math.round(hours * studio.hourlyRate),
      status: "Pending",
      userEmail: user.email,
      userName: user.name,
      createdAt: new Date(),
    };
    const result = await db().collection("bookings").insertOne(doc);
    res
      .status(201)
      .json({
        message: "Booking request submitted",
        id: String(result.insertedId),
      });
  } catch {
    res.status(500).json({ message: "Could not create booking" });
  }
});
app.get("/api/my/bookings", requireAuth, async (req, res) => {
  const bookings = await db()
    .collection("bookings")
    .find({ userEmail: (req as any).user.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ bookings: bookings.map((b) => ({ ...b, _id: String(b._id) })) });
});
app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid booking id" });
  const result = await db()
    .collection("bookings")
    .updateOne(
      { _id: id, userEmail: (req as any).user.email, status: "Pending" },
      { $set: { status: "Cancelled", updatedAt: new Date() } },
    );
  if (!result.modifiedCount)
    return res
      .status(400)
      .json({ message: "Only pending bookings can be cancelled" });
  res.json({ message: "Booking cancelled" });
});

app.patch("/api/host/bookings/:id", requireAuth, async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid booking id" });
  const status = String(req.body.status || "");
  if (!["Confirmed", "Completed", "Cancelled"].includes(status))
    return res.status(400).json({ message: "Invalid booking status" });
  const booking = await db().collection("bookings").findOne({ _id: id });
  if (!booking) return res.status(404).json({ message: "Booking not found" });
  const studio = await db()
    .collection("studios")
    .findOne({
      _id: oid(booking.studioId),
      hostEmail: (req as any).user.email,
    });
  if (!studio)
    return res.status(403).json({ message: "You cannot manage this booking" });
  if (status === "Confirmed") {
    const collision = await db()
      .collection("bookings")
      .findOne({
        _id: { $ne: id },
        studioId: booking.studioId,
        date: booking.date,
        status: "Confirmed",
        startTime: { $lt: booking.endTime },
        endTime: { $gt: booking.startTime },
      });
    if (collision)
      return res
        .status(409)
        .json({
          message: "This slot conflicts with another confirmed booking",
        });
  }
  await db()
    .collection("bookings")
    .updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });
  res.json({ message: `Booking ${status.toLowerCase()}` });
});
app.get("/api/host/bookings", requireAuth, async (req, res) => {
  const studios = await db()
    .collection("studios")
    .find({ hostEmail: (req as any).user.email }, { projection: { _id: 1 } })
    .toArray();
  const ids = studios.map((x) => String(x._id));
  const bookings = await db()
    .collection("bookings")
    .find({ studioId: { $in: ids } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json({ bookings: bookings.map((b) => ({ ...b, _id: String(b._id) })) });
});
app.post("/api/reviews", requireAuth, async (req, res) => {
  const { studioId, rating, comment } = req.body;
  const id = oid(studioId);
  const score = Number(rating);
  if (!id || score < 1 || score > 5 || !comment?.trim())
    return res
      .status(400)
      .json({ message: "A rating and review are required" });
  const user = (req as any).user;
  const result = await db()
    .collection("reviews")
    .insertOne({
      studioId: String(id),
      rating: score,
      comment: String(comment).trim(),
      userName: user.name,
      userEmail: user.email,
      createdAt: new Date(),
    });
  const rows = await db()
    .collection("reviews")
    .find({ studioId: String(id) })
    .toArray();
  const avg = rows.reduce((a, b) => a + b.rating, 0) / rows.length;
  await db()
    .collection("studios")
    .updateOne(
      { _id: id },
      { $set: { rating: Number(avg.toFixed(1)), reviewCount: rows.length } },
    );
  res
    .status(201)
    .json({ message: "Review published", id: String(result.insertedId) });
});
app.get("/api/reviews/:studioId", async (req, res) => {
  const reviews = await db()
    .collection("reviews")
    .find({ studioId: req.params.studioId })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  res.json({ reviews: reviews.map((x) => ({ ...x, _id: String(x._id) })) });
});
app.post("/api/newsletter", async (req, res) => {
  const email = String(req.body.email || "")
    .toLowerCase()
    .trim();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ message: "Enter a valid email address" });
  await db()
    .collection("newsletter")
    .updateOne(
      { email },
      { $setOnInsert: { email, createdAt: new Date() } },
      { upsert: true },
    );
  res.json({ message: "You’re on the list. Thanks for joining!" });
});
app.get("/api/my/wishlist", requireAuth, async (req, res) => {
  const rows = await db()
    .collection("wishlists")
    .find({ userEmail: (req as any).user.email })
    .toArray();
  res.json({ studioIds: rows.map((x) => x.studioId) });
});
app.post("/api/my/wishlist/:studioId", requireAuth, async (req, res) => {
  const studioId = req.params.studioId,
    userEmail = (req as any).user.email;
  const found = await db()
    .collection("wishlists")
    .findOne({ studioId, userEmail });
  if (found) {
    await db().collection("wishlists").deleteOne({ _id: found._id });
    return res.json({ saved: false, message: "Removed from saved studios" });
  }
  await db()
    .collection("wishlists")
    .insertOne({ studioId, userEmail, createdAt: new Date() });
  res.json({ saved: true, message: "Studio saved" });
});
app.post("/api/upload/image", async (req, res) => {
  try {
    const key = process.env.IMGBB_API_KEY;
    if (!key)
      return res
        .status(503)
        .json({
          message:
            "Image upload is not configured. Add IMGBB_API_KEY to the server environment.",
        });
    const image = String(req.body.image || "");
    if (!image)
      return res.status(400).json({ message: "Choose an image first" });
    const form = new URLSearchParams({
      image: image.replace(/^data:image\/\w+;base64,/, ""),
    });
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
      method: "POST",
      body: form,
    });
    const data: any = await response.json();
    if (!response.ok || !data.success)
      return res
        .status(400)
        .json({ message: data.error?.message || "Image upload failed" });
    res.json({ url: data.data.url, displayUrl: data.data.display_url });
  } catch {
    return res.status(500).json({ message: "Image upload failed" });
  }
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const email = (req as any).user.email;
  const [studios, bookings, hostBookings] = await Promise.all([
    db().collection("studios").countDocuments({ hostEmail: email }),
    db().collection("bookings").countDocuments({ userEmail: email }),
    db()
      .collection("bookings")
      .countDocuments({
        studioId: {
          $in: (
            await db()
              .collection("studios")
              .find({ hostEmail: email }, { projection: { _id: 1 } })
              .toArray()
          ).map((x) => String(x._id)),
        },
      }),
  ]);
  res.json({ studios, bookings, hostBookings });
});
const port = Number(process.env.PORT) || 5000;
connectDB()
  .then(() =>
    app.listen(port, () => console.log(`StudioSpace API running on ${port}`)),
  )
  .catch((err) => {
    console.error("MongoDB connection failed", err);
    process.exit(1);
  });
