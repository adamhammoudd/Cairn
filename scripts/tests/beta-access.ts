// Beta access: BETA_PREMIUM_UNTIL makes every signed-in user Premium through
// getUserPlan(), and nothing else changes.
//
// Pure cases cover plan resolution with the flag on, off, expired and
// malformed. Source checks pin the wiring: getUserPlan() and getBillingDetail()
// must both go through resolvePlan(), and the chat gate must enforce the beta
// abuse cap - a second path that read subscriptions.tier directly is exactly
// how a gate silently stops applying.
//
// Run: npx tsx --conditions=react-server scripts/tests/beta-access.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { betaPremiumUntil, resolvePlan, formatBetaUntil, BETA_CHAT_DAILY_CAP, TIER_LIMITS } from "@/lib/billing";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runBetaAccessSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const now = new Date("2026-09-27T12:00:00Z");

  // ---- flag parsing ----
  const future = betaPremiumUntil("2026-12-31", now);
  cases.push(check("a future bare date turns beta on", future !== null, String(future?.toISOString())));
  cases.push(check("a bare date runs to the end of that day (UTC)", future?.toISOString() === "2026-12-31T23:59:59.999Z", String(future?.toISOString())));
  cases.push(check("a future full timestamp turns beta on", betaPremiumUntil("2026-10-01T09:00:00Z", now) !== null, "timestamp"));
  cases.push(check("unset -> beta off", betaPremiumUntil(undefined, now) === null, "undefined"));
  cases.push(check("empty / whitespace -> beta off", betaPremiumUntil("  ", now) === null, "blank"));
  cases.push(check("an expired date -> beta off", betaPremiumUntil("2026-09-01", now) === null, "2026-09-01"));
  cases.push(check("today's date still counts until the day ends", betaPremiumUntil("2026-09-27", now) !== null, "2026-09-27"));
  cases.push(check("a malformed value fails safe to beta off", betaPremiumUntil("next spring", now) === null && betaPremiumUntil("true", now) === null, "malformed"));

  // ---- plan resolution ----
  cases.push(check("flag on: a free user resolves to premium", resolvePlan("free", true, future) === "premium", "free -> premium"));
  cases.push(check("flag on: a user with no subscription row resolves to premium", resolvePlan(null, true, future) === "premium", "null -> premium"));
  cases.push(check("flag on: a paying premium user stays premium", resolvePlan("premium", true, future) === "premium", "premium"));
  cases.push(check("flag on: signed-out still resolves to free", resolvePlan(null, false, future) === "free", "anon -> free"));
  cases.push(check("flag off: stored tier wins (free)", resolvePlan("free", true, null) === "free", "free"));
  cases.push(check("flag off: stored tier wins (premium)", resolvePlan("premium", true, null) === "premium", "premium"));
  cases.push(check("flag off: no row -> free", resolvePlan(undefined, true, null) === "free", "undefined -> free"));
  const expired = betaPremiumUntil("2026-09-01", now);
  cases.push(check("flag expired: a free user is back to free", resolvePlan("free", true, expired) === "free", "expired"));

  // ---- limits ----
  cases.push(check("beta analyses = Premium's 100 a month", TIER_LIMITS.premium.monthlyAiAnalyses === 100, String(TIER_LIMITS.premium.monthlyAiAnalyses)));
  cases.push(check("Premium chat stays unlimited (null)", TIER_LIMITS.premium.dailyChatMessages === null, String(TIER_LIMITS.premium.dailyChatMessages)));
  cases.push(check("beta chat abuse cap is 200 a day", BETA_CHAT_DAILY_CAP === 200, String(BETA_CHAT_DAILY_CAP)));
  cases.push(check("display date reads as a plain date", formatBetaUntil(future!) === "31 December 2026", formatBetaUntil(future!)));

  // ---- wiring ----
  const actions = fs.readFileSync(path.resolve(process.cwd(), "src/lib/actions/billing.ts"), "utf8");
  const planFn = actions.slice(actions.indexOf("export async function getUserPlan"), actions.indexOf("export async function getBetaAccessLabel"));
  cases.push(check("getUserPlan() applies betaPremiumUntil + resolvePlan", /betaPremiumUntil\(\)/.test(planFn) && /resolvePlan\(/.test(planFn), "source"));
  const detailFn = actions.slice(actions.indexOf("export async function getBillingDetail"));
  cases.push(check("getBillingDetail() resolves the tier through resolvePlan, not the raw row", /resolvePlan\(subscription\?\.tier/.test(detailFn) && !/const tier = subscription\?\.tier/.test(detailFn), "source"));
  const chatFn = actions.slice(actions.indexOf("export async function checkChatUsageAllowed"));
  cases.push(check("the chat gate enforces BETA_CHAT_DAILY_CAP while beta is on", /betaPremiumUntil\(\)\s*&&\s*\(count \?\? 0\) >= BETA_CHAT_DAILY_CAP/.test(chatFn), "source"));
  cases.push(check("beta never writes a subscription (no insert/upsert added to getUserPlan)", !/upsert|insert\(/.test(planFn), "source"));

  return { suiteName: "Beta access (BETA_PREMIUM_UNTIL -> Premium via getUserPlan)", gating: true, cases };
}

async function main() {
  const suite = runBetaAccessSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
