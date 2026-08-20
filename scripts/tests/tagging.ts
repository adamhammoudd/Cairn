// Regression test for the news tagger (supabase/functions/_shared/tagging.ts).
//
// Written against real headlines pulled from news_items, including ones the
// tagger is expected NOT to match. The negative cases are the point: crypto
// tickers are short English words (RAIN, HYPE, LEO, GRAM), so a tagger that
// passes only the positive cases is not doing its job.
//
// Run: npx tsx scripts/tests/tagging.ts

import { tagContent, type CryptoUniverseEntry } from "../../supabase/functions/_shared/tagging";
import type { SuiteResult, TestCase } from "./report";

// A slice of the live top-25 universe, including the collision-prone symbols.
const UNIVERSE: CryptoUniverseEntry[] = [
  { symbol: "BTC", name: "Bitcoin" },
  { symbol: "ETH", name: "Ethereum" },
  { symbol: "XRP", name: "XRP" },
  { symbol: "SOL", name: "Solana" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "RAIN", name: "Rain" },
  { symbol: "HYPE", name: "Hyperliquid" },
  { symbol: "LEO", name: "LEO Token" },
  { symbol: "GRAM", name: "Gram" },
  { symbol: "CC", name: "CC" },
];

interface Case {
  name: string;
  title: string;
  body?: string | null;
  expectTickers?: string[];
  expectNotTickers?: string[];
  expectSectors?: string[];
  expectNotSectors?: string[];
}

const CASES: Case[] = [
  // --- real headlines from news_items ---
  {
    name: "bitcoin+ethereum headline tags both coins and the crypto sector",
    title:
      "Bitcoin and ethereum prices today, Wednesday, August 19, 2026: Crypto prices rise after SEC announces proposed regulation",
    expectTickers: ["BTC", "ETH"],
    expectSectors: ["crypto"],
  },
  {
    name: "bare BTC symbol in a headline is tagged",
    title: "Bitcoin Bulls Go Missing as BTC Upside Volatility Sinks to All-Time Low: Glassnode",
    expectTickers: ["BTC"],
  },
  {
    name: "generic crypto-market headline gets the sector without a coin",
    title: "Why Is The Crypto Market Down Today?",
    expectSectors: ["crypto"],
    expectNotTickers: ["BTC", "ETH"],
  },
  {
    name: "equity tagging still works alongside crypto in the same story",
    title: "Stock Market Today: S&P 500 Higher As Fed Minutes Loom; Bitcoin Jumps Ahead Of White House Meet",
    expectTickers: ["SPY", "BTC"],
    expectSectors: ["crypto", "macro"],
  },
  {
    name: "equity-only headline is untouched by the crypto pass",
    title: "Apple's stock could be the savviest buy within Big Tech, according to this analysis",
    expectTickers: ["AAPL"],
    expectSectors: ["technology"],
    expectNotSectors: ["crypto"],
  },

  // --- the negative cases the short-symbol rules exist for ---
  {
    name: "lowercase english word does not tag the RAIN ticker",
    title: "Heavy rain disrupted supply chains across the Gulf Coast this quarter",
    expectNotTickers: ["RAIN"],
  },
  {
    name: "lowercase 'hype' does not tag the HYPE ticker",
    title: "Analysts warn the AI hype cycle has outrun revenue",
    expectNotTickers: ["HYPE"],
  },
  {
    name: "two-letter symbols are below the length floor and never tag",
    title: "The CC of the board circulated a memo",
    expectNotTickers: ["CC"],
  },
  {
    name: "a person named Leo does not tag the LEO ticker",
    title: "Leo Chen was appointed chief financial officer",
    expectNotTickers: ["LEO"],
  },
];

// Exposed as a SuiteResult so run-all.ts can gate on it. This suite existed
// but was wired into nothing -- not run-all, not package.json -- so the crypto
// tagging that unblocks every crypto analysis had no CI coverage at all.
export function runTaggingSuite(): SuiteResult {
  const cases: TestCase[] = CASES.map((c) => {
    const { tickers, sectors } = tagContent(c.title, c.body ?? null, UNIVERSE);
    const problems: string[] = [];
    for (const t of c.expectTickers ?? []) if (!tickers.includes(t)) problems.push(`missing ticker ${t}`);
    for (const t of c.expectNotTickers ?? []) if (tickers.includes(t)) problems.push(`unexpected ticker ${t}`);
    for (const sec of c.expectSectors ?? []) if (!sectors.includes(sec)) problems.push(`missing sector ${sec}`);
    for (const sec of c.expectNotSectors ?? []) if (sectors.includes(sec)) problems.push(`unexpected sector ${sec}`);
    return {
      name: c.name,
      status: problems.length === 0 ? ("pass" as const) : ("fail" as const),
      detail: problems.length === 0 ? "tagged as expected" : problems.join("; "),
      attachment: problems.length === 0 ? undefined : `tickers=[${tickers.join(",")}] sectors=[${sectors.join(",")}]`,
    };
  });

  return { suiteName: "News tagging", gating: true, cases };
}

function run(): number {
  let failures = 0;

  for (const c of CASES) {
    const { tickers, sectors } = tagContent(c.title, c.body ?? null, UNIVERSE);
    const problems: string[] = [];

    for (const t of c.expectTickers ?? []) if (!tickers.includes(t)) problems.push(`missing ticker ${t}`);
    for (const t of c.expectNotTickers ?? []) if (tickers.includes(t)) problems.push(`unexpected ticker ${t}`);
    for (const s of c.expectSectors ?? []) if (!sectors.includes(s)) problems.push(`missing sector ${s}`);
    for (const s of c.expectNotSectors ?? []) if (sectors.includes(s)) problems.push(`unexpected sector ${s}`);

    if (problems.length > 0) {
      failures++;
      console.error(`FAIL  ${c.name}`);
      console.error(`      ${problems.join("; ")}`);
      console.error(`      got tickers=[${tickers.join(",")}] sectors=[${sectors.join(",")}]`);
    } else {
      console.log(`pass  ${c.name}`);
    }
  }

  console.log(`\n${CASES.length - failures}/${CASES.length} tagging cases passed`);
  return failures;
}

// Only self-execute when invoked directly (npm run test:tagging); importing
// this module from run-all.ts must not call process.exit.
if (process.argv[1] && process.argv[1].endsWith("tagging.ts")) {
  const failed = run();
  process.exit(failed === 0 ? 0 : 1);
}
