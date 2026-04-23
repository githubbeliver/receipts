const DEFAULT_MODEL = "gpt-5";

function getOpenAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
  };
}

function buildPrompt({ evidence, mode, hints, hasImage }) {
  return [
    "You are Receipts, an AI that turns messy evidence into public-facing credibility.",
    "Rewrite the evidence into polished, specific, believable career narrative assets.",
    "Do not invent achievements. Stay faithful to the evidence.",
    "Prefer crisp language over hype. Make the output feel ambitious and human.",
    `Mode: ${mode}`,
    `Evidence: ${evidence}`,
    hasImage
      ? "An image is also attached. Extract any visible accomplishments, metrics, UI outcomes, labels, or context that strengthen the narrative."
      : "No image is attached.",
    `Hints: ${JSON.stringify(hints)}`,
    "Return valid JSON matching the schema.",
  ].join("\n");
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const texts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        texts.push(content.text);
      }
    }
  }
  return texts.join("\n");
}

function getReceiptsSchema() {
  return {
    name: "receipts_profile",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string" },
        bio: { type: "string" },
        bullets: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 4,
        },
        post: { type: "string" },
        signalCards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              body: { type: "string" },
            },
            required: ["title", "body"],
          },
          minItems: 2,
          maxItems: 4,
        },
        sourceEvidence: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
        },
        interpretedEvidence: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
        },
        analysis: {
          type: "object",
          additionalProperties: false,
          properties: {
            artifactCount: { type: "number" },
            impactCount: { type: "number" },
            traits: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              maxItems: 4,
            },
          },
          required: ["artifactCount", "impactCount", "traits"],
        },
      },
      required: [
        "headline",
        "bio",
        "bullets",
        "post",
        "signalCards",
        "sourceEvidence",
        "interpretedEvidence",
        "analysis",
      ],
    },
    strict: true,
  };
}

async function generateWithOpenAI(input) {
  const { apiKey, model } = getOpenAiConfig();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the server");
  }

  const content = [
    {
      type: "input_text",
      text: buildPrompt({
        evidence: input.evidence,
        mode: input.mode,
        hints: input.hints,
        hasImage: Boolean(input.image),
      }),
    },
  ];

  if (input.image) {
    content.push({
      type: "input_image",
      image_url: input.image,
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...getReceiptsSchema(),
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error?.message || "OpenAI request failed";
    throw new Error(message);
  }

  return JSON.parse(extractOutputText(payload));
}

function validateInput(body) {
  if (!body || typeof body !== "object") {
    return "Request body must be a JSON object";
  }
  if (!body.evidence || typeof body.evidence !== "string") {
    return "Evidence is required";
  }
  if (body.image && typeof body.image !== "string") {
    return "Image must be a base64 data URL string";
  }
  return null;
}

module.exports = {
  DEFAULT_MODEL,
  generateWithOpenAI,
  getOpenAiConfig,
  validateInput,
};
