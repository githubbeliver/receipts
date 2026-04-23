const templates = {
  builder: {
    label: "Builder mode",
    style: "product-minded builder",
    angle: "turns rough ideas into systems people actually use",
    tone: "confident, grounded, useful",
  },
  operator: {
    label: "Operator mode",
    style: "high-agency operator",
    angle: "makes broken workflows feel clear, fast, and reliable",
    tone: "sharp, composed, execution-heavy",
  },
  creator: {
    label: "Creator mode",
    style: "taste-driven creator",
    angle: "shapes stories, launches, and experiences people remember",
    tone: "clear, expressive, audience-aware",
  },
};

const evidenceInput = document.querySelector("#evidenceInput");
const fileInput = document.querySelector("#fileInput");
const imageInput = document.querySelector("#imageInput");
const generateButton = document.querySelector("#generateButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const downloadImageButton = document.querySelector("#downloadImageButton");
const printButton = document.querySelector("#printButton");
const clearImageButton = document.querySelector("#clearImageButton");
const runtimeNote = document.querySelector("#runtimeNote");
const imagePreview = document.querySelector("#imagePreview");
const imageDropzone = document.querySelector("#imageDropzone");
const imageDropzoneTitle = document.querySelector("#imageDropzoneTitle");
const imageDropzoneText = document.querySelector("#imageDropzoneText");
const imageFileMeta = document.querySelector("#imageFileMeta");
const previewImage = document.querySelector("#previewImage");
const headlineOutput = document.querySelector("#headlineOutput");
const bioOutput = document.querySelector("#bioOutput");
const bulletsOutput = document.querySelector("#bulletsOutput");
const postOutput = document.querySelector("#postOutput");
const signalMap = document.querySelector("#signalMap");
const sourceEvidenceOutput = document.querySelector("#sourceEvidenceOutput");
const interpretedEvidenceOutput = document.querySelector("#interpretedEvidenceOutput");
const artifactCount = document.querySelector("#artifactCount");
const impactCount = document.querySelector("#impactCount");
const traitCount = document.querySelector("#traitCount");
const cardHeadline = document.querySelector("#cardHeadline");
const cardBio = document.querySelector("#cardBio");
const cardHighlights = document.querySelector("#cardHighlights");
const cardTemplate = document.querySelector("#cardTemplate");
const cardMetrics = document.querySelector("#cardMetrics");
const pills = Array.from(document.querySelectorAll(".pill"));

let currentTemplate = "builder";
let lastRender = null;
let renderVersion = 0;
let aiStatus = "unknown";
let renderTimer = null;
let imageDataUrl = "";
let imageFileName = "";

function sentenceCase(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function compactWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeLine(text) {
  return compactWhitespace(text.replace(/^[-*•]\s*/, "").replace(/[“”]/g, '"').replace(/[’]/g, "'"));
}

function splitEvidence(text) {
  return text
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map(normalizeLine)
    .filter(Boolean);
}

function findMetrics(text) {
  const matches =
    text.match(/\b\d[\d,]*(?:\+)?(?:\s?(?:users|students|people|orgs|organizations|teams|hours|days|weeks|months|projects|clients|views|downloads|%|x))?/gi) ||
    [];
  return matches.map((match) => compactWhitespace(match));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function keywordCount(lines, pattern) {
  return lines.filter((line) => pattern.test(line)).length;
}

function detectSignals(lines) {
  const normalized = lines.join(" ").toLowerCase();
  const actionWords = [
    "built",
    "launched",
    "fixed",
    "designed",
    "reworked",
    "led",
    "wrote",
    "shipped",
    "improved",
    "organized",
    "created",
    "grew",
    "scaled",
    "streamlined",
  ];

  const actions = lines
    .filter((line) => actionWords.some((word) => line.toLowerCase().includes(word)))
    .slice(0, 4);

  const metrics = unique(lines.flatMap(findMetrics));
  const impactLine =
    lines.find((line) => /(users|students|people|teams|clients|views|downloads|adoption|revenue|signup|sign up|traction|growth)/i.test(line)) ||
    lines.find((line) => findMetrics(line).length) ||
    lines[lines.length - 1] ||
    "";
  const friction =
    lines.find((line) =>
      /(confusing|broken|bug|drop|slow|hard|messy|never|stuck|issue|problem|manual|chaos|unclear)/i.test(line)
    ) || "";

  const traits = [];
  if (/(weekend|late|2am|deadline|fast|quickly|urgent)/i.test(normalized)) traits.push("moves with urgency");
  if (/(friends|team|org|with|collab|together)/i.test(normalized)) traits.push("collaborates well");
  if (/(users|students|people|felt easy|onboarding|sign up|rsvp|experience)/i.test(normalized)) traits.push("cares about user experience");
  if (/(bug|fixed|reworked|improved|stabilized|reliable|workflow)/i.test(normalized)) traits.push("improves systems under pressure");
  if (/(wrote|copy|story|brand|voice|post|launch)/i.test(normalized)) traits.push("communicates with clarity");
  if (/(built|created|launched|shipped)/i.test(normalized)) traits.push("ships end-to-end");

  const themes = unique([
    keywordCount(lines, /(launch|shipped|built|created)/i) ? "Execution" : "",
    keywordCount(lines, /(copy|story|brand|wrote|post)/i) ? "Communication" : "",
    keywordCount(lines, /(bug|fixed|reworked|workflow|improved|reliable)/i) ? "Problem solving" : "",
    keywordCount(lines, /(users|students|experience|onboarding|signup|sign up|rsvp)/i) ? "User empathy" : "",
  ]);

  return {
    actions,
    metrics,
    impactLine,
    friction,
    traits: unique(traits).slice(0, 4),
    themes: themes.slice(0, 4),
    artifactCount: lines.length,
    impactCount: metrics.length + (impactLine ? 1 : 0),
  };
}

function buildHeadline(template, signals) {
  const config = templates[template];
  const trait = signals.traits[0] || config.angle;
  return `${sentenceCase(config.style)} who ${trait}.`;
}

function buildBio(template, signals) {
  const config = templates[template];
  const actionText = signals.actions.length
    ? signals.actions
        .slice(0, 2)
        .map((line) => line.replace(/[.!?]$/, ""))
        .join(", ")
    : "turns unfinished work into visible momentum";

  const impactText = signals.metrics.length
    ? ` Backed by real proof like ${signals.metrics.slice(0, 2).join(" and ").toLowerCase()}.`
    : "";

  return `${sentenceCase(config.style)} who ${config.angle}. Known for being ${config.tone} while shipping outcomes like this: ${actionText}.${impactText}`;
}

function buildBullets(signals) {
  const bullets = [];

  if (signals.actions[0]) {
    bullets.push(`Turned an early concept into a shipped experience by ${signals.actions[0].replace(/[.!?]$/, "").toLowerCase()}.`);
  }

  if (signals.friction) {
    bullets.push(`Spotted a real adoption problem and responded fast: ${signals.friction.replace(/[.!?]$/, "")}.`);
  }

  if (signals.impactLine) {
    bullets.push(`Connected the work to clear outcomes: ${signals.impactLine.replace(/[.!?]$/, "")}.`);
  }

  if (signals.traits.length) {
    bullets.push(`Operating style: ${signals.traits.join(", ")}.`);
  }

  if (!bullets.length) {
    bullets.push("Takes loose, under-documented work and turns it into outcomes people can understand.");
  }

  return bullets.slice(0, 4);
}

function buildPost(template, signals) {
  const config = templates[template];
  const opener = signals.actions[0]
    ? `Strong work usually starts messy. I recently ${signals.actions[0].replace(/[.!?]$/, "").toLowerCase()}.`
    : "Strong work usually starts messy.";
  const middle = signals.metrics.length
    ? `That effort turned into ${signals.metrics.slice(0, 2).join(" and ").toLowerCase()}, which reminded me that quiet wins deserve better storytelling.`
    : "It reminded me that quiet wins deserve better storytelling, even before they make it into a polished portfolio.";

  return `${opener} ${middle} I'm looking for opportunities where I can be a ${config.style} and help teams ${config.angle}.`;
}

function buildSignalCards(signals) {
  const cards = [];

  if (signals.metrics.length) {
    cards.push({
      title: "Impact proof",
      body: signals.metrics.slice(0, 3).join(" • "),
    });
  }

  if (signals.traits.length) {
    cards.push({
      title: "Working style",
      body: signals.traits.join(" • "),
    });
  }

  if (signals.themes.length) {
    cards.push({
      title: "Themes",
      body: signals.themes.join(" • "),
    });
  }

  if (signals.friction) {
    cards.push({
      title: "Problem spotted",
      body: signals.friction,
    });
  }

  return cards.slice(0, 4);
}

function buildMarkdown(render) {
  return [
    `# ${render.headline}`,
    "",
    "## Signature Bio",
    render.bio,
    "",
    "## Portfolio Bullets",
    ...render.bullets.map((bullet) => `- ${bullet}`),
    "",
    "## Launch-Ready Post",
    render.post,
    "",
    "## Signal Map",
    ...render.signalCards.map((card) => `- **${card.title}:** ${card.body}`),
    "",
    "## Evidence Extraction",
    "### Source Cues",
    ...render.sourceEvidence.map((item) => `- ${item}`),
    "",
    "### Interpreted Strengths",
    ...render.interpretedEvidence.map((item) => `- ${item}`),
  ].join("\n");
}

function setRuntimeNote(message, state = "default") {
  runtimeNote.textContent = message;
  runtimeNote.dataset.state = state;
}

function updateImagePreview() {
  if (!imageDataUrl) {
    imagePreview.dataset.state = "empty";
    imageDropzone.dataset.state = "empty";
    imageDropzoneTitle.textContent = "Add a screenshot receipt";
    imageDropzoneText.textContent =
      "Click to upload a screenshot, dashboard, launch post, analytics panel, or product UI.";
    imageFileMeta.textContent = "PNG, JPG, WEBP, or GIF";
    clearImageButton.hidden = true;
    previewImage.removeAttribute("src");
    previewImage.hidden = true;
    return;
  }

  imagePreview.dataset.state = "loaded";
  imageDropzone.dataset.state = "loaded";
  imageDropzoneTitle.textContent = "Screenshot attached";
  imageDropzoneText.textContent = "Click this card to replace the image with another visual receipt.";
  imageFileMeta.textContent = imageFileName || "Visual receipt ready";
  clearImageButton.hidden = false;
  previewImage.src = imageDataUrl;
  previewImage.hidden = false;
}

function renderSignalMap(cards) {
  signalMap.innerHTML = "";
  cards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "signal-pill-card";

    const title = document.createElement("p");
    title.className = "signal-pill-title";
    title.textContent = card.title;

    const body = document.createElement("p");
    body.className = "signal-pill-body";
    body.textContent = card.body;

    article.append(title, body);
    signalMap.appendChild(article);
  });
}

function renderEvidenceList(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    target.appendChild(li);
  });
}

