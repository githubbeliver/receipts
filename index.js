const fs = require("fs");
const path = require("path");

module.exports = async (req, res) => {
  try {
    const filePath = path.join(__dirname, "public", "index.html");
    const html = fs.readFileSync(filePath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = 200;
    res.end(html);
  } catch (error) {
    res.statusCode = 500;
    res.end("Failed to load Receipts.");
  }
};
