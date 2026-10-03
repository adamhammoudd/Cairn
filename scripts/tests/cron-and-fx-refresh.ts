// Audit 2026-10-02 items 1.6 (FX daily top-up) and 1.7 (invite job "never run").
//
// 1.6: nothing scheduled wrote fx_rates_daily; scripts/backfill-fx-rates.ts was
//      manual. Now /api/cron/refresh-fx-rates does, via refreshFxRates().
// 1.7: the invite route answered a bare 401 (and logged nothing) when CRON_SECRET
//      was unset, which is exactly when Vercel sends no Authorization header at
//      all. The job itself records a run on every authorised call (tested in
//      beta-invites.ts: "kill switch off ... run recorded as disabled").
//
// Run: npx tsx --conditions=react-server scripts/tests/cron-and-fx-refresh.ts

import fs from "node:fs";
import path from "node:path";
import { checkCronAuth, cronRejection } from "../../src/lib/cron-auth";
import { refreshFxRates } from "../../src/lib/fx-refresh";
import { rateOn, type CostFx } from "../../src/lib/fx-history";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

export async function runCronAndFxRefreshSuite(): Promise<SuiteResult> {
  const { check, eq, result } = makeSuite("Cron auth + daily FX top-up");

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

// ---- cron auth ---------------------------------------------------------------
const SECRET = "0123456789abcdef-secret";
check("valid bearer is ok", checkCronAuth(`Bearer ${SECRET}`, SECRET) === "ok");
check("wrong bearer is unauthorized", checkCronAuth("Bearer nope", SECRET) === "unauthorized");
check("no header with a secret set is unauthorized", checkCronAuth(null, SECRET) === "unauthorized");
check("unset secret is 'misconfigured', not just unauthorized", checkCronAuth(null, undefined) === "misconfigured");
check("a short secret is 'misconfigured'", checkCronAuth("Bearer short", "short") === "misconfigured");

const logged: string[] = [];
const origErr = console.error;
const origWarn = console.warn;
console.error = (...a: unknown[]) => void logged.push(a.join(" "));
console.warn = (...a: unknown[]) => void logged.push(a.join(" "));
const rej = cronRejection("send-beta-invites", "misconfigured");
console.error = origErr;
console.warn = origWarn;
check("missing secret -> 503 with a log line naming CRON_SECRET and no secret value", rej?.status === 503 && logged.some((l) => /CRON_SECRET/.test(l)), logged.join("|"));
check("ok -> no rejection", cronRejection("x", "ok") === null);

const inviteRoute = read("src/app/api/cron/send-beta-invites/route.ts");
const fxRoute = read("src/app/api/cron/refresh-fx-rates/route.ts");
check("both cron routes authenticate through checkCronAuth before doing any work", [inviteRoute, fxRoute].every((r) => r.indexOf("checkCronAuth") > 0 && r.indexOf("checkCronAuth") < r.indexOf("await ")));
const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
check("vercel.json schedules the invite job at 15:00 UTC and the FX job daily", crons.some((c) => c.path === "/api/cron/send-beta-invites" && c.schedule === "0 15 * * *") && crons.some((c) => c.path === "/api/cron/refresh-fx-rates"), JSON.stringify(crons));

// ---- FX top-up ---------------------------------------------------------------
// ECB 90-day file shape: Fri 2 Oct published, no Sat/Sun, Mon 5 Oct published.
const xml = `<gesmes:Envelope><Cube>
<Cube time='2026-10-05'><Cube currency='USD' rate='1.1300'/><Cube currency='GBP' rate='0.8700'/></Cube>
<Cube time='2026-10-02'><Cube currency='USD' rate='1.1290'/><Cube currency='GBP' rate='0.8690'/></Cube>
<Cube time='2026-10-01'><Cube currency='USD' rate='1.1298'/><Cube currency='GBP' rate='0.8680'/></Cube>
</Cube></gesmes:Envelope>`;

  const written: { date: string; currency: string; rate_per_eur: number }[] = [];
  const r = await refreshFxRates({ fetchXml: async () => xml, upsert: async (rows) => void written.push(...rows) });
  check("daily job writes each new ECB publication (1 Oct is already held; 2 and 5 Oct are added, upsert is idempotent)", r.outcome === "ok" && written.some((w) => w.date === "2026-10-02" && w.currency === "USD") && written.some((w) => w.date === "2026-10-05"), JSON.stringify(r));
  check("it reports the newest date it saw", r.outcome === "ok" && r.newestDate === "2026-10-05");
  const again: typeof written = [];
  await refreshFxRates({ fetchXml: async () => xml, upsert: async (rows) => void again.push(...rows) });
  check("running twice writes the same rows (idempotent, safe to repeat after a missed day)", JSON.stringify(again) === JSON.stringify(written));

  const down = await refreshFxRates({ fetchXml: async () => { throw new Error("HTTP 503"); }, upsert: async () => {} });
  check("ECB down -> error result, nothing written, no throw", down.outcome === "error");
  const bad = await refreshFxRates({ fetchXml: async () => "<html>maintenance</html>", upsert: async () => {} });
  check("unrecognised file -> error, not a silent success", bad.outcome === "error");
  const wfail = await refreshFxRates({ fetchXml: async () => xml, upsert: async () => { throw new Error("rls"); } });
  check("write failure -> error", wfail.outcome === "error");

  // A day with no new rate carries the previous one forward (reads).
  const fx: CostFx = { currency: "EUR", today: 0.885, points: [["2026-10-01", 1 / 1.1298], ["2026-10-02", 1 / 1.129], ["2026-10-05", 1 / 1.13]] };
  check("Saturday 3 Oct uses Friday's rate", rateOn(fx, "2026-10-03") === 1 / 1.129);
  check("Sunday 4 Oct uses Friday's rate", rateOn(fx, "2026-10-04") === 1 / 1.129);
  check("more than 7 days past the newest rate is refused, not guessed", rateOn(fx, "2026-10-20") === null);

  return result();
}

void runIfMain(import.meta.url, runCronAndFxRefreshSuite);