function renderProofCard(render, signals) {
  cardHeadline.textContent = render.headline;
  cardBio.textContent = render.bio;
  cardTemplate.textContent = templates[currentTemplate].label;
  cardMetrics.textContent = `${signals.artifactCount} artifacts analyzed`;
  cardHighlights.innerHTML = "";

  render.bullets.slice(0, 3).forEach((bullet) => {
    const li = document.createElement("li");
    li.textContent = bullet;
    cardHighlights.appendChild(li);
  });
}

function applyRender(render, signals) {
  lastRender = { ...render, signals };

  headlineOutput.textContent = render.headline;
  bioOutput.textContent = render.bio;
  postOutput.textContent = render.post;

  bulletsOutput.innerHTML = "";
  render.bullets.forEach((bullet) => {
    const li = document.createElement("li");
    li.textContent = bullet;
    bulletsOutput.appendChild(li);
  });

  artifactCount.textContent = String(signals.artifactCount);
  impactCount.textContent = String(signals.impactCount);
  traitCount.textContent = String(signals.traits.length);

  renderSignalMap(render.signalCards);
  renderEvidenceList(sourceEvidenceOutput, render.sourceEvidence);
  renderEvidenceList(interpretedEvidenceOutput, render.interpretedEvidence);
  renderProofCard(render, signals);
}

