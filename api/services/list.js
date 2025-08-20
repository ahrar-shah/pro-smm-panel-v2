const { readJSON, writeJSON } = require("../utils/db");

module.exports = (req, res) => {
  if (req.method === "GET") {
    const services = readJSON("services.json");
    return res.json({ services });
  }

  if (req.method === "POST") {
    const { platform, name, price } = req.body;
    let services = readJSON("services.json");

    let platformServices = services.find((s) => s.platform === platform);
    if (!platformServices) {
      platformServices = { platform, services: [] };
      services.push(platformServices);
    }

    platformServices.services.push({
      name,
      price,
      active: true,
    });

    writeJSON("services.json", services);
    return res.json({ success: true, services });
  }

  if (req.method === "DELETE") {
    const { platform, name } = req.body;
    let services = readJSON("services.json");

    const idx = services.findIndex((s) => s.platform === platform);
    if (idx !== -1) {
      services[idx].services = services[idx].services.filter((x) => x.name !== name);
    }

    writeJSON("services.json", services);
    return res.json({ success: true, services });
  }

  res.status(405).end();
};
