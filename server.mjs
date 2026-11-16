import express from "express";
import helmet from "helmet";
import { GoogleGenAI } from "@google/genai";

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_BODY_SIZE = "512kb";

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.static("public", { extensions: ["html"] }));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getStatus(error) {
  const value = Number(error?.status || error?.code || 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizePayload(body) {
  // 同時相容兩種前端格式：
  // 1. { payload: { contents, systemInstruction, generationConfig } }
  // 2. { contents, systemInstruction, generationConfig }
  return body?.payload && typeof body.payload === "object"
    ? body.payload
    : body;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "缺少請求內容";
  }

  if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
    return "缺少 contents，或 contents 不是非空陣列";
  }

  return null;
}

function extractSystemInstruction(systemInstruction) {
  if (!systemInstruction) return undefined;
  if (typeof systemInstruction === "string") return systemInstruction;

  if (Array.isArray(systemInstruction.parts)) {
    const text = systemInstruction.parts
      .map(part => part?.text)
      .filter(Boolean)
      .join("\n");
    return text || undefined;
  }

  return systemInstruction;
}

function buildConfig(payload) {
  const source = payload.generationConfig || {};
  const config = {};

  const systemInstruction = extractSystemInstruction(payload.systemInstruction);
  if (systemInstruction) config.systemInstruction = systemInstruction;

  if (source.temperature !== undefined) config.temperature = source.temperature;
  if (source.topP !== undefined) config.topP = source.topP;
  if (source.topK !== undefined) config.topK = source.topK;
  if (source.maxOutputTokens !== undefined) {
    config.maxOutputTokens = source.maxOutputTokens;
  }
  if (source.stopSequences !== undefined) {
    config.stopSequences = source.stopSequences;
  }

  config.responseMimeType = source.responseMimeType || "application/json";

  // Google Gen AI SDK 使用 responseJsonSchema。
  if (source.responseSchema) config.responseJsonSchema = source.responseSchema;
  if (source.responseJsonSchema) {
    config.responseJsonSchema = source.responseJsonSchema;
  }

  return config;
}

function parseModelText(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini 回傳空白內容");
  }

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned);
}

async function generateWithRetry(payload, maxRetries = 2) {
  let delay = 800;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: payload.contents,
        config: buildConfig(payload)
      });

      return parseModelText(response.text);
    } catch (error) {
      const status = getStatus(error);
      const canRetry = RETRYABLE_STATUS.has(status);

      if (!canRetry || attempt === maxRetries) throw error;

      await sleep(delay + Math.floor(Math.random() * 250));
      delay *= 2;
    }
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model,
    aiConfigured: Boolean(ai)
  });
});

app.post("/api/ai/generate", async (req, res) => {
  if (!ai) {
    return res.status(503).json({
      code: "AI_NOT_CONFIGURED",
      message: "後端尚未設定 GEMINI_API_KEY"
    });
  }

  const payload = normalizePayload(req.body);
  const validationError = validatePayload(payload);

  if (validationError) {
    console.error("Invalid AI request:", validationError, {
      bodyKeys: Object.keys(req.body || {}),
      payloadKeys:
        payload && typeof payload === "object" ? Object.keys(payload) : []
    });

    return res.status(400).json({
      code: "INVALID_REQUEST",
      message: validationError
    });
  }

  try {
    console.log("AI request received", {
      model,
      contentCount: payload.contents.length,
      hasResponseSchema: Boolean(
        payload.generationConfig?.responseSchema ||
        payload.generationConfig?.responseJsonSchema
      )
    });

    const data = await generateWithRetry(payload);
    return res.json({ data, model });
  } catch (error) {
    const upstreamStatus = getStatus(error);

    console.error("Gemini request failed", {
      status: upstreamStatus,
      name: error?.name,
      message: error?.message
    });

    if (upstreamStatus === 400) {
      return res.status(400).json({
        code: "GEMINI_INVALID_ARGUMENT",
        message: "Gemini 不接受目前的請求格式或 JSON Schema",
        detail: error?.message
      });
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return res.status(502).json({
        code: "GEMINI_AUTH_ERROR",
        message: "Gemini 金鑰無效或權限不足"
      });
    }

    if (upstreamStatus === 429) {
      return res.status(429).json({
        code: "GEMINI_RATE_LIMIT",
        message: "Gemini 使用量或配額已達限制，請稍後重試"
      });
    }

    return res.status(502).json({
      code: "AI_UPSTREAM_ERROR",
      message: "Gemini API 暫時無法完成請求",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : error?.message
    });
  }
});

// 前端單頁入口。API 以外的未知網址回首頁。
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({
      code: "INVALID_JSON",
      message: "請求不是有效的 JSON"
    });
  }

  console.error("Unhandled server error", error);
  return res.status(500).json({
    code: "SERVER_ERROR",
    message: "伺服器發生未預期錯誤"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Xuanshu server running on port ${port}`);
  console.log(`Gemini model: ${model}`);
  console.log(`Gemini configured: ${Boolean(ai)}`);
});
