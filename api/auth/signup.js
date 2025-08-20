const { readJSON, writeJSON } = require("../utils/db");
const { randomUUID } = require("crypto");

module.exports = (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { username, name, email, password } = req.body;

  let users = readJSON("users.json");
  if (users.find((u) => u.username === username || u.email === email)) {
    return res.status(400).json({ error: "User already exists" });
  }

  const newUser = {
    id: randomUUID(),
    username,
    name,
    email,
    password, // plain for demo, hash in prod
  };

  users.push(newUser);
  writeJSON("users.json", users);

  res.setHeader("Set-Cookie", `uid=${newUser.id}; Path=/; HttpOnly`);
  res.json({ success: true, user: newUser });
};
