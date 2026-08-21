// Hosted inference client, OpenAI-compatible.
//
// Provider: Groq. Cairn previously pointed at a self-hosted OpenAI-compatible
// server on localhost, which cannot work from Vercel by construction - a
// deployed function has no route to the developer's laptop. That is now
// settled: Groq is the provider, reached over its OpenAI-compatible surface,
// so this file stays a thin fetch wrapper rather than an SDK dependency.
//
// Configuration (see .env.local.example):
//   LLM_BASE_URL    https://api.groq.com/openai/v1
//   LLM_MODEL       openai/gpt-oss-120b
//   GROQ_API_KEY    required - set in .env.local AND in Vercel env vars.
//                   Never committed, never hardcoded, never NEXT_PUBLIC_*.
//   LLM_TIMEOUT_MS  optional; default below.
//
// Model choice, checked rather than assumed (2026-08-20): Groq deprecated
// `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-08-16 and names
// `openai/gpt-oss-120b` as the replacement for the 70B tier. Defaulting to a
// Llama model here would have shipped a dead model id.
//
// Design note: everything downstream is written assuming the model writes
// PROSE ONLY. Probabilities are computed in lib/ai/analytics.ts from real
// historical analogs; the model never produces a number that reaches a user.

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 60_000;

// Groq's free tier enforces real per-minute request and token limits. These
// are transient by definition, so they are retried rather than surfaced.
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 600;
const MAX_BACKOFF_MS = 8_000;
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** The single user-facing string for "the provider is rate-limiting us". */
export const BUSY_MESSAGE =
  "The assistant is temporarily busy and could not complete that request. Please try again shortly.";

/**
 * Raised when the provider was reachable but would not serve us right now
 * (rate limit, overload, upstream 5xx) after the retry budget was spent.
 * Callers translate this into BUSY_MESSAGE - never a raw provider error, and
 * never a silent hang.
 */
export class LlmBusyError extends Error {
  readonly status: number;
  readonly attempts: number;
  constructor(status: number, attempts: number, detail: string) {
    super(`Model provider unavailable after ${attempts} attempt(s) (HTTP ${status}): ${detail}`);
    this.name = "LlmBusyError";
    this.status = status;
    this.attempts = attempts;
  }
}

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

export function llmApiKey(): string | undefined {
  // GROQ_API_KEY is the documented name; LLM_API_KEY stays accepted so a
  // different OpenAI-compatible host can be swapped in without a code change.
  return process.env.GROQ_API_KEY || process.env.LLM_API_KEY || undefined;
}

/**
 * Whether a usable endpoint is configured. A hosted provider without a key is
 * NOT configured - treating it as configured is how the old localhost default
 * turned into "chat returns Something went wrong" instead of a clear cause.
 */
export function isLlmConfigured(): boolean {
  return Boolean(llmApiKey());
}

export async function llmHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  if (!isLlmConfigured()) {
    return { ok: false, detail: "GROQ_API_KEY is not set - no model provider is configured." };
  }
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
  const key = llmApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  error?: { message?: string };
}

/**
 * How long to wait before retry N. Prefers the provider's own Retry-After
 * (Groq sends it on 429, sometimes as fractional seconds), otherwise
 * exponential backoff with jitter so concurrent requests don't re-collide in
 * lockstep. Exported for the unit test - the arithmetic is worth pinning down.
 */
export function backoffDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.ceil(seconds * 1000), MAX_BACKOFF_MS);
    }
    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
      return Math.min(Math.max(asDate - Date.now(), 0), MAX_BACKOFF_MS);
    }
  }
  const ceiling = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
 * POST with retry-with-backoff for transient provider conditions. Non-retryable
 * responses (400, 401, 404, 422...) are returned to the caller untouched so a
 * real configuration error surfaces immediately instead of being retried into a
 * timeout.
 */
