// Hosted inference client, OpenAI-compatible.
//
// Provider: Groq, primary. Cairn previously pointed at a self-hosted
// OpenAI-compatible server on localhost, which cannot work from Vercel by
// construction - a deployed function has no route to the developer's laptop.
// That is settled: Groq is the provider, reached over its OpenAI-compatible
// surface, so this file stays a thin fetch wrapper rather than an SDK
// dependency.
//
// Configuration (see .env.local.example):
//   LLM_BASE_URL    https://api.groq.com/openai/v1
//   LLM_MODEL       openai/gpt-oss-120b
//   GROQ_API_KEY    required - set in .env.local AND in Vercel env vars.
//                   Never committed, never hardcoded, never NEXT_PUBLIC_*.
//   LLM_TIMEOUT_MS  optional; default below.
//
// Optional second endpoint, tried only when the primary is exhausted:
//   FALLBACK_LLM_BASE_URL / FALLBACK_LLM_API_KEY / FALLBACK_LLM_MODEL
// See the "fallback endpoint" section below for why this exists and what it
// does and does not cover.
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

// The fallback endpoint's model id is NOT the primary's. Groq names the
// open-weight 120B model `openai/gpt-oss-120b`; Cerebras - the endpoint this
// fallback was designed against (docs/decisions/2026-08-30-groq-fallback-endpoint.md)
// - serves the same weights under the bare id `gpt-oss-120b`, no `openai/`
// prefix (checked against inference-docs.cerebras.ai, 2026-08-30). Defaulting
// the fallback to the primary's id shipped a model id that 404s on Cerebras,
// and a `/models` health check never caught it because /models does not take a
// model id. Overridable with FALLBACK_LLM_MODEL for any other host.
const DEFAULT_FALLBACK_MODEL = "gpt-oss-120b";

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
 *
 * This is also the exact condition llmComplete() treats as "try the next
 * configured endpoint" - a non-retryable status (401, 400, 404, 422...) is a
 * real configuration fault and is thrown as a plain Error instead, which
 * deliberately never falls through to a second endpoint. Masking a bad API
 * key by silently working via fallback would hide the thing that needs fixing.
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

// --------------------------------------------------------------------------
// Fallback endpoint.
//
// Groq's free tier caps the whole organisation at 200,000 tokens/day - not
// per user. One real chat turn's context (recent news + stored analyses)
// costs roughly 2,000-4,000 tokens, so that ceiling supports on the order of
// 60-100 real turns/day across every user combined, and this project hit it
// during its own verification pass with a handful of test generations.
//
// Rather than pay for a higher Groq tier, a second free OpenAI-compatible
// endpoint can be configured and is tried automatically once the primary is
// exhausted. Cerebras' free trial is the one this was designed against (not
// yet tested live - no Cerebras account exists for this repo): it serves the
// same open-weight GPT-OSS 120B weights Groq does, at roughly 5x the daily
// token budget (published docs, 2026-08-30), so output quality does not change
// - only which datacenter answered. Note the model id differs by provider:
// Groq's `openai/gpt-oss-120b` vs Cerebras' bare `gpt-oss-120b` (see
// DEFAULT_FALLBACK_MODEL).
//
// Optional and additive: unset, behaviour is identical to before this existed.
export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** For logs and model_version - "primary" or "fallback", never a raw secret. */
  label: "primary" | "fallback";
}

export function primaryEndpoint(): LlmEndpoint | null {
  const apiKey = llmApiKey();
  if (!apiKey) return null;
  return { baseUrl: llmBaseUrl(), apiKey, model: llmModel(), label: "primary" };
}

export function fallbackEndpoint(): LlmEndpoint | null {
  const baseUrl = process.env.FALLBACK_LLM_BASE_URL;
  const apiKey = process.env.FALLBACK_LLM_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    // Same open-weight model, different provider, different id string. See
    // DEFAULT_FALLBACK_MODEL - the primary's `openai/`-prefixed id is a Groq
    // convention and is not what Cerebras (or most OpenAI-compatible hosts)
    // serve it under.
    model: process.env.FALLBACK_LLM_MODEL || DEFAULT_FALLBACK_MODEL,
    label: "fallback",
  };
}

function configuredEndpoints(): LlmEndpoint[] {
  return [primaryEndpoint(), fallbackEndpoint()].filter((e): e is LlmEndpoint => e !== null);
}

/** "groq" for the primary (matching the provider name used before a fallback existed) or "fallback". */
function providerName(label: LlmEndpoint["label"]): string {
  return label === "fallback" ? "fallback" : "groq";
}

