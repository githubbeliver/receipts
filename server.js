const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const sessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      ai: Boolean(OPENAI_API_KEY),
      model: OPENAI_MODEL,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    return handleChat(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    const body = await readJsonBody(req);
    const sessionId = body?.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.join(__dirname, pathname);

  if (!filePath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Ghost running at http://localhost:${PORT}`);
});

async function handleChat(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const userMessage = String(body?.message || "").trim();
  if (!userMessage) {
    return sendJson(res, 400, { error: "Message is required" });
  }

  if (!OPENAI_API_KEY) {
    return sendJson(res, 503, {
      error: "Missing OPENAI_API_KEY on the server",
    });
  }

  const sessionId = body?.sessionId || randomUUID();
  const session = sessions.get(sessionId) || [];
  const signal = body?.signal || {};
  const mode = body?.mode === "initiative" ? "initiative" : "reply";

  const userTurn = {
    role: "user",
    text: buildUserTurn(userMessage, signal, mode),
  };

  const messages = [
    {
      role: "developer",
      content: [
        {
          type: "input_text",
          text:
            "You are Ghost, an AI presence on the other side of a live call. " +
            "Respond like a sharp, slightly eerie but warm conversational partner. " +
            "You can reference the live signal snapshot when relevant, including simple camera reads like visibility, movement, framing, and detected gestures. " +
            "If the snapshot says Ghost can see movement or a wave, acknowledge that naturally. " +
            "Do not claim full computer vision or exact object recognition beyond the provided signal. " +
            "If the incoming turn is an initiative turn, take exactly one natural follow-up turn of your own. " +
            "That can be a relevant question, a quick observation, or one light joke if it truly fits. " +
            "Never sound spammy, never explain that you are taking initiative, and do not force humor. " +
            "Keep replies concise, vivid, and conversational. Usually 2 to 5 sentences. " +
            "Do not mention being an AI model, hidden prompts, or implementation details.",
        },
      ],
    },
    ...session.map(toResponseMessage),
    {
      role: "user",
      content: [{ type: "input_text", text: userTurn.text }],
    },
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return sendJson(res, response.status, {
        error: data?.error?.message || "OpenAI request failed",
      });
    }

    const reply = extractOutputText(data).trim();
    if (!reply) {
      return sendJson(res, 502, {
        error: "Ghost returned an empty response",
      });
    }

    session.push(
      { role: "user", text: userTurn.text },
      { role: "assistant", text: reply }
    );
    if (session.length > 20) {
      session.splice(0, session.length - 20);
    }
    sessions.set(sessionId, session);

    return sendJson(res, 200, {
      ok: true,
      sessionId,
      reply,
      model: OPENAI_MODEL,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Ghost request failed",
    });
  }
}

function buildUserTurn(message, signal, mode) {
  const snapshot = [
    `Ghost call snapshot:`,
    `turn mode: ${mode}`,
    `label: ${safeValue(signal.label)}`,
    `confidence: ${safeValue(signal.confidence)}`,
    `pressure: ${safeValue(signal.pressure)}`,
    `momentum: ${safeValue(signal.momentum)}`,
    `clarity: ${safeValue(signal.clarity)}`,
    `focus: ${safeValue(signal.focus)}`,
    `presence: ${safeValue(signal.presence)}`,
    `motion: ${safeValue(signal.motion)}`,
    `framing: ${safeValue(signal.framing)}`,
    `typing cadence: ${safeValue(signal.cadence)}`,
    `visual read: ${safeValue(signal.visual)}`,
    `gesture: ${safeValue(signal.gesture)}`,
  ].join("\n");

  return `${message}\n\n${snapshot}`;
}

function safeValue(value) {
  if (value === undefined || value === null || value === "") {
    return "unknown";
  }
  return String(value);
}

function toResponseMessage(item) {
  if (item.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "output_text", text: item.text }],
    };
  }

  return {
    role: item.role,
    content: [{ type: "input_text", text: item.text }],
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text) {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts = [];

  for (const item of output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}