async function postWithRetry(body: Record<string, unknown>): Promise<Response> {
  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await postChatCompletion(body);
    } catch (err) {
      // Network error or client-side timeout: transient by the same logic.
      lastStatus = 0;
      // Name the endpoint. A bare "fetch failed" with no URL is unactionable,
      // and the first real failure in the wild was exactly this: a stale
      // LLM_BASE_URL still pointing at a local Ollama that was not running.
      lastDetail = `${llmBaseUrl()}: ${err instanceof Error ? err.message : String(err)}`;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(backoffDelayMs(attempt));
      continue;
    }

    if (res.ok || !isRetryableStatus(res.status)) return res;

    lastStatus = res.status;
    lastDetail = (await res.text().catch(() => "")).slice(0, 300);
    if (attempt === MAX_ATTEMPTS - 1) break;
    await sleep(backoffDelayMs(attempt, res.headers.get("retry-after")));
  }

  throw new LlmBusyError(lastStatus, MAX_ATTEMPTS, lastDetail || "no response body");
}

/**
 * Single completion against the configured provider. Returns raw text - callers
 * are responsible for validating it (and in this codebase, for running it
 * through the scope guard in lib/ai/scope-guard.ts before it is stored or
 * shown to anyone).
 */
export async function llmComplete(req: LlmRequest): Promise<string> {
  if (!isLlmConfigured()) {
    throw new Error(
      "No model provider configured: set GROQ_API_KEY (and LLM_BASE_URL/LLM_MODEL) in .env.local and in Vercel.",
    );
  }

  const base: Record<string, unknown> = {
    model: llmModel(),
    messages: [{ role: "system", content: req.system }, ...req.messages],
    max_tokens: req.maxTokens ?? 1024,
    // Low but non-zero: deterministic enough to be reviewable, not so rigid
    // that the model loops on repeated phrasing.
    temperature: req.temperature ?? 0.3,
    // gpt-oss is a REASONING model, and reasoning tokens are drawn from the
    // same max_tokens budget as the answer. At the default effort a short
    // request spends the entire budget thinking and returns content: "" with
    // finish_reason: "length" - a live check against Groq did exactly that,
    // burning 58 of 60 tokens on reasoning and answering nothing.
    //
    // Cairn's model does not need to reason: every probability is computed in
    // code and every citation is a row selected by id, so the model is only
    // narrating numbers it was handed. "low" is therefore the honest setting,
    // not a cost compromise - it took the same request from 58 reasoning
    // tokens and an empty answer to 5 and a correct one. Overridable for a
    // provider whose model ignores the field.
    reasoning_effort: process.env.LLM_REASONING_EFFORT || "low",
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

  let res = await postWithRetry(body);

  // Structured-output support varies by model on Groq. If json_schema is
  // rejected, fall back to plain JSON mode - the caller validates the parsed
  // result either way, so this degrades safely rather than hard-failing.
  if (!res.ok && req.jsonSchema && (res.status === 400 || res.status === 422)) {
    res = await postWithRetry({ ...base, response_format: { type: "json_object" } });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Model request failed (HTTP ${res.status}) at ${llmBaseUrl()} for model "${llmModel()}". ` +
        `Check GROQ_API_KEY and that the model id is still current. ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as ChatCompletionResponse;
  if (data.error?.message) throw new Error(`Model error: ${data.error.message}`);

  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    // Distinguish the two ways "empty" happens. Truncation is a budget bug we
    // can fix; anything else is the provider behaving unexpectedly. Reporting
    // both as "empty response" is what made the first occurrence take a raw
    // API dump to diagnose.
    if (choice?.finish_reason === "length") {
      throw new Error(
        `Model "${llmModel()}" hit the ${body.max_tokens}-token budget before producing any answer ` +
          `(finish_reason: length). On a reasoning model, raise maxTokens or lower LLM_REASONING_EFFORT.`,
      );
    }
    throw new Error(`Model "${llmModel()}" returned an empty response (finish_reason: ${choice?.finish_reason ?? "none"}).`);
  }
  return content;
}

/**
 * JSON completion with a bounded retry. Models fairly often emit prose around
 * their JSON or trail a stray token, so we strip code fences and isolate the
 * outermost object before parsing, then retry once with a corrective nudge
 * rather than failing the whole generation on a formatting slip.
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

  throw new Error(`Model did not return schema-valid JSON after a retry. Last response: ${second.raw.slice(0, 500)}`);
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
