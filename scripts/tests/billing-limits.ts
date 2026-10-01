// Unit tests for the admin-unlimited billing flag, the input bounds, and the
// large-number formatters.
//
// Covers the three things the "admin unlimited + cap user input + fix big
// numbers" change adds, all pure and DB-free:
//   1. computeUsageSummary/computeChatUsageSummary with unlimited=true
//   2. boundedAmount / clampAmount enforce [0, MAX_AMOUNT_INPUT]
//   3. formatCompactUserMoney / formatCompactNumber / the formatUserMoney safety net
//
// Run: npm run test:billing-limits

import { computeUsageSummary, computeChatUsageSummary } from "@/lib/billing";
import { MAX_AMOUNT_INPUT, boundedAmount, clampAmount } from "@/lib/input-limits";
import {
  DEFAULT_DISPLAY_PREFS,
  formatUserMoney,
  formatCompactUserMoney,
  formatCompactNumber,
} from "@/lib/display-prefs";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runBillingLimitsSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- admin unlimited ----
  const free = computeUsageSummary("free", 3);
  cases.push(check("a normal plan has a finite remaining and unlimited=false", free.remaining === 2 && free.unlimited === false, JSON.stringify(free)));

  const admin = computeUsageSummary("free", 999, true);
  cases.push(check("unlimited=true -> huge remaining, unlimited flag set", admin.remaining > 1e6 && admin.unlimited === true, JSON.stringify(admin)));
  cases.push(check("remaining survives JSON round-trip (not Infinity)", Number.isFinite(JSON.parse(JSON.stringify(admin)).remaining), "finite"));
  cases.push(check("the raw used count is still reported for reference", admin.used === 999, String(admin.used)));

  const adminChat = computeChatUsageSummary("free", 500, true);
  cases.push(check("chat unlimited=true -> limit null, remaining null, unlimited flag", adminChat.limit === null && adminChat.remaining === null && adminChat.unlimited === true, JSON.stringify(adminChat)));

  const premiumChat = computeChatUsageSummary("premium", 40);
  cases.push(check("Premium's own null daily limit also reads as unlimited", premiumChat.unlimited === true, JSON.stringify(premiumChat)));

  // ---- input bounds ----
  cases.push(check("MAX_AMOUNT_INPUT is ten billion", MAX_AMOUNT_INPUT === 10_000_000_000, String(MAX_AMOUNT_INPUT)));
  cases.push(check("boundedAmount accepts a value at the cap", boundedAmount(String(MAX_AMOUNT_INPUT)) === MAX_AMOUNT_INPUT, "at cap"));
  cases.push(check("boundedAmount rejects one over the cap", boundedAmount(String(MAX_AMOUNT_INPUT + 1)) === null, "over cap -> null"));
  cases.push(check("boundedAmount rejects zero, negatives and non-numbers", boundedAmount("0") === null && boundedAmount("-5") === null && boundedAmount("abc") === null, "all null"));
  cases.push(check("boundedAmount accepts an ordinary amount", boundedAmount("2500.75") === 2500.75, "2500.75"));
  cases.push(check("clampAmount caps at the max and floors non-finite/negative at 0", clampAmount(1e30) === MAX_AMOUNT_INPUT && clampAmount(-1) === 0 && clampAmount(Number.NaN) === 0, "clamped"));

  // ---- large-number formatting ----
  const prefs = DEFAULT_DISPLAY_PREFS;
  cases.push(check("small money keeps full precision", formatCompactUserMoney(1234.5, prefs) === formatUserMoney(1234.5, prefs), formatCompactUserMoney(1234.5, prefs)));
  cases.push(check("money over $1M compacts", /M|B|T/.test(formatCompactUserMoney(4_200_000, prefs)), formatCompactUserMoney(4_200_000, prefs)));
  cases.push(check("money in the billions compacts", /B/.test(formatCompactUserMoney(3_400_000_000, prefs)), formatCompactUserMoney(3_400_000_000, prefs)));
  cases.push(
    check(
      "formatUserMoney compacts an absurd value instead of a 30-digit string",
      formatUserMoney(1e21, prefs).length < 20 && formatUserMoney(1e21, prefs).includes("T"),
      formatUserMoney(1e21, prefs),
    ),
  );
  cases.push(check("formatCompactNumber compacts a huge share count", /M|B/.test(formatCompactNumber(12_500_000)), formatCompactNumber(12_500_000)));
  cases.push(check("formatCompactNumber leaves a small count alone", formatCompactNumber(842) === "842", formatCompactNumber(842)));
  cases.push(check("non-finite inputs format to a dash", formatCompactUserMoney(Number.POSITIVE_INFINITY, prefs) === "-" && formatCompactNumber(Number.NaN) === "-", "dash"));

  return { suiteName: "Admin-unlimited billing + input bounds + big-number formatting", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("billing-limits.ts")) {
  const suite = runBillingLimitsSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} billing-limits cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
