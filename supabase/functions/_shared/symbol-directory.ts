// Pure logic for keeping `symbol_directory` (the admin "Data refresh" health
// view) in sync with what the ingest jobs actually did.
//
// Root cause of the 2026-09-04 walkthrough's "64 of 75 tracked symbols are
// stale" finding: ingest-market-data's configured-provider loop and
// ingest-crypto both write real, current data to historical_prices /
// crypto_metrics every run, but neither one ever touched symbol_directory -
// only the on-demand path (searched-for symbols) did. So every symbol that
// came from a provider's config list (the bulk of the tracked universe,
// equities/ETFs and every crypto coin) had a directory row that froze at
// whatever `last_checked_at` migration 0027's backfill or its first on-demand
// search gave it, and never moved again - even though the data behind it kept
// updating. The admin page's staleness check (last_checked_at > 24h) was
// reading real freshness for nothing but the on-demand slice.
//
// This module is the one place that decides what a directory row should look
// like after an ingest attempt, so both edge functions apply it the same way
// and a test can cover the mapping without a live Supabase call.

// The symbol itself isn't part of the outcome - every call site already has
// it in scope for the `.eq()`/`.in()` that targets the update.
export type IngestOutcome =
  // `bars` is omitted when this call site has no per-symbol bar count to
  // report (e.g. ingest-crypto's metrics pass, which confirms a coin was
  // priced this run but doesn't itself count daily bars) - the patch then
  // leaves the stored `bars` column untouched rather than zeroing it out.
  | { kind: "success"; bars?: number }
  | { kind: "no_data" }
  | { kind: "error"; message: string };

export interface DirectoryPatch {
  status: "available" | "unavailable" | "error";
  bars?: number;
  detail: string | null;
  last_checked_at: string;
  last_success_at?: string;
}

/**
 * What to write to `symbol_directory` for one symbol after an ingest attempt.
 * `last_checked_at` always moves (an attempt happened, whatever the result);
 * `last_success_at` and `bars` only move on an actual success, so a run of
 * failures cannot make a symbol's data look newer than it is.
 */
export function buildDirectoryPatch(outcome: IngestOutcome, nowIso: string): DirectoryPatch {
  if (outcome.kind === "success") {
    return {
      status: "available",
      ...(outcome.bars !== undefined ? { bars: outcome.bars } : {}),
      detail: null,
      last_checked_at: nowIso,
      last_success_at: nowIso,
    };
  }
  if (outcome.kind === "no_data") {
    return { status: "unavailable", detail: "no data returned", last_checked_at: nowIso };
  }
  return { status: "error", detail: outcome.message, last_checked_at: nowIso };
}
