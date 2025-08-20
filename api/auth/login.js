const { readJSON } = require("../utils/db");

module.exports = (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body;

  let users = readJSON("users.json");
  const user = users.find(
    (u) => (u.username === username || u.email === username) && u.password === password
  );

  if (!user) return res.status(400).json({ error: "Invalid credentials" });

  res.setHeader("Set-Cookie", `uid=${user.id}; Path=/; HttpOnly`);
  res.json({ success: true, user });
};
