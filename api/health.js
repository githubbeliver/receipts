const { DEFAULT_MODEL, getOpenAiConfig } = require("../lib/receipts");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { apiKey, model = DEFAULT_MODEL } = getOpenAiConfig();
  res.status(200).json({
    ok: true,
    ai: Boolean(apiKey),
    model,
  });
};
