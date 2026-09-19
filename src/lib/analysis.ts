// Constants and types for the analysis generation pipeline. Kept out of
// lib/actions/analysis.ts for the same reason lib/billing.ts exists: a
// "use server" module may only export async functions, so a plain `const`
// there silently strips every export from the module.

/**
 * Outcome of a generation run. `kind` maps an internal failure onto the state
 * the UI already renders: "quota" -> the quota-reached panel, "unavailable" ->
 * the not-enough-history panel. A raw internal error is never surfaced as the
 * analysis result.
 */
export type GenerateOutcome =
  | { ok: true; analysisId: string }
  | { ok: false; kind: "quota" | "unavailable" | "error"; message: string };

/**
 * The one wording for the thin-data case. Every surface renders this exact
 * string - Research page and chat alike - so a failure never reads differently
 * depending on where the run was triggered from.
 */
export const UNAVAILABLE_MESSAGE =
  "Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on.";

/**
 * Shown when the model provider was reachable but would not serve the request -
 * rate limit, daily token quota, overload - after the retry and fallback chain
 * in lib/ai/llm.ts has already been exhausted.
 *
 * The provider's own error text is deliberately NOT included. It carries the
 * org id, model id, service tier and remaining-quota figures, and this string
 * renders straight into the page.
 */
export const BUSY_MESSAGE =
  "The analysis engine is at capacity right now. Nothing was charged against your quota - try again in a few minutes.";

/**
 * The catch-all. Anything that is not a thin-data case and not a provider
 * capacity failure is a bug, and the user gets a fixed string while the real
 * error goes to the server log. Never interpolate an exception message here:
 * this path has surfaced raw provider payloads and truncated model output
 * directly to the browser.
 */
export const GENERIC_ERROR_MESSAGE =
  "Something went wrong generating that analysis. It has been logged - please try again.";
