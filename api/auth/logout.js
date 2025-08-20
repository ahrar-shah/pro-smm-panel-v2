module.exports = (req, res) => {
  res.setHeader("Set-Cookie", "uid=; Path=/; Max-Age=0");
  res.json({ success: true });
};
