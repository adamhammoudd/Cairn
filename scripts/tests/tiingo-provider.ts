// Locks the Tiingo integration in src/lib/market-data/provider.ts. Payloads are
// shaped like real Tiingo responses captured 2026-09-20 (IEX quote, hourly
// crypto bars, FX top-of-book), and fetch is stubbed - no key, no network.
//
// What each group guards:
//   * quote mapping   - a wrong Tiingo field name fails silently (everything is
//                       presence-checked), so the names are pinned here.
//   * marketOpen      - derived, because Tiingo sends no flag; current-price.ts
//                       picks its previous-close row from it.
//   * the 5,001 cap   - Tiingo silently drops the NEWEST bars of an over-long
//                       window; a capped response must fall through to Yahoo.
//   * forex           - Tiingo lists a pair one way round only, so USD/EUR is
//                       served by inverting eurusd.
//
// Run: npx tsx --conditions=react-server scripts/tests/tiingo-provider.ts

import { fetchIntradaySeries, fetchQuote, isEquityQuoteLive } from "../../src/lib/market-data/provider";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}
const near = (a: number | null | undefined, b: number, eps = 1e-6) => a != null && Math.abs(a - b) < eps;

const realFetch = globalThis.fetch;
const calls: { url: string; headers: Record<string, string> }[] = [];
let tiingo: (url: string) => Response = () => new Response("{}", { status: 500 });
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const YAHOO = { chart: { result: [{ timestamp: [1_700_000_000], indicators: { quote: [{ close: [42] }] } }] } };

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith("https://api.tiingo.com")) {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    return tiingo(url);
  }
  return json(YAHOO); // Yahoo, the keyless fallback
}) as typeof fetch;

