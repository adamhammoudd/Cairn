// Regression test for supabase/functions/_shared/refresh-queue.ts (audit item
// 1.2: 34 symbols unchecked for 33 days). Fixture = symbols at different ages,
// including the migration-0026 tail (ASML, TSM...) and an on-demand holding
// (ISRG) that the old config-order walk never reached.
//
// Run: npx tsx --conditions=react-server scripts/tests/refresh-queue.ts

import { orderForRefresh, drainQueue, type RefreshCandidate } from "../../supabase/functions/_shared/refresh-queue";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

export async function runRefreshQueueSuite(): Promise<SuiteResult> {
  const { check, eq, result } = makeSuite("Data refresh queue (stalest first, one failure never blocks)");


const c = (symbol: string, success: string | null, checked: string | null = success, prioritised = false): RefreshCandidate => ({
  symbol,
  lastSuccessAt: success,
  lastCheckedAt: checked,
  prioritised,
});

const fixture = [
  c("NVDA", "2026-10-01T22:00:00Z"), // fresh, head of config
  c("AMZN", "2026-10-01T22:00:00Z"),
  c("ASML", "2026-08-30T22:00:00Z"), // 33 days old, tail of config
  c("TSM", "2026-08-30T22:00:00Z"),
  c("BABA", "2026-08-31T22:00:00Z"),
  c("ISRG", "2026-09-25T22:00:00Z", "2026-09-25T22:00:00Z", true), // held, on-demand only
  c("NEWCO", null, null), // never refreshed
  c("BADCO", null, "2026-10-01T22:00:00Z"), // keeps failing
];

const order = orderForRefresh(fixture).map((x) => x.symbol);
check("held symbol first", order[0] === "ISRG", order.join(","));
check("never-succeeded come before old data", order.indexOf("NEWCO") < order.indexOf("ASML"), order.join(","));
check("33-day-old symbols come before fresh ones", order.indexOf("ASML") < order.indexOf("NVDA") && order.indexOf("TSM") < order.indexOf("AMZN"));
check("older data first within a tier", order.indexOf("ASML") < order.indexOf("BABA"));
check("never-tried ahead of repeatedly failing", order.indexOf("NEWCO") < order.indexOf("BADCO"), order.join(","));

const dup = orderForRefresh([c("MSFT", "2026-10-01T00:00:00Z"), c("msft", "2026-09-01T00:00:00Z")]);
check("same symbol from two sources is queued once (staler record wins)", dup.length === 1 && dup[0].lastSuccessAt === "2026-09-01T00:00:00Z");

  // One failing symbol must not block the rest.
  const seen: string[] = [];
  const r = await drainQueue(orderForRefresh(fixture), async (x) => {
    if (x.symbol === "BADCO") throw new Error("boom");
    seen.push(x.symbol);
  }, Date.now() + 60_000);
  check("a failing symbol does not block the rest", r.failed.length === 1 && r.done.length === fixture.length - 1 && r.skipped.length === 0);

  // Deadline cuts the run short; the remainder is reported, tail = freshest.
  let t = 0;
  const cut = await drainQueue(orderForRefresh(fixture), async () => { t += 10; }, 30, () => t);
  check("deadline stops the run and reports the rest as skipped", cut.done.length === 3 && cut.skipped.length === fixture.length - 3);
  check("a cut-short run leaves the remainder queued in the same order", cut.skipped.map((x) => x.symbol).join() === order.slice(3).join());

  return result();
}

void runIfMain(import.meta.url, runRefreshQueueSuite);