function buildEvidenceExtraction(signals, lines) {
  const sourceEvidence = unique([
    ...signals.actions.slice(0, 2),
    signals.impactLine,
    signals.friction,
    ...signals.metrics.slice(0, 2).map((metric) => `Observed metric: ${metric}`),
  ]).slice(0, 5);

  const interpretedEvidence = unique([
    signals.traits.length ? `Working style: ${signals.traits.join(", ")}` : "",
    signals.themes.length ? `Themes detected: ${signals.themes.join(", ")}` : "",
    signals.impactLine ? `Likely strongest proof point: ${signals.impactLine}` : "",
    lines[0] ? `Narrative anchor: ${lines[0]}` : "",
  ]).slice(0, 5);

  return { sourceEvidence, interpretedEvidence };
}

function renderLocalOutput() {
  const raw = evidenceInput.value.trim();
  const lines = splitEvidence(raw);
  const signals = detectSignals(lines);
  const extraction = buildEvidenceExtraction(signals, lines);
  const render = {
    headline: buildHeadline(currentTemplate, signals),
    bio: buildBio(currentTemplate, signals),
    bullets: buildBullets(signals),
    post: buildPost(currentTemplate, signals),
    signalCards: buildSignalCards(signals),
    sourceEvidence: extraction.sourceEvidence,
    interpretedEvidence: extraction.interpretedEvidence,
  };

  applyRender(render, signals);
  localStorage.setItem("receipts-draft", evidenceInput.value);
}

