import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const { username, password } = req.body;
  const filePath = path.join(process.cwd(), "data", "users.json");
  const users = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.json({ success: false, message: "Invalid credentials" });

  return res.json({ success: true, user });
}