async function main() {
  process.env.TIINGO_API_KEY = "test-key";

  // ---- equity quote ---------------------------------------------------------
  tiingo = () =>
    json([
      { ticker: "AAPL", timestamp: "2026-09-18T20:00:00+00:00", lastSaleTimestamp: null, quoteTimestamp: null, open: 337.905, high: 338.49, low: 332.53, mid: null, tngoLast: 336.13, last: null, lastSize: null, bidSize: null, bidPrice: null, askPrice: null, askSize: null, volume: 86588203, prevClose: 337.0 },
    ]);
  const eq = await fetchQuote("AAPL", "equity");
  check("equity price is tngoLast (last is null without an IEX agreement)", near(eq?.price, 336.13));
  check("equity changePercent is derived from prevClose", near(eq?.changePercent, ((336.13 - 337) / 337) * 100));
  check("equity open/high/low/volume map from the IEX fields", eq?.open === 337.905 && eq?.dayHigh === 338.49 && eq?.dayLow === 332.53 && eq?.volume === 86588203);
  check("equity quoteDate is the exchange date of the stamp", eq?.quoteDate === "2026-09-18", String(eq?.quoteDate));
  check("a Friday-stamped quote read on a weekend is not marketOpen", eq?.marketOpen === false);
  check("the token goes in the Authorization header, not the URL", calls.at(-1)?.headers.Authorization === "Token test-key" && !calls.at(-1)!.url.includes("test-key"));
  check("equity quote hits /iex/<ticker>", calls.at(-1)?.url === "https://api.tiingo.com/iex/AAPL", calls.at(-1)?.url);

  const stampedLate = "2026-09-19T01:30:00+00:00"; // Sat 01:30Z = Fri 21:30 New York
  tiingo = () => json([{ ticker: "AAPL", timestamp: stampedLate, tngoLast: 1, prevClose: 1 }]);
  check("quoteDate uses the New York date, not the UTC date", (await fetchQuote("AAPL"))?.quoteDate === "2026-09-18");

  tiingo = () => json([{ ticker: "AAPL", timestamp: "2026-09-18T20:00:00+00:00", tngoLast: null }]);
  check("no tngoLast => no quote (not a null-priced object)", (await fetchQuote("AAPL")) === null);
  tiingo = () => json({ detail: "Error: You have run over your hourly request allocation." }, 429);
  check("a 429 is no quote", (await fetchQuote("AAPL")) === null);
  tiingo = () => {
    throw new Error("network down");
  };
  check("a network throw is no quote, not an exception", (await fetchQuote("AAPL")) === null);

  // ---- marketOpen derivation (2026-09-18 is EDT, UTC-4) ----------------------
  const at = (iso: string) => new Date(iso);
  check("in session and fresh => live", isEquityQuoteLive(at("2026-09-18T14:50:00Z"), at("2026-09-18T15:00:00Z")));
  check("in session but the stamp is 45 min old => not live", !isEquityQuoteLive(at("2026-09-18T14:15:00Z"), at("2026-09-18T15:00:00Z")));
  check("stamp from the previous day => not live", !isEquityQuoteLive(at("2026-09-17T19:59:00Z"), at("2026-09-18T15:00:00Z")));
  check("after the close => not live", !isEquityQuoteLive(at("2026-09-18T19:59:00Z"), at("2026-09-18T20:05:00Z")));
  check("before the open => not live", !isEquityQuoteLive(at("2026-09-18T13:00:00Z"), at("2026-09-18T13:10:00Z")));
  check("at 09:30 sharp => live", isEquityQuoteLive(at("2026-09-18T13:30:00Z"), at("2026-09-18T13:30:30Z")));
  check("Sunday reading Friday's close => not live", !isEquityQuoteLive(at("2026-09-18T20:00:00Z"), at("2026-09-20T15:00:00Z")));

  // ---- crypto quote ---------------------------------------------------------
  const bar = (date: string, o: number, h: number, l: number, c: number, v: number) => ({ date, open: o, high: h, low: l, close: c, volume: v, volumeNotional: 0, tradesDone: 1 });
  tiingo = () =>
    json([{ ticker: "btcusd", baseCurrency: "btc", quoteCurrency: "usd", priceData: [
      bar("2026-09-19T22:00:00+00:00", 99, 101, 98, 100, 3),
      bar("2026-09-19T23:00:00+00:00", 100, 111, 99, 110, 4),
      bar("2026-09-20T00:00:00+00:00", 110, 115, 108, 112, 5),
      bar("2026-09-20T01:00:00+00:00", 112, 120, 111, 118, 7),
    ] }]);
  const btc = await fetchQuote("BTC", "crypto");
  check("crypto price is the last bar's close", btc?.price === 118);
  check("crypto change is against the last bar before the UTC day", near(btc?.changePercent, ((118 - 110) / 110) * 100));
  check("crypto day open/high/low/volume fold the day's bars", btc?.open === 110 && btc?.dayHigh === 120 && btc?.dayLow === 108 && btc?.volume === 12);
  check("crypto is marketOpen and dated by UTC", btc?.marketOpen === true && btc?.quoteDate === "2026-09-20");
  for (const s of ["BTC", "BTC-USD", "BTC/USD"]) {
    await fetchQuote(s, "crypto");
    check(`crypto ticker for ${s} is btcusd`, new URL(calls.at(-1)!.url).searchParams.get("tickers") === "btcusd");
  }

  // ---- forex ----------------------------------------------------------------
  const fx = (ticker: string, mid: number) => ({ ticker, quoteTimestamp: "2026-09-20T13:52:08.318000+00:00", bidPrice: mid, askPrice: mid, midPrice: mid });
  tiingo = () => json([fx("usdjpy", 156.882)]);
  check("USD/JPY uses usdjpy directly", near((await fetchQuote("USD/JPY"))?.price, 156.882));
  // usdeur is not listed. Captured live 2026-09-20: the surviving row is keyed
  // `index`, not `ticker`, when the request names a pair Tiingo does not carry.
  const eurRow: Record<string, unknown> = { ...fx("eurusd", 1.14859), index: "eurusd" };
  delete eurRow.ticker;
  tiingo = () => json([eurRow]);
  const eur = await fetchQuote("USD/EUR");
  check("USD/EUR is the inverse of eurusd (USD -> EUR, ~0.87), even when the row is keyed `index`", near(eur?.price, 1 / 1.14859), String(eur?.price));
  tiingo = () => json([fx("eurusd", 1.14859)]);
  check("the inverse also works when the row is keyed `ticker`", near((await fetchQuote("USD/EUR"))?.price, 1 / 1.14859));
  check("both pair orders are requested in one call", new URL(calls.at(-1)!.url).searchParams.get("tickers") === "usdeur,eurusd");
  tiingo = () => json([]);
  check("a pair Tiingo does not list is no quote", (await fetchQuote("USD/XYZ")) === null);
  const n = calls.length;
  check("a non-pair slash symbol makes no request", (await fetchQuote("BRK/B/C")) === null && calls.length === n);

  // ---- intraday -------------------------------------------------------------
  const iexBar = (date: string, close: number) => ({ date, open: close, high: close, low: close, close });
  const closes = (b: { close: number | null }[] | null) => b?.map((x) => x.close).join(",");
  const session = [
    iexBar("2026-09-18T13:00:00.000Z", 1), // 09:00 ET, pre-market
    iexBar("2026-09-18T13:30:00.000Z", 2), // 09:30 ET, open
    iexBar("2026-09-18T19:59:00.000Z", 3), // 15:59 ET, last regular bar
    iexBar("2026-09-18T20:00:00.000Z", 4), // 16:00 ET, after-hours
  ];
  tiingo = () => json(session);
  check("extended hours off drops bars outside 09:30-16:00 ET", closes(await fetchIntradaySeries("AAPL", "1min", 400, false, "equity")) === "2,3");
  check("extended hours off does not send afterHours", !calls.at(-1)!.url.includes("afterHours"));
  check("extended hours on keeps every bar", closes(await fetchIntradaySeries("AAPL", "1min", 400, true, "equity")) === "1,2,3,4");
  check("extended hours on asks Tiingo for afterHours=true", calls.at(-1)!.url.includes("afterHours=true"));
  check("outputsize keeps the most recent bars", closes(await fetchIntradaySeries("AAPL", "1min", 2, true, "equity")) === "3,4");

  tiingo = () => json([{ ticker: "btcusd", priceData: [bar("2026-09-18T13:00:00+00:00", 1, 1, 1, 1, 1), bar("2026-09-18T22:00:00+00:00", 1, 1, 1, 5, 1)] }]);
  check("crypto has no session: extended hours off keeps every bar", closes(await fetchIntradaySeries("BTC", "1min", 400, false, "crypto")) === "1,5");
  const url = new URL(calls.at(-1)!.url);
  check("crypto intraday uses the btcusd pair", url.searchParams.get("tickers") === "btcusd");
  check("crypto 1min looks back one day (a longer window hits Tiingo's row cap)", url.searchParams.get("startDate") === new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  check("crypto never sends afterHours", !url.search.includes("afterHours"));

  const rows = Array.from({ length: 5001 }, (_, i) => bar(new Date(Date.UTC(2026, 8, 16) + i * 60_000).toISOString(), 1, 1, 1, i, 1));
  tiingo = () => json([{ ticker: "btcusd", priceData: rows }]);
  check("a response at Tiingo's 5,001-row cap falls through to Yahoo", closes(await fetchIntradaySeries("BTC", "1min", 400, false, "crypto")) === "42");

  tiingo = () => json({ detail: "Invalid token." }, 403);
  check("a rejected key falls through to Yahoo", closes(await fetchIntradaySeries("AAPL", "1min", 400, false, "equity")) === "42");
  tiingo = () => {
    throw new Error("network down");
  };
  check("a network throw falls through to Yahoo", closes(await fetchIntradaySeries("AAPL", "1min", 400, false, "equity")) === "42");
  tiingo = () => json([]);
  check("an empty Tiingo series falls through to Yahoo", closes(await fetchIntradaySeries("AAPL", "1min", 400, false, "equity")) === "42");

  // ---- no key ---------------------------------------------------------------
  delete process.env.TIINGO_API_KEY;
  const before = calls.length;
  check("no key: fetchQuote is null and makes no request", (await fetchQuote("AAPL")) === null && calls.length === before);
  check("no key: intraday is served by Yahoo without touching Tiingo", closes(await fetchIntradaySeries("AAPL", "1min", 400, false, "equity")) === "42" && calls.length === before);
}

main()
  .catch((e) => {
    console.error(e);
    fail++;
  })
  .finally(() => {
    globalThis.fetch = realFetch;
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  });
