// Regression test for the market-feed editorial gate
// (supabase/functions/_shared/editorial.ts).
//
// The cases that matter are the two the verification audit actually found in
// the live feed - a rental-property tax question and a phishing warning - plus
// the negative direction: real market headlines the filter must NOT drop, and
// the consumer-topic-but-genuinely-market-news case where the two lexicons
// collide. A suite that only asserted the two known-bad items would pass while
// silently gutting the feed.
//
// Run: npm run test:editorial

import { editorialVerdict } from "../../supabase/functions/_shared/editorial";
import type { SuiteResult, TestCase } from "./report";

interface Case {
  name: string;
  title: string;
  body?: string | null;
  tickers?: string[];
  sectors?: string[];
  expectKeep: boolean;
  /** Asserted when given, so a case can't pass for the wrong reason. */
  expectReason?: string;
}

const CASES: Case[] = [
  // ---- the two categories the audit found in the live market feed ----
  {
    name: "rental-property tax question is dropped",
    title: "Can I deduct a new roof on my rental property this tax season?",
    body: "A reader asks how landlords should handle capital improvements at tax filing time.",
    expectKeep: false,
    expectReason: "consumer_personal_finance",
  },
  {
    name: "phishing warning is dropped",
    title: "Watch out for this new phishing scam targeting your bank login",
    body: "Fraudsters are impersonating account-security emails to steal credentials.",
    expectKeep: false,
    expectReason: "consumer_personal_finance",
  },
  {
    name: "credit-card rewards service piece is dropped",
    title: "The best credit cards for cashback in 2026",
    body: "Our picks for rewards points on everyday spending.",
    expectKeep: false,
    expectReason: "consumer_personal_finance",
  },
  {
    name: "off-topic item with no market signal at all is dropped",
    title: "Five ways to make your morning commute less stressful",
    body: null,
    expectKeep: false,
    expectReason: "no_market_signal",
  },

  // ---- the negative direction: real market news must survive ----
  {
    name: "macro headline is kept on market signal alone",
    title: "Fed holds rates steady as inflation cools to 2.4%",
    body: "The FOMC left the target range unchanged.",
    expectKeep: true,
    expectReason: "market_signal",
  },
  {
    name: "earnings headline is kept",
    title: "Retailer cuts full-year guidance after weak quarterly results",
    body: "Shares fell in after-hours trading as revenue missed estimates.",
    expectKeep: true,
    expectReason: "market_signal",
  },
  {
    name: "crypto market headline is kept",
    title: "Bitcoin slips below $60,000 as ETF outflows accelerate",
    body: null,
    expectKeep: true,
    expectReason: "market_signal",
  },
  {
    name: "SEC filing item is kept",
    title: "8-K filing discloses CFO departure",
    body: "The company filed an 8-K with the SEC late Friday.",
    expectKeep: true,
    expectReason: "market_signal",
  },

  // ---- the collision case: consumer topic that IS market news ----
  {
    name: "consumer-finance topic with market signal is kept, not vetoed",
    title: "Rising credit card delinquencies weigh on bank earnings",
    body: "Analysts cut estimates for consumer lenders ahead of the quarter.",
    expectKeep: true,
    expectReason: "market_signal",
  },
  {
    name: "student-loan story with macro framing is kept",
    title: "Student loan repayment restart shows up in consumer spending and GDP data",
    body: null,
    expectKeep: true,
    expectReason: "market_signal",
  },

  // ---- tagged items can never be dropped (holdings-relevance guarantee) ----
  {
    name: "item tagged to a tracked ticker is kept even with no market vocabulary",
    title: "A quiet week in Cupertino",
    body: "Not much happened.",
    tickers: ["AAPL"],
    expectKeep: true,
    expectReason: "tagged",
  },
  {
    name: "item tagged to a sector is kept even if it reads as consumer advice",
    title: "How to save money on your car insurance",
    body: null,
    sectors: ["Financials"],
    expectKeep: true,
    expectReason: "tagged",
  },
];

export function runEditorialSuite(): SuiteResult {
  const cases: TestCase[] = CASES.map((c) => {
    const verdict = editorialVerdict(c.title, c.body ?? null, c.tickers ?? [], c.sectors ?? []);
    const keepOk = verdict.keep === c.expectKeep;
    const reasonOk = c.expectReason === undefined || verdict.reason === c.expectReason;

    if (keepOk && reasonOk) {
      return {
        name: c.name,
        status: "pass" as const,
        detail: `${verdict.keep ? "kept" : "dropped"} (${verdict.reason})`,
      };
    }
    return {
      name: c.name,
      status: "fail" as const,
      detail: `expected keep=${c.expectKeep}${c.expectReason ? ` reason=${c.expectReason}` : ""}, got keep=${
        verdict.keep
      } reason=${verdict.reason}`,
      attachment: `${c.title}\n${c.body ?? ""}`,
    };
  });

  return { suiteName: "News editorial gate (market-feed quality)", gating: true, cases };
}

// Only self-execute when invoked directly; importing from run-all.ts must not
// call process.exit.
if (process.argv[1] && process.argv[1].endsWith("editorial.ts")) {
  const suite = runEditorialSuite();
  for (const c of suite.cases) {
    console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  }
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} editorial cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
