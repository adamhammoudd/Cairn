// Audit 2026-10-02 items 1.1 (display half), 1.3 and 1.4: no "Live"/"Updates
// every" label beside a stored close; the date shown is the data's own date;
// one rule for what counts as a stale close; the portfolio card's date cannot
// disagree with the equity rows beside it.
//
// Run: npx tsx --conditions=react-server scripts/tests/price-freshness.ts

import fs from "node:fs";
import path from "node:path";
import { expectedLatestCloseDate } from "../../src/lib/market-hours";
import { describePriceFreshness } from "../../src/lib/price-freshness";
import { freshnessText } from "../../src/components/data-freshness";
import { portfolioCloseDate } from "../../src/lib/portfolio-as-of";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

export async function runPriceFreshnessSuite(): Promise<SuiteResult> {
  const { check, eq, result } = makeSuite("Price freshness labels and dates");


// 2026-10-02 is a Friday. EDT = UTC-4.
eq("Fri 12:00 ET (market open): latest close is Thursday", expectedLatestCloseDate(new Date("2026-10-02T16:00:00Z")), "2026-10-01");
eq("Fri 16:30 ET (closed, bar not stored yet): still Thursday", expectedLatestCloseDate(new Date("2026-10-02T20:30:00Z")), "2026-10-01");
eq("Fri 20:00 ET (bar due): Friday", expectedLatestCloseDate(new Date("2026-10-03T00:00:00Z")), "2026-10-02");
eq("Sat: Friday", expectedLatestCloseDate(new Date("2026-10-03T15:00:00Z")), "2026-10-02");
eq("Mon 10:00 ET: Friday", expectedLatestCloseDate(new Date("2026-10-05T14:00:00Z")), "2026-10-02");
eq("Tue after Labor Day (Mon 7 Sep 2026): Friday 4 Sep", expectedLatestCloseDate(new Date("2026-09-08T14:00:00Z")), "2026-09-04");

const now = new Date("2026-10-02T16:00:00Z"); // Fri 12:00 ET, market open

// ISRG: stored close from 25 Sep, no live quote.
const isrg = describePriceFreshness({ source: "last_close", asOf: "2026-09-25", assetType: "equity", now });
check("ISRG 25 Sep is stale", isrg.stale);
eq("ISRG label shows its own date", isrg.label, "Last close: 25 Sep");
check("ISRG gets a plain-English reason with the date", !!isrg.reason && isrg.reason.includes("25 Sep") && !/\b(buy|sell|should)\b/i.test(isrg.reason), String(isrg.reason));

// NVDA: Thursday's close during Friday's session is current.
const nvda = describePriceFreshness({ source: "last_close", asOf: "2026-10-01", assetType: "equity", now });
check("NVDA 1 Oct is current on Fri 2 Oct mid-session", !nvda.stale && nvda.reason === null);
eq("NVDA label", nvda.label, "Last close: 1 Oct");

// Crypto is judged by its own rule.
check("BTC dated today is current", !describePriceFreshness({ source: "last_close", asOf: "2026-10-02", assetType: "crypto", now }).stale);
check("BTC 5 days old is stale", describePriceFreshness({ source: "last_close", asOf: "2026-09-27", assetType: "crypto", now }).stale);

// The label text never claims live for a stored close, and never drops the date.
const text = freshnessText({ source: "last_close", asOf: "2026-09-25", detail: "daily closes" });
check("stored close is never labelled Live", !/live/i.test(text), text);
eq("detail is appended after the date", text, "Last close: 25 Sep · daily closes");
eq("a live quote says Live", freshnessText({ source: "live", asOf: "2026-10-02" }), "Live");

// 1.4: portfolio card date matches the equity rows, not the crypto bar.
eq(
  "portfolio card date ignores a crypto bar dated today",
  portfolioCloseDate([
    { symbol: "NVDA", assetType: "equity", asOf: "2026-10-01" },
    { symbol: "BTC", assetType: "crypto", asOf: "2026-10-02" },
    { symbol: "AMZN", assetType: "equity", asOf: "2026-10-01" },
  ]),
  "2026-10-01",
);
eq("crypto-only portfolio uses the crypto date", portfolioCloseDate([{ symbol: "BTC", assetType: "crypto", asOf: "2026-10-02" }]), "2026-10-02");
eq("empty portfolio has no date", portfolioCloseDate([]), null);

// The "Updates every N min" claim is gated on a live quote (source check).
const poll = fs.readFileSync(path.resolve(__dirname, "../../src/components/live-price-poll.tsx"), "utf8");
check("LivePricePoll renders nothing unless the price is live", /if \(!live \|\| !market\.isOpen\) return null/.test(poll));
const stats = fs.readFileSync(path.resolve(__dirname, "../../src/components/portfolio/portfolio-stats.tsx"), "utf8");
const hero = fs.readFileSync(path.resolve(__dirname, "../../src/components/ticker/ticker-hero.tsx"), "utf8");
check("every LivePricePoll call passes a live flag", /<LivePricePoll[^>]*live=/.test(stats) && /<LivePricePoll[^>]*live=/.test(hero));

  const ticker = fs.readFileSync(path.resolve(__dirname, "../../src/lib/actions/ticker.ts"), "utf8");
  check("loadTicker re-fetches a stored series older than the newest possible close (not only an empty one)", ticker.includes("recentBarsDesc[0].ts < expectedLatestCloseDate()") && ticker.includes(`ensureSymbolIngested(symbol, { range: "2y" })`));

  return result();
}

void runIfMain(import.meta.url, runPriceFreshnessSuite);
