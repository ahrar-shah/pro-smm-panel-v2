import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import multer from "multer";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage instead of JSON files
let users = [];
let orders = [];
let services = [];

// Initialize with some default services if empty
if (services.length === 0) {
  services = [
    {
      platform: "YouTube",
      services: [
        { name: "Likes", price: 100, active: true },
        { name: "Subscribers", price: 200, active: true },
        { name: "Views", price: 50, active: true }
      ]
    },
    {
      platform: "Instagram",
      services: [
        { name: "Likes", price: 150, active: true },
        { name: "Followers", price: 300, active: true },
        { name: "Comments", price: 200, active: true }
      ]
    },
    {
      platform: "TikTok",
      services: [
        { name: "Likes", price: 120, active: true },
        { name: "Followers", price: 250, active: true },
        { name: "Views", price: 80, active: true }
      ]
    }
  ];
}

// For Vercel, we need to handle file uploads differently
const memoryStorage = multer.memoryStorage();
const upload = multer({ storage: memoryStorage });

// Nodemailer transporter
let transporter;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS },
  });
} else {
  console.log("Email notifications disabled - GMAIL_USER/GMAIL_PASS not set");
}

// Session configuration for Vercel
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// If in production, trust the proxy (Vercel)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
  sessionConfig.cookie.secure = true;
}

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session(sessionConfig));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// CORS middleware for Vercel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Helpers
const authRequired = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  next();
};

const isAdmin = (req) =>
  req.session?.user?.email &&
  process.env.GMAIL_USER &&
  req.session.user.email.toLowerCase() === process.env.GMAIL_USER.toLowerCase();

const adminRequired = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });
  next();
};

// ===== Auth =====
app.post("/api/signup", async (req, res) => {
  try {
    const { username, name, email, phone, password } = req.body;
    if (!username || !name || !email || !phone || !password)
      return res.status(400).json({ error: "All fields required" });

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
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });
    req.session.user = { id: user.id, username: user.username, name: user.name, email: user.email, phone: user.phone };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error("Login error:", e);
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
  res.json({ services });
});

app.post("/api/admin/services/add", authRequired, adminRequired, async (req, res) => {
  const { platform, name, price } = req.body;
  if (!platform || !name || !price) return res.status(400).json({ error: "platform, name, price required" });
  
  let platformBlock = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (!platformBlock) {
    platformBlock = { platform, services: [] };
    services.push(platformBlock);
  }
  
  if (platformBlock.services.some((s) => s.name.toLowerCase() === name.toLowerCase()))
    return res.status(409).json({ error: "Service already exists" });

  platformBlock.services.push({ name, price: Number(price), active: true });
  res.json({ ok: true, services });
});

app.post("/api/admin/services/delete", authRequired, adminRequired, async (req, res) => {
  const { platform, name } = req.body;
  const pIdx = services.findIndex((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (pIdx === -1) return res.status(404).json({ error: "Platform not found" });
  services[pIdx].services = services[pIdx].services.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
  res.json({ ok: true, services });
});

app.post("/api/admin/services/toggle", authRequired, adminRequired, async (req, res) => {
  const { platform, name, active } = req.body;
  const pb = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
  if (!pb) return res.status(404).json({ error: "Platform not found" });
  const sv = pb.services.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!sv) return res.status(404).json({ error: "Service not found" });
  sv.active = Boolean(active);
  res.json({ ok: true, services });
});

// ===== Orders =====
app.post("/api/order", authRequired, upload.single("screenshot"), async (req, res) => {
  try {
    const { platform, service, quantity, link, note, payment } = req.body;
    if (!platform || !service || !quantity || !link || !payment)
      return res.status(400).json({ error: "Missing fields" });

    const pb = services.find((p) => p.platform.toLowerCase() === platform.toLowerCase());
    const sv = pb?.services.find((s) => s.name.toLowerCase() === service.toLowerCase() && s.active);
    if (!sv) return res.status(400).json({ error: "Service not available" });

    const qty = Math.max(1, Number(quantity || 1));
    const price = Math.round(sv.price * qty * 100) / 100;

    const id = Date.now().toString(); // simple order id
    const screenshot = req.file
      ? { 
          filename: req.file.originalname, 
          buffer: req.file.buffer.toString('base64'),
          mimetype: req.file.mimetype
        }
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

    // Email to admin (your Gmail)
    if (transporter) {
      try {
        const mailOptions = {
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
          `
        };

        if (screenshot) {
          mailOptions.attachments = [{
            filename: screenshot.filename || "proof.png",
            content: screenshot.buffer,
            encoding: 'base64'
          }];
        }

        await transporter.sendMail(mailOptions);
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }
    }

    res.json({ ok: true, orderId: id, price });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Order failed" });
  }
});

app.get("/api/admin/orders", authRequired, adminRequired, async (req, res) => {
  res.json({ orders: orders.sort((a, b) => b.id.localeCompare(a.id)) });
});

app.post("/api/admin/orders/status", authRequired, adminRequired, async (req, res) => {
  const { id, status } = req.body; // "done" | "in progress"
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return res.status(404).json({ error: "Order not found" });
  orders[idx].status = status;
  res.json({ ok: true });
});

// Get user orders
app.get("/api/my-orders", authRequired, async (req, res) => {
  const userOrders = orders.filter(o => o.userId === req.session.user.id)
                          .sort((a, b) => b.id.localeCompare(a.id));
  res.json({ orders: userOrders });
});

// Serve dashboard and other pages
app.get("/dashboard.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/");
  }
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/payments.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "payments.html"));
});

app.get("/terms.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

app.get("/contact.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "contact.html"));
});

// Health check endpoint for Vercel
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Fallback to index
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Export the app for Vercel
export default app;
