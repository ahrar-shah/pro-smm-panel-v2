const { readJSON } = require("../utils/db");
const cookie = require("cookie");

module.exports = (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const uid = cookies.uid;
  if (!uid) return res.json({ user: null });

  let users = readJSON("users.json");
  const user = users.find((u) => u.id === uid);
  if (!user) return res.json({ user: null });

  res.json({ user });
};
