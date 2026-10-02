// Audit 2026-10-02 item 4.2: the daily chat cap's "today" was the server's day
// (UTC on Vercel), so a reader in Belgium saw it reset at 01:00 or 02:00 local
// time while the message said "tomorrow". "Today" is now the day in the reader's
// own time zone (user_settings.briefing_timezone), and the limit messages name
// the reset time instead of saying "tomorrow".
//
// Run: npx tsx --conditions=react-server scripts/tests/chat-cap-timezone.ts

import fs from "node:fs";
import path from "node:path";
import { isValidTimeZone, resetPhrase, startOfTodayIso } from "../../src/lib/billing";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const at = (iso: string) => new Date(iso);

export function runChatCapTimezoneSuite(): SuiteResult {
  const { check, eq, result } = makeSuite("Daily chat cap day boundary (reader's time zone)");

  // The reported case, around local midnight in Belgium (CEST = UTC+2 in October).
  eq("Brussels 00:30 on 2 Oct: today began at 22:00Z on 1 Oct", startOfTodayIso("Europe/Brussels", at("2026-10-01T22:30:00Z")), "2026-10-01T22:00:00.000Z");
  eq("Brussels 23:59 on 1 Oct (one minute before the reset): still the 1 Oct bucket", startOfTodayIso("Europe/Brussels", at("2026-10-01T21:59:00Z")), "2026-09-30T22:00:00.000Z");
  eq("Brussels exactly 00:00 on 2 Oct: the new bucket starts", startOfTodayIso("Europe/Brussels", at("2026-10-01T22:00:00Z")), "2026-10-01T22:00:00.000Z");
  eq("UTC server noon is the same day in Brussels: bucket starts 22:00Z the day before", startOfTodayIso("Europe/Brussels", at("2026-10-02T12:00:00Z")), "2026-10-01T22:00:00.000Z");
  check("(before) the UTC day began at 00:00Z, which is 02:00 in Brussels - the cap reset two hours after local midnight", startOfTodayIso("UTC", at("2026-10-01T22:30:00Z")) === "2026-10-01T00:00:00.000Z");

  // DST: the offset is looked up at the boundary, not assumed.
  eq("Brussels after the clocks go back (CET, UTC+1): midnight is 23:00Z", startOfTodayIso("Europe/Brussels", at("2026-10-26T10:00:00Z")), "2026-10-25T23:00:00.000Z");
  eq("Brussels on the day the clocks go back (a 25-hour day): started 22:00Z the day before", startOfTodayIso("Europe/Brussels", at("2026-10-25T12:00:00Z")), "2026-10-24T22:00:00.000Z");
  eq("New York, 23:30 EDT on 1 Oct: today began 04:00Z", startOfTodayIso("America/New_York", at("2026-10-02T03:30:00Z")), "2026-10-01T04:00:00.000Z");
  eq("Auckland (ahead of UTC), 11:00 on 2 Oct NZDT: today began 11:00Z on 1 Oct", startOfTodayIso("Pacific/Auckland", at("2026-10-01T22:00:00Z")), "2026-10-01T11:00:00.000Z");

  // Fallbacks and validity.
  eq("an invalid zone falls back to UTC", startOfTodayIso("Not/AZone", at("2026-10-01T22:30:00Z")), "2026-10-01T00:00:00.000Z");
  eq("a missing zone falls back to UTC", startOfTodayIso(null, at("2026-10-01T22:30:00Z")), "2026-10-01T00:00:00.000Z");
  check("zone validation", isValidTimeZone("Europe/Brussels") && !isValidTimeZone("nope") && !isValidTimeZone(""));

  // The message says when, not "tomorrow".
  eq("reset phrase names the zone", resetPhrase("Europe/Brussels"), "midnight (Europe/Brussels)");
  eq("an invalid zone is described as UTC, the zone actually used", resetPhrase("nope"), "midnight (UTC)");
  const billing = fs.readFileSync(path.resolve(__dirname, "../../src/lib/actions/billing.ts"), "utf8");
  check("neither limit message says 'tomorrow' any more", !/tomorrow/.test(billing.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n")));
  check("every chat-usage count uses the reader's zone", (billing.match(/startOfTodayIso\(timeZone\)/g) ?? []).length === 3 && !/startOfTodayIso\(\)/.test(billing));
  return result();
}

void runIfMain(import.meta.url, runChatCapTimezoneSuite);
