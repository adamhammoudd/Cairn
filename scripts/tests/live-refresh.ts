// Live-quote polling logic (src/lib/live-refresh.ts), used by useLiveRefresh
// and LivePricePoll on the ticker and portfolio pages.
//
// Pure and DB-free. Run: npm run test:live-refresh

import { MIN_QUOTE_POLL_SECONDS, resolveQuotePollSeconds, shouldPoll } from "@/lib/live-refresh";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runLiveRefreshSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // --- interval: never faster than the provider's rate limit allows ---
  cases.push(check("a 15s setting is floored to the 60s quote minimum", resolveQuotePollSeconds(15) === 60, String(resolveQuotePollSeconds(15))));
  cases.push(check("a 30s setting is floored to 60s", resolveQuotePollSeconds(30) === 60, String(resolveQuotePollSeconds(30))));
  cases.push(check("a 60s setting is kept", resolveQuotePollSeconds(60) === 60, String(resolveQuotePollSeconds(60))));
  cases.push(check("a 5-minute setting is respected (slower is fine)", resolveQuotePollSeconds(300) === 300, String(resolveQuotePollSeconds(300))));
  cases.push(check("null / 0 / NaN fall back to the 60s minimum", resolveQuotePollSeconds(null) === 60 && resolveQuotePollSeconds(0) === 60 && resolveQuotePollSeconds(Number.NaN) === 60, "60"));
  cases.push(check("the minimum is 60s", MIN_QUOTE_POLL_SECONDS === 60, String(MIN_QUOTE_POLL_SECONDS)));

  // --- gate: poll only when it would tell the user something new ---
  const open = { paused: false, marketOpen: true, tabVisible: true };
  cases.push(check("polls when open, visible, not paused", shouldPoll(open) === true, "active"));
  cases.push(check("does not poll when the market is closed", shouldPoll({ ...open, marketOpen: false }) === false, "a 3am poll refetches yesterday's close"));
  cases.push(check("does not poll when the tab is hidden", shouldPoll({ ...open, tabVisible: false }) === false, "backgrounded tab = pointless rate-limited requests"));
  cases.push(check("does not poll when the user paused it", shouldPoll({ ...open, paused: true }) === false, "paused"));

  return { suiteName: "Live-quote polling", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("live-refresh.ts")) {
  const suite = runLiveRefreshSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} live-refresh cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
