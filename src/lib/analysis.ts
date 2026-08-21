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
  "Not enough historical data available for this scope yet — too few comparable situations in the record to put a confidence range on.";
