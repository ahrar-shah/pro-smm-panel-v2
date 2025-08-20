import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import fs from "fs-extra";
import path from "path";
import multer from "multer";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const DB_DIR = path.join(__dirname, "db");
const USERS_FILE = path.join(DB_DIR, "users.json");
const ORDERS_FILE = path.join(DB_DIR, "orders.json");
const SERVICES_FILE = path.join(DB_DIR, "services.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

await fs.ensureDir(DB_DIR);
await fs.ensureDir(UPLOADS_DIR);
if (!(await fs.pathExists(USERS_FILE))) await fs.writeJSON(USERS_FILE, []);
if (!(await fs.pathExists(ORDERS_FILE))) await fs.writeJSON(ORDERS_FILE, []);
if (!(await fs.pathExists(SERVICES_FILE))) await fs.writeJSON(SERVICES_FILE, []);

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
  })
);

app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// Multer for screenshot uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});
const upload = multer({ storage });

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
});

// Helpers
const readJSON = async (file) => (await fs.readJSON(file)) || [];
const writeJSON = async (file, data) => fs.writeJSON(file, data, { spaces: 2 });

const authRequired = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};

const isAdmin = (req) =>
  req.session?.user?.email &&
  process.env.GMAIL_USER &&
  req.session.user.email.toLowerCase() === process.env.GMAIL_USER.toLowerCase();

const adminRequired = (req, res, next) => {
  if (!authRequired) return;
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });
  next();
};

// ===== Auth =====
app.post("/api/signup", async (req, res) => {
  try {
    const { username, name, email, phone, password } = req.body;
    if (!username || !name || !email || !phone || !password)
      return res.status(400).json({ error: "All fields required" });

    const users = await readJSON(USERS_FILE);
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return res.status(409).json({ error: "Username already exists" });
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
      return res.status(409).json({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      name,
      email,
      phone,
      password: hash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeJSON(USERS_FILE, users);
    req.session.user = { id: user.id, username, name, email, phone };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = await readJSON(USERS_FILE);
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });
    req.session.user = { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null, admin: isAdmin(req) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ===== Services =====
app.get("/api/services", async (req, res) => {
  const services = await readJSON(SERVICES_FILE);
  res.json({ services });
});

app.post("/api/admin/services/add", authRequired, adminRequired, async (req, res) => {
  const { platform, name, price } = req.body;
  if (!platform || !name || !price) return res.status(400).json({ error: "platform, name, price required" });
  const services = await readJSON(SERVICES_FILE);
  let platformBlock = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (!platformBlock) {
    platformBlock = { platform, services: [] };
    services.push(platformBlock);
  }
  if (platformBlock.services.some((s) => s.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: "Service already exists" });

  platformBlock.services.push({ name, price: Number(price), active: true });
  await writeJSON(SERVICES_FILE, services);
  res.json({ ok: true, services });
});

app.post("/api/admin/services/delete", authRequired, adminRequired, async (req, res) => {
  const { platform, name } = req.body;
  const services = await readJSON(SERVICES_FILE);
  const pIdx = services.findIndex((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (pIdx === -1) return res.status(404).json({ error: "Platform not found" });
  services[pIdx].services = services[pIdx].services.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
  await writeJSON(SERVICES_FILE, services);
  res.json({ ok: true, services });
});

app.post("/api/admin/services/toggle", authRequired, adminRequired, async (req, res) => {
  const { platform, name, active } = req.body;
  const services = await readJSON(SERVICES_FILE);
  const pb = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (!pb) return res.status(404).json({ error: "Platform not found" });
  const sv = pb.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!sv) return res.status(404).json({ error: "Service not found" });
  sv.active = Boolean(active);
  await writeJSON(SERVICES_FILE, services);
  res.json({ ok: true, services });
});

// ===== Orders =====
app.post("/api/order", authRequired, upload.single("screenshot"), async (req, res) => {
  try {
    const { platform, service, quantity, link, note, payment } = req.body;
    if (!platform || !service || !quantity || !link || !payment)
      return res.status(400).json({ error: "Missing fields" });

    const services = await readJSON(SERVICES_FILE);
    const pb = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
    const sv = pb?.services.find((s) => s.name.toLowerCase() === service.toLowerCase() && s.active);
    if (!sv) return res.status(400).json({ error: "Service not available" });

    const qty = Math.max(1, Number(quantity || 1));
    const price = Math.round(sv.price * qty * 100) / 100;

    const orders = await readJSON(ORDERS_FILE);
    const id = Date.now().toString(); // simple order id
    const screenshot = req.file
      ? { filename: req.file.originalname, storedAs: path.basename(req.file.path), path: req.file.path }
      : null;

    const order = {
      id,
      userId: req.session.user.id,
      user: {
        username: req.session.user.username,
        name: req.session.user.name,
        email: req.session.user.email,
        phone: req.session.user.phone,
      },
      platform,
      service,
      quantity: qty,
      price,
      payment, // EasyPaisa / JazzCash
      link,
      note: note || "",
      screenshot,
      status: "in progress",
      createdAt: new Date().toISOString(),
    };
    orders.push(order);
    await writeJSON(ORDERS_FILE, orders);

    // Email to admin (your Gmail)
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: `New Order #${id} from ${order.user.name}`,
      html: `
        <h3>New SMM Order</h3>
        <p><b>Order ID:</b> ${id}</p>
        <p><b>Platform:</b> ${platform}</p>
        <p><b>Service:</b> ${service}</p>
        <p><b>Quantity:</b> ${qty}</p>
        <p><b>Price:</b> ${price} PKR</p>
        <p><b>Payment:</b> ${payment}</p>
        <p><b>Link:</b> ${link}</p>
        <p><b>Note:</b> ${order.note || "-"}</p>
        <hr/>
        <p><b>User:</b> ${order.user.name} (@${order.user.username})</p>
        <p><b>Email:</b> ${order.user.email}</p>
        <p><b>Phone:</b> ${order.user.phone}</p>
        <p><b>Time:</b> ${order.createdAt}</p>
      `,
      attachments: order.screenshot
        ? [{ filename: order.screenshot.filename || "proof.png", path: order.screenshot.path }]
        : [],
    });

    res.json({ ok: true, orderId: id, price });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Order failed" });
  }
});

app.get("/api/admin/orders", authRequired, adminRequired, async (req, res) => {
  const orders = await readJSON(ORDERS_FILE);
  res.json({ orders: orders.sort((a, b) => b.id.localeCompare(a.id)) });
});

app.post("/api/admin/orders/status", authRequired, adminRequired, async (req, res) => {
  const { id, status } = req.body; // "done" | "in progress"
  const orders = await readJSON(ORDERS_FILE);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx].status = status;
  await writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true });
});

// Fallback to index
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SMM Panel running on ${process.env.BASE_URL || "http://localhost:" + PORT}`);
});
