const { generateWithOpenAI, validateInput } = require("../lib/receipts");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const validationError = validateInput(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const result = await generateWithOpenAI(body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || "Server error" });
  }
};