export async function llmHealthCheck(): Promise<{ ok: boolean; detail: string }> {
  const endpoints = configuredEndpoints();
  if (endpoints.length === 0) {
    return { ok: false, detail: "GROQ_API_KEY is not set - no model provider is configured." };
  }
  const results = await Promise.all(
    endpoints.map(async (ep) => {
      try {
        // A real generation, not GET /models. /models 200s whenever the API
        // key is valid, regardless of whether `ep.model` is an id this host
        // actually serves - which is exactly how a wrong fallback model id
        // ("openai/gpt-oss-120b" on Cerebras) passed a health check and then
        // 404'd on the first real request. This sends the smallest possible
        // completion and treats a 2xx (even an empty answer from a reasoning
        // model hitting the 1-token budget) as "this model id generates".
        const res = await fetch(`${ep.baseUrl}/chat/completions`, {
          method: "POST",
          headers: authHeaders(ep),
          body: JSON.stringify({
            model: ep.model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return `${ep.label} (${ep.baseUrl}): reachable, model "${ep.model}" generated`;
        const detail = (await res.text().catch(() => "")).slice(0, 160);
        // A 429 here is the provider rate-limiting the probe, not a broken
        // config - the model id and key are fine, we just asked at a bad
        // moment. Report it honestly rather than as a hard failure.
        if (res.status === 429) {
          return `${ep.label} (${ep.baseUrl}): model "${ep.model}" reachable, rate-limited on probe (HTTP 429)`;
        }
        return `${ep.label} (${ep.baseUrl}): model "${ep.model}" HTTP ${res.status} ${detail}`;
      } catch (err) {
        return `${ep.label} (${ep.baseUrl}): ${err instanceof Error ? err.message : String(err)}`;
      }
    }),
  );
  // ok = the primary works. A dead fallback is reported (visible in `detail`)
  // but does not fail the check - it only matters once the primary is
  // actually exhausted, and this is the only place both configured endpoints
  // are proactively checked instead of discovered mid-request.
  const primaryOk = /reachable/.test(results[0] ?? "");
  return { ok: primaryOk, detail: results.join("; ") };
}

function authHeaders(endpoint: LlmEndpoint): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.apiKey}` };
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

/**
 * A daily-token-budget rejection is a 429 that will not resolve within this
 * module's backoff window - Groq's own message says "try again in N minutes",
 * where N is always well past MAX_BACKOFF_MS's 8-second ceiling. Retrying it
 * with backoff four times is four guaranteed failures and several seconds of
 * pure latency before the caller ever gets to try a second endpoint.
 * Recognised by substring because Groq does not expose a distinct status code
 * or error type for it - only the message text says which 429 this is.
 */
function isDailyQuotaExhausted(status: number, detail: string): boolean {
  return status === 429 && /tokens per day|\bTPD\b/i.test(detail);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postChatCompletion(endpoint: LlmEndpoint, body: Record<string, unknown>): Promise<Response> {
  const timeout = Number(process.env.LLM_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(endpoint),
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
async function postWithRetry(endpoint: LlmEndpoint, body: Record<string, unknown>): Promise<Response> {
  let lastStatus = 0;
  let lastDetail = "";
  let attemptsMade = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    attemptsMade = attempt + 1;
    let res: Response;
    try {
      res = await postChatCompletion(endpoint, body);
    } catch (err) {
      // Network error or client-side timeout: transient by the same logic.
      lastStatus = 0;
      // Name the endpoint. A bare "fetch failed" with no URL is unactionable,
      // and the first real failure in the wild was exactly this: a stale
      // LLM_BASE_URL still pointing at a local Ollama that was not running.
      lastDetail = `${endpoint.baseUrl}: ${err instanceof Error ? err.message : String(err)}`;
      if (attempt === MAX_ATTEMPTS - 1) break;
      await sleep(backoffDelayMs(attempt));
      continue;
    }

    if (res.ok || !isRetryableStatus(res.status)) return res;

    lastStatus = res.status;
    lastDetail = (await res.text().catch(() => "")).slice(0, 300);

    // Give up on THIS endpoint immediately rather than spending the retry
    // budget on a condition guaranteed not to clear inside it - the caller
    // moves on to the next configured endpoint (if any) right away instead of
    // waiting out three more doomed attempts first.
    if (isDailyQuotaExhausted(lastStatus, lastDetail)) break;

    if (attempt === MAX_ATTEMPTS - 1) break;
    await sleep(backoffDelayMs(attempt, res.headers.get("retry-after")));
  }

  throw new LlmBusyError(lastStatus, attemptsMade, lastDetail || "no response body");
}

/** The json_schema -> json_object degrade-and-retry dance, against one endpoint. */
async function completeAgainstEndpoint(endpoint: LlmEndpoint, base: Record<string, unknown>, req: LlmRequest): Promise<string> {
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

  let res = await postWithRetry(endpoint, body);

  // Structured-output support varies by model/provider. If json_schema is
  // rejected, fall back to plain JSON mode - the caller validates the parsed
  // result either way, so this degrades safely rather than hard-failing.
  if (!res.ok && req.jsonSchema && (res.status === 400 || res.status === 422)) {
    res = await postWithRetry(endpoint, { ...base, response_format: { type: "json_object" } });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Model request failed (HTTP ${res.status}) at ${endpoint.baseUrl} for model "${endpoint.model}". ` +
        `Check the API key and that the model id is still current. ${detail.slice(0, 300)}`,
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
        `Model "${endpoint.model}" hit the ${body.max_tokens}-token budget before producing any answer ` +
          `(finish_reason: length). On a reasoning model, raise maxTokens or lower LLM_REASONING_EFFORT.`,
      );
    }
    throw new Error(
      `Model "${endpoint.model}" returned an empty response (finish_reason: ${choice?.finish_reason ?? "none"}).`,
    );
  }

  return content;
}