function normalizeAiPayload(payload, fallbackSignals) {
  const signalCards = Array.isArray(payload.signalCards)
    ? payload.signalCards
        .filter((card) => card && card.title && card.body)
        .map((card) => ({
          title: sentenceCase(String(card.title)),
          body: compactWhitespace(String(card.body)),
        }))
        .slice(0, 4)
    : [];

  const sourceEvidence =
    Array.isArray(payload.sourceEvidence) && payload.sourceEvidence.length
      ? payload.sourceEvidence.map((item) => compactWhitespace(String(item))).slice(0, 5)
      : buildEvidenceExtraction(fallbackSignals, splitEvidence(evidenceInput.value.trim())).sourceEvidence;

  const interpretedEvidence =
    Array.isArray(payload.interpretedEvidence) && payload.interpretedEvidence.length
      ? payload.interpretedEvidence.map((item) => compactWhitespace(String(item))).slice(0, 5)
      : buildEvidenceExtraction(fallbackSignals, splitEvidence(evidenceInput.value.trim())).interpretedEvidence;

  return {
    headline: compactWhitespace(payload.headline || buildHeadline(currentTemplate, fallbackSignals)),
    bio: compactWhitespace(payload.bio || buildBio(currentTemplate, fallbackSignals)),
    bullets: Array.isArray(payload.bullets) && payload.bullets.length
      ? payload.bullets.map((bullet) => compactWhitespace(String(bullet))).slice(0, 4)
      : buildBullets(fallbackSignals),
    post: compactWhitespace(payload.post || buildPost(currentTemplate, fallbackSignals)),
    signalCards: signalCards.length ? signalCards : buildSignalCards(fallbackSignals),
    sourceEvidence,
    interpretedEvidence,
  };
}

