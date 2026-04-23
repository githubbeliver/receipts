const http = require("http");
const fs = require("fs");
const path = require("path");
const { DEFAULT_MODEL, generateWithOpenAI, getOpenAiConfig, validateInput } = require("./lib/receipts");

const root = __dirname;

function loadDotEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const { apiKey: OPENAI_API_KEY, model: MODEL = DEFAULT_MODEL } = getOpenAiConfig();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
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

function serveFile(req, res, targetPath) {
  const safePath = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(root, safePath);

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const extension = path.extname(absolutePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const validationError = validateInput(body);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return;
      }

      const result = await generateWithOpenAI(body);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Server error" });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      ai: Boolean(OPENAI_API_KEY),
      model: MODEL,
    });
    return;
  }

  const requestedPath = req.url === "/" ? "index.html" : req.url.slice(1);
  serveFile(req, res, requestedPath);
});

server.listen(PORT, () => {
  console.log(`Receipts running at http://localhost:${PORT}`);
  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY is not set. The app will fall back to local analysis.");
  }
});
