const { readJSON, writeJSON } = require("../utils/db");

module.exports = (req, res) => {
  if (req.method === "GET") {
    const orders = readJSON("orders.json");
    return res.json({ orders });
  }

  if (req.method === "POST") {
    const { id, status } = req.body;
    let orders = readJSON("orders.json");
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) return res.status(404).json({ error: "Order not found" });

    orders[idx].status = status;
    writeJSON("orders.json", orders);
    return res.json({ success: true, order: orders[idx] });
  }

  res.status(405).end();
};
