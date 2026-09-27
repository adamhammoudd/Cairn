// Regression test for the deep-history top-up in lib/market-data/ingest.ts.
//
// Why this exists (2026-09-24, methodology rebuild):
//
// The factor analog scan measures percentiles of a symbol's OWN past, so ~2
// years of history is not enough: a deep drawdown over that span is a single
// episode, and the non-overlap rule correctly reduces one episode to two or
// three instances. Measured live, RKLB refused at n=4 against a floor of 5.
// Analysis therefore asks ensureSymbolIngested for a longer range via
// `minBars`, which bypasses the 15-minute freshness window.
//
// That top-up introduced a bug, caught on a live run against the whole
// uncovered-symbol set and fixed here: when the provider has no series at the
// DEEPER range (HYPE, ~400 bars, no 5y), the failed fetch fell through to the
// ordinary failure path and wrote status='unavailable' - taking a symbol that
// worked fine at the default range out of charts, watchlists and typeahead
// because an ANALYSIS wanted more history than exists. A depth request must
// never be able to downgrade a symbol; at worst it leaves it as it was.
//
// needsDeeperHistory is the single predicate behind both rules (bypass
// freshness on the way in, refuse to downgrade on the way out), so testing it
// covers both without a database or a provider call.
//
// Run: npx tsx --conditions=react-server scripts/tests/deep-history.ts

import "./env";
import { pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import { needsDeeperHistory } from "@/lib/market-data/ingest";
import { TARGET_FACTOR_HISTORY_BARS, MIN_FACTOR_HISTORY_BARS, FACTOR_HISTORY_RANGE } from "@/lib/ai/factors";


export function runDeepHistorySuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, condition: boolean, detail = "") =>
    cases.push({ name, status: condition ? "pass" : "fail", detail });

  const avail = (bars: number | null) => ({ status: "available", bars });

  // --- the bypass rule -------------------------------------------------------
  check(
    "no minBars: every existing caller is untouched",
    needsDeeperHistory(avail(10), undefined) === false,
    "a chart, typeahead hit or watchlist add never triggers a deeper fetch",
  );
  check(
    "shallower than asked: re-fetch even though the entry is fresh",
    needsDeeperHistory(avail(525), TARGET_FACTOR_HISTORY_BARS) === true,
    `525 bars (RKLB at the default range) < ${TARGET_FACTOR_HISTORY_BARS}`,
  );
  check(
    "deep enough: served from cache, no extra provider call",
    needsDeeperHistory(avail(1255), TARGET_FACTOR_HISTORY_BARS) === false,
    "1255 bars (RKLB at the deeper range) needs no top-up",
  );
  check(
    "exactly at the target counts as deep enough",
    needsDeeperHistory(avail(TARGET_FACTOR_HISTORY_BARS), TARGET_FACTOR_HISTORY_BARS) === false,
    "the comparison is strict, so the target is not re-fetched forever",
  );
  check(
    "a null bar count is treated as zero, not as unknown-so-fine",
    needsDeeperHistory(avail(null), TARGET_FACTOR_HISTORY_BARS) === true,
    "a directory row with no count must not silently skip the top-up",
  );

  // --- it must never reopen a miss or a cooldown ------------------------------
  // These are the rows whose status is a FACT the directory is deliberately
  // remembering (a day for a miss, minutes for a provider refusal). Asking for
  // more history is not a reason to start hammering the provider again.
  for (const status of ["unavailable", "rate_limited", "error"]) {
    check(
      `status '${status}' is never re-fetched by a depth request`,
      needsDeeperHistory({ status, bars: 0 }, TARGET_FACTOR_HISTORY_BARS) === false,
      "its own cooldown still governs",
    );
  }
  check(
    "an unknown symbol is not a depth case",
    needsDeeperHistory(null, TARGET_FACTOR_HISTORY_BARS) === false,
    "a first fetch is the ordinary path, not a top-up",
  );

  // --- the downgrade guard ----------------------------------------------------
  // The guard in ensureSymbolIngested is `if (tooShallow && known) return
  // fromDirectory(known, true)`, and tooShallow is exactly this predicate. So
  // the property that matters is: whenever the guard can fire, the entry it
  // preserves is one that was known good.
  check(
    "whenever the guard fires, the entry it keeps was 'available'",
    ["available", "unavailable", "rate_limited", "error"].every(
      (status) => !needsDeeperHistory({ status, bars: 0 }, TARGET_FACTOR_HISTORY_BARS) || status === "available",
    ),
    "so a failed depth top-up can only ever preserve a serviceable symbol, never resurrect a dead one",
  );
  check(
    "HYPE's shape: ~400 bars, no deeper series - guard is armed",
    needsDeeperHistory(avail(409), TARGET_FACTOR_HISTORY_BARS) === true,
    "the exact case that was wrongly written back as unavailable",
  );

  // --- the constants stay coherent --------------------------------------------
  check(
    "the target is above the bare minimum the factors need",
    TARGET_FACTOR_HISTORY_BARS > MIN_FACTOR_HISTORY_BARS,
    `target ${TARGET_FACTOR_HISTORY_BARS} > floor ${MIN_FACTOR_HISTORY_BARS}`,
  );
  check(
    "the requested range can actually supply the target",
    // "max" = everything the provider holds; the target (~4 years) is only
    // unreachable for a symbol that is genuinely younger than that.
    FACTOR_HISTORY_RANGE === "max",
    `${FACTOR_HISTORY_RANGE} covers the full listed history, target ${TARGET_FACTOR_HISTORY_BARS}`,
  );

  return { suiteName: "Deep-history top-up (analysis needs more bars than a chart)", gating: true, cases };
}

function main() {
  const suite = runDeepHistorySuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
