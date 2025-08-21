// server.js
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MongoDB Connection =====
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Schemas =====
const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});

const ServiceSchema = new mongoose.Schema({
  name: String,
  price: Number
});

const OrderSchema = new mongoose.Schema({
  userEmail: String,
  service: String,
  username: String,
  quantity: Number,
  payment: String,
  proof: String,
  note: String,
  status: { type: String, default: "in progress" },
  time: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Service = mongoose.model("Service", ServiceSchema);
const Order = mongoose.model("Order", OrderSchema);

// ===== Middlewares =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ===== Session Config =====
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "change_me_in_production",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: {
    secure: process.env.NODE_ENV === "production", // only https in production
    httpOnly: true,
    maxAge: 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  }
};
app.use(session(sessionConfig));

// ===== File Upload Config =====
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ===== Auth Middleware =====
const authRequired = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};

// ===== Routes =====

// --- SignUp ---
app.post("/api/signup", async (req, res) => {
  const { email, password } = req.body;
  if (await User.findOne({ email })) return res.json({ error: "Email already exists" });

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ email, password: hashed });
  res.json({ success: true });
});

// --- Login ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.json({ error: "Invalid email or password" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Invalid email or password" });

  req.session.user = { email };
  res.json({ success: true });
});

// --- Logout ---
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// --- Get Logged in User ---
app.get("/api/me", authRequired, (req, res) => {
  res.json(req.session.user);
});

// --- Get Services ---
app.get("/api/services", authRequired, async (req, res) => {
  const services = await Service.find();
  res.json(services);
});

// --- Place Order ---
app.post("/api/order", authRequired, upload.single("proof"), async (req, res) => {
  try {
    const { service, username, quantity, payment, note } = req.body;
    const proof = req.file ? "/uploads/" + req.file.filename : null;

    await Order.create({
      userEmail: req.session.user.email,
      service,
      username,
      quantity,
      payment,
      proof,
      note
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ error: "Order failed" });
  }
});

// ===== Admin Routes =====
app.get("/api/admin/orders", authRequired, async (req, res) => {
  // Only allow specific admin email
  if (req.session.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const orders = await Order.find();
  res.json(orders);
});

app.post("/api/admin/update/:id", authRequired, async (req, res) => {
  if (req.session.user.email !== process.env.ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }
  await Order.findByIdAndUpdate(req.params.id, { status: req.body.status });
  res.json({ success: true });
});

// ===== Start Server =====
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