async function renderAiOutput(version) {
  const raw = evidenceInput.value.trim();
  const lines = splitEvidence(raw);
  const fallbackSignals = detectSignals(lines);

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evidence: raw,
      mode: currentTemplate,
      image: imageDataUrl || null,
      hints: {
        traits: fallbackSignals.traits,
        metrics: fallbackSignals.metrics,
        themes: fallbackSignals.themes,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || "AI generation failed");
  }

  const payload = await response.json();
  if (version !== renderVersion) return;

  const signals = {
    ...fallbackSignals,
    artifactCount: payload.analysis?.artifactCount ?? fallbackSignals.artifactCount,
    impactCount: payload.analysis?.impactCount ?? fallbackSignals.impactCount,
    traits: Array.isArray(payload.analysis?.traits) && payload.analysis.traits.length
      ? payload.analysis.traits.slice(0, 4)
      : fallbackSignals.traits,
  };
  const render = normalizeAiPayload(payload, signals);
  applyRender(render, signals);
}

async function renderOutput() {
  renderVersion += 1;
  const version = renderVersion;

  if (!evidenceInput.value.trim() && imageDataUrl) {
    evidenceInput.value = "Uploaded visual receipts for analysis.";
  }
  localStorage.setItem("receipts-draft", evidenceInput.value);

  if (!evidenceInput.value.trim() && !imageDataUrl) {
    renderLocalOutput();
    return;
  }

  if (aiStatus === "offline") {
    renderLocalOutput();
    if (imageDataUrl) {
      setRuntimeNote(
        "Image upload is ready, but screenshot analysis needs the local AI server with OPENAI_API_KEY.",
        "warning"
      );
    }
    return;
  }

  setRuntimeNote(imageDataUrl ? "Generating with live AI vision analysis..." : "Generating with live AI rewrite...", "loading");

  try {
    await renderAiOutput(version);
    aiStatus = "online";
    setRuntimeNote(
      imageDataUrl
        ? "Live AI mode analyzed your screenshot and merged it into the story."
        : "Live AI mode is active through the local server.",
      "success"
    );
  } catch (error) {
    aiStatus = "offline";
    renderLocalOutput();
    setRuntimeNote(`Local analysis mode is active. ${error.message}`, "warning");
  }
}

function scheduleRender(delay = 0) {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderOutput();
  }, delay);
}

async function checkRuntime() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Health check failed");
    const payload = await response.json();
    aiStatus = payload.ai ? "online" : "offline";
    setRuntimeNote(
      payload.ai
        ? `Live AI mode is available on the local server using ${payload.model}.`
        : "Local analysis mode is active. Add OPENAI_API_KEY and restart the server to enable live AI rewrites and screenshot analysis.",
      payload.ai ? "success" : "warning"
    );
  } catch {
    aiStatus = "offline";
    setRuntimeNote(
      "AI mode checks for a local server. If none is running, Receipts falls back to local analysis.",
      "default"
    );
  }
}

function setTemplate(template) {
  currentTemplate = template;
  pills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.template === template);
  });
  renderOutput();
}

function copyAll() {
  if (!lastRender) return;
  const text = buildMarkdown(lastRender);

  navigator.clipboard
    .writeText(text)
    .then(() => {
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy all";
      }, 1200);
    })
    .catch(() => {
      copyButton.textContent = "Copy failed";
      window.setTimeout(() => {
        copyButton.textContent = "Copy all";
      }, 1200);
    });
}

