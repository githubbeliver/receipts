const fs = require("fs");
const path = require("path");
const { DEFAULT_MODEL, generateWithOpenAI, getOpenAiConfig, validateInput } = require("./lib/receipts");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function servePublicFile(res, relativePath, contentType) {
  const filePath = path.join(__dirname, "public", relativePath);
  const content = fs.readFileSync(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.end(content);
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    if (req.url === "/api/health") {
      const { apiKey, model = DEFAULT_MODEL } = getOpenAiConfig();
      sendJson(res, 200, {
        ok: true,
        ai: Boolean(apiKey),
        model,
      });
      return;
    }

    if (req.url === "/api/generate") {
      if (req.method !== "POST") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }

      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const validationError = validateInput(body);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const result = await generateWithOpenAI(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.url === "/app.js") {
      servePublicFile(res, "app.js", "application/javascript; charset=utf-8");
      return;
    }

    if (req.url === "/styles.css") {
      servePublicFile(res, "styles.css", "text/css; charset=utf-8");
      return;
    }

    if (req.url === "/favicon.ico" || req.url === "/favicon.png") {
      res.statusCode = 204;
      res.end();
      return;
    }

    servePublicFile(res, "index.html", "text/html; charset=utf-8");
  } catch (error) {
    if (req.url && req.url.startsWith("/api/")) {
      sendJson(res, 500, { error: error.message || "Server error" });
      return;
    }
    res.statusCode = 500;
    res.end("Failed to load Receipts.");
  }
};
