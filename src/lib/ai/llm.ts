// Self-hosted inference client. Cairn does not call any third-party model
// API — this talks to a model you run yourself (Ollama, vLLM, llama.cpp
// server, LM Studio, text-generation-webui), all of which expose an
// OpenAI-compatible /chat/completions endpoint.
//
// Configuration (see .env.local.example):
//   LLM_BASE_URL   e.g. http://127.0.0.1:11434/v1   (Ollama's OpenAI-compat path)
//   LLM_MODEL      e.g. qwen2.5:7b-instruct
//   LLM_API_KEY    optional — only if you've put auth on your inference server
//   LLM_TIMEOUT_MS optional — CPU-only boxes are slow; default is generous
//
// Design note: everything downstream of this module is written assuming a
// SMALL local model (3B-7B), not a frontier one. That's why the analysis
// engine computes its own probabilities (lib/ai/analytics.ts) and only asks
// the model for prose — see the comment at the top of lib/ai/generate.ts.

const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "qwen2.5:7b-instruct";
const DEFAULT_TIMEOUT_MS = 180_000;

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** JSON Schema for structured output. Enforced server-side where supported, validated by the caller regardless. */
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
}

export function llmBaseUrl(): string {
  return (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function llmModel(): string {
  return process.env.LLM_MODEL || DEFAULT_MODEL;
}

/**
 * Whether a self-hosted endpoint is configured. Note this is a config check,
 * not a reachability check — use `llmHealthCheck()` when you need to know the
 * server is actually up (the test suite does).
 */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_BASE_URL || process.env.LLM_MODEL);
}

export async function llmHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${llmBaseUrl()}/models`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, detail: `${llmBaseUrl()}/models returned HTTP ${res.status}` };
    return { ok: true, detail: `Reachable at ${llmBaseUrl()}, model "${llmModel()}"` };
  } catch (err) {
    return { ok: false, detail: `Cannot reach ${llmBaseUrl()}: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = process.env.LLM_API_KEY;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function postChatCompletion(body: Record<string, unknown>): Promise<Response> {
  const timeout = Number(process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return fetch(`${llmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
}

/**
 * Single completion against the self-hosted model. Returns raw text — callers
 * are responsible for validating it (and in this codebase, for running it
 * through the scope guard in lib/ai/scope-guard.ts before it is stored or
 * shown to anyone).
 */
export async function llmComplete(req: LlmRequest): Promise<string> {
  const base: Record<string, unknown> = {
    model: llmModel(),
    messages: [{ role: "system", content: req.system }, ...req.messages],
    max_tokens: req.maxTokens ?? 1024,
    // Low but non-zero: deterministic enough to be reviewable, not so rigid
    // that a small model loops on repeated phrasing.
    temperature: req.temperature ?? 0.3,
    stream: false,
  };

  let body = base;
  if (req.jsonSchema) {
    body = {
      ...base,
      response_format: {
        type: "json_schema",
        json_schema: { name: req.schemaName ?? "output", schema: req.jsonSchema, strict: true },
      },
    };
  }

  let res = await postChatCompletion(body);

  // Structured-output support varies across self-hosted servers and versions.
  // If json_schema is rejected, fall back to plain JSON mode — the caller
  // validates the parsed result either way, so this degrades safely rather
  // than hard-failing on an older Ollama/llama.cpp build.
  if (!res.ok && req.jsonSchema && (res.status === 400 || res.status === 422)) {
    res = await postChatCompletion({ ...base, response_format: { type: "json_object" } });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Self-hosted model request failed (HTTP ${res.status}) at ${llmBaseUrl()}. ` +
        `Check that your inference server is running and LLM_MODEL="${llmModel()}" is pulled. ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as ChatCompletionResponse;
  if (data.error?.message) throw new Error(`Self-hosted model error: ${data.error.message}`);

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Self-hosted model returned an empty response.");
  }
  return content;
}

/**
 * JSON completion with a bounded retry. Small local models fairly often emit
 * prose around their JSON or trail a stray token, so we strip code fences and
 * isolate the outermost object before parsing, then retry once with a
 * corrective nudge rather than failing the whole generation on a formatting
 * slip.
 */
export async function llmCompleteJson<T>(req: LlmRequest, validate: (parsed: unknown) => parsed is T): Promise<T> {
  const attempt = async (messages: LlmMessage[]): Promise<{ parsed: T | null; raw: string }> => {
    const raw = await llmComplete({ ...req, messages });
    const parsed = tryParseJson(raw);
    return { parsed: parsed !== null && validate(parsed) ? parsed : null, raw };
  };

  const first = await attempt(req.messages);
  if (first.parsed) return first.parsed;

  const second = await attempt([
    ...req.messages,
    { role: "assistant", content: first.raw },
    {
      role: "user",
      content:
        "That response was not valid JSON matching the required schema. Reply with ONLY the JSON object, " +
        "no code fences, no commentary before or after it.",
    },
  ]);
  if (second.parsed) return second.parsed;

  throw new Error(
    `Self-hosted model did not return schema-valid JSON after a retry. Last response: ${second.raw.slice(0, 500)}`,
  );
}

function tryParseJson(raw: string): unknown {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const candidates = [withoutFences];

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}