function downloadMarkdown() {
  if (!lastRender) return;
  const blob = new Blob([buildMarkdown(lastRender)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "receipts-profile.md";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapSvgText(text, maxCharsPerLine) {
  const words = compactWhitespace(text).split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }
    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function buildSvgTextBlock(text, x, y, maxCharsPerLine, lineHeight, className) {
  const lines = wrapSvgText(text, maxCharsPerLine);
  const spans = lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" class="${className}">${spans}</text>`;
}

function downloadProofCardImage() {
  if (!lastRender) return;

  const bulletMarkup = lastRender.bullets
    .slice(0, 3)
    .map((bullet, index) => {
      const baseY = 420 + index * 78;
      return `
        <circle cx="76" cy="${baseY - 10}" r="6" fill="#f0c45d" />
        ${buildSvgTextBlock(bullet, 98, baseY, 52, 26, "bullet")}
      `;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#13100e" />
          <stop offset="60%" stop-color="#1f1613" />
          <stop offset="100%" stop-color="#153b36" />
        </linearGradient>
        <radialGradient id="glowOne" cx="82%" cy="12%" r="28%">
          <stop offset="0%" stop-color="#f0c45d" stop-opacity="0.92" />
          <stop offset="100%" stop-color="#f0c45d" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="glowTwo" cx="18%" cy="88%" r="22%">
          <stop offset="0%" stop-color="#ff6b2c" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#ff6b2c" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1400" height="900" rx="36" fill="url(#bg)" />
      <rect width="1400" height="900" rx="36" fill="url(#glowOne)" />
      <rect width="1400" height="900" rx="36" fill="url(#glowTwo)" />
      <text x="72" y="86" class="kicker">Receipts profile</text>
      ${buildSvgTextBlock(lastRender.headline, 72, 168, 28, 64, "headline")}
      ${buildSvgTextBlock(lastRender.bio, 72, 286, 82, 34, "body")}
      ${bulletMarkup}
      <rect x="72" y="732" width="1256" height="96" rx="24" fill="rgba(255,248,242,0.08)" stroke="rgba(255,248,242,0.12)" />
      <text x="106" y="790" class="footer">${escapeXml(templates[currentTemplate].label)}</text>
      <text x="1294" y="790" class="footer footer-right">${escapeXml(`${lastRender.signals.artifactCount} artifacts analyzed`)}</text>
      <style>
        .kicker { fill: rgba(255,248,242,0.72); font: 700 24px Manrope, Arial, sans-serif; letter-spacing: 0.16em; text-transform: uppercase; }
        .headline { fill: #fff8f2; font: 800 58px Manrope, Arial, sans-serif; }
        .body { fill: rgba(255,248,242,0.86); font: 500 28px Manrope, Arial, sans-serif; }
        .bullet { fill: #fff8f2; font: 600 27px Manrope, Arial, sans-serif; }
        .footer { fill: rgba(255,248,242,0.74); font: 600 24px Manrope, Arial, sans-serif; }
        .footer-right { text-anchor: end; }
      </style>
    </svg>
  `;

  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }

    context.fillStyle = "#13100e";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "receipts-proof-card.png";
      link.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };

  image.onerror = () => {
    URL.revokeObjectURL(url);
  };

  image.src = url;
}

function openPrintView() {
  window.print();
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Image upload failed"));
    reader.readAsDataURL(file);
  });
}

generateButton.addEventListener("click", () => {
  aiStatus = "unknown";
  renderOutput();
});
copyButton.addEventListener("click", copyAll);
downloadButton.addEventListener("click", downloadMarkdown);
downloadImageButton.addEventListener("click", downloadProofCardImage);
printButton.addEventListener("click", openPrintView);

fileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  evidenceInput.value = await file.text();
  renderOutput();
});

imageInput.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  imageDataUrl = await loadImageFile(file);
  imageFileName = file.name;
  updateImagePreview();
  aiStatus = "unknown";
  setRuntimeNote("Screenshot attached. Generate to run visual receipt analysis.", "loading");
  renderOutput();
});

clearImageButton.addEventListener("click", () => {
  imageDataUrl = "";
  imageFileName = "";
  imageInput.value = "";
  updateImagePreview();
  renderOutput();
});

previewImage.addEventListener("error", () => {
  previewImage.hidden = true;
  imagePreview.dataset.state = "error";
  imageDropzone.dataset.state = "error";
  imageDropzoneTitle.textContent = "Preview unavailable";
  imageDropzoneText.textContent = "The screenshot is still attached. Click to replace it or keep going.";
});

evidenceInput.addEventListener("input", () => {
  scheduleRender(450);
});

pills.forEach((pill) => {
  pill.addEventListener("click", () => setTemplate(pill.dataset.template));
});

const savedDraft = localStorage.getItem("receipts-draft");
if (savedDraft) {
  evidenceInput.value = savedDraft;
}

checkRuntime().finally(() => {
  updateImagePreview();
  renderOutput();
});
