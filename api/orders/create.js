const { readJSON, writeJSON } = require("../utils/db");
const { sendMail } = require("../utils/mailer");
const { randomUUID } = require("crypto");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { platform, service, username, amount, paymentMethod, proof } = req.body;

  if (!platform || !service || !username || !amount || !paymentMethod || !proof) {
    return res.status(400).json({ error: "Missing fields" });
  }

  let orders = readJSON("orders.json");

  const order = {
    id: randomUUID(),
    platform,
    service,
    username,
    amount,
    paymentMethod,
    proof, // base64 image
    status: "Pending",
    createdAt: new Date().toISOString(),
  };

  orders.push(order);
  writeJSON("orders.json", orders);

  // Send email to admin
  try {
    await sendMail(
      process.env.GMAIL_USER,
      `New Order: ${order.platform} - ${order.service}`,
      `
        <h3>New Order Received</h3>
        <p><b>Platform:</b> ${order.platform}</p>
        <p><b>Service:</b> ${order.service}</p>
        <p><b>Username:</b> ${order.username}</p>
        <p><b>Amount:</b> ${order.amount}</p>
        <p><b>Payment:</b> ${order.paymentMethod}</p>
        <p><b>Status:</b> Pending</p>
        <p><b>Time:</b> ${order.createdAt}</p>
        <img src="${order.proof}" width="300"/>
      `
    );
  } catch (e) {
    console.error("Email failed:", e);
  }

  res.json({ success: true, order });
};
