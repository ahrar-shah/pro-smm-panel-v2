import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  const { username, name, email, password } = req.body;
  const filePath = path.join(process.cwd(), "data", "users.json");
  const users = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: "Username already exists" });
  }

  const newUser = { id: Date.now(), username, name, email, password };
  users.push(newUser);
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

  return res.json({ success: true, user: newUser });
}