interface CompletionResult {
  text: string;
  endpoint: LlmEndpoint;
}

/**
 * Tries each configured endpoint in order (primary, then fallback if one is
 * set) and moves to the next ONLY on LlmBusyError - the provider was reachable
 * but would not serve the request (rate limit, daily quota, overload). A real
 * configuration fault (bad key, bad model id, malformed request) throws a
 * plain Error from completeAgainstEndpoint and is never retried against a
 * second endpoint, so a broken primary key cannot be silently papered over by
 * a working fallback - it still surfaces immediately, as it always has.
 *
 * Returns which endpoint actually served the request alongside the text,
 * threaded through the return value rather than tracked in shared state -
 * this file tried AsyncLocalStorage for that first and it did not reliably
 * survive the fetch/AbortSignal.timeout continuation chain in practice
 * (confirmed with a live two-endpoint test, not assumed), so the correct-by
 * -construction fix is simply to return it.
 */
async function completeWithEndpoints(req: LlmRequest): Promise<CompletionResult> {
  const endpoints = configuredEndpoints();
  if (endpoints.length === 0) {
    throw new Error(
      "No model provider configured: set GROQ_API_KEY (and LLM_BASE_URL/LLM_MODEL) in .env.local and in Vercel.",
    );
  }

  const baseWithoutModel: Record<string, unknown> = {
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

  let firstError: unknown = null;
  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    try {
      const text = await completeAgainstEndpoint(endpoint, { ...baseWithoutModel, model: endpoint.model }, req);
      return { text, endpoint };
    } catch (err) {
      if (!(err instanceof LlmBusyError)) throw err; // real fault - surface immediately, never fall through
      firstError ??= err;
      if (i < endpoints.length - 1) continue; // try the next configured endpoint
    }
  }

  throw firstError;
}

/**
 * Single completion. Returns raw text - callers are responsible for
 * validating it (and in this codebase, for running it through the scope
 * guard in lib/ai/scope-guard.ts before it is stored or shown to anyone).
 */
export async function llmComplete(req: LlmRequest): Promise<string> {
  const { text } = await completeWithEndpoints(req);
  return text;
}

/**
 * JSON completion with a bounded retry. Models fairly often emit prose around
 * their JSON or trail a stray token, so we strip code fences and isolate the
 * outermost object before parsing, then retry once with a corrective nudge
 * rather than failing the whole generation on a formatting slip.
 *
 * Shared by llmCompleteJson (existing callers, unchanged signature) and
 * llmCompleteJsonWithProvider (generate.ts, which needs to know which
 * endpoint actually served the request for ai_analyses.model_version).
 */
async function completeJsonWithEndpoint<T>(
  req: LlmRequest,
  validate: (parsed: unknown) => parsed is T,
): Promise<{ parsed: T; endpoint: LlmEndpoint }> {
  const attempt = async (
    messages: LlmMessage[],
  ): Promise<{ parsed: T | null; raw: string; endpoint: LlmEndpoint }> => {
    const { text: raw, endpoint } = await completeWithEndpoints({ ...req, messages });
    const parsed = tryParseJson(raw);
    return { parsed: parsed !== null && validate(parsed) ? parsed : null, raw, endpoint };
  };

  const first = await attempt(req.messages);
  if (first.parsed) return { parsed: first.parsed, endpoint: first.endpoint };

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
  if (second.parsed) return { parsed: second.parsed, endpoint: second.endpoint };

  throw new Error(`Model did not return schema-valid JSON after a retry. Last response: ${second.raw.slice(0, 500)}`);
}

export async function llmCompleteJson<T>(req: LlmRequest, validate: (parsed: unknown) => parsed is T): Promise<T> {
  const { parsed } = await completeJsonWithEndpoint(req, validate);
  return parsed;
}

/**
 * Same as llmCompleteJson, plus which endpoint actually served the request as
 * "<provider>:<model>" (e.g. "groq:openai/gpt-oss-120b" or
 * "fallback:openai/gpt-oss-120b") - for the one caller (generate.ts) that
 * records this in ai_analyses.model_version and must not assume Groq now that
 * a fallback endpoint can serve a request.
 */
export async function llmCompleteJsonWithProvider<T>(
  req: LlmRequest,
  validate: (parsed: unknown) => parsed is T,
): Promise<{ parsed: T; modelVersion: string }> {
  const { parsed, endpoint } = await completeJsonWithEndpoint(req, validate);
  return { parsed, modelVersion: `${providerName(endpoint.label)}:${endpoint.model}` };
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
