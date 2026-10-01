// Cost basis in the reader's own currency, converted at the rate on the
// purchase date (fix/cost-basis-fx).
//
// Reproduction, 1 Oct 2026 - Adam's four holdings, a EUR reader:
//   Yahoo Finance  value EUR 162.47, cost EUR 153.27, all-time gain +EUR 9.20
//   Cairn (before) value EUR 160.71, cost EUR 157.93, all-time gain +EUR 2.78
// Cairn converted the dollars paid at TODAY's ECB rate, so the euro move since
// each purchase never reached the gain. The rates below are the ECB's published
// USD reference rates for the actual purchase dates (holdings rows) and for
// 1 Oct 2026. Nothing touches the network.
//
// What the ECB data gives, and what it does not: converting the same dollar
// costs at the ECB rate on each purchase date gives EUR 152.99, not Yahoo's
// 153.27 - EUR 0.28 apart. No date convention reproduces Yahoo's figure (tried
// -2..+3 business days), so the remaining gap is Yahoo's own FX source, not a
// bug here. The suite pins both: the exact ECB figure, and "within EUR 0.30 of
// Yahoo" (the closest honest claim), rather than tuning a tolerance to pass.
//
// Run: npx tsx --conditions=react-server scripts/tests/cost-basis-fx.ts
import type { SuiteResult, TestCase } from "./report";
import { writeReport } from "./report";

const near = (a: number | null | undefined, b: number, eps: number) => a != null && Math.abs(a - b) <= eps;

// ECB USD per EUR (the published reference rates), ascending. 2025-11-01 is a
// Saturday, so AMZN's purchase takes Friday 31 Oct.
const USD_PER_EUR: [string, number][] = [
  ["2025-10-30", 1.155],
  ["2025-10-31", 1.1554],
  ["2025-11-03", 1.1514],
  ["2025-12-01", 1.1646],
  ["2025-12-02", 1.1614],
  ["2026-05-05", 1.1686],
  ["2026-05-06", 1.1762],
  ["2026-09-30", 1.1355],
  ["2026-10-01", 1.1298],
];
// Display currency per USD = 1 / (USD per EUR) for a EUR reader.
const EUR_PER_USD: [string, number][] = USD_PER_EUR.map(([d, r]) => [d, 1 / r]);
const TODAY_EUR_PER_USD = 1 / 1.1298;

type H = { id: string; symbol: string; asset_type: string; quantity: number; purchase_price: number; purchase_date: string };
const ADAM: H[] = [
  { id: "1", symbol: "NVDA", asset_type: "equity", quantity: 0.257, purchase_price: 183.81, purchase_date: "2025-12-02" },
  { id: "2", symbol: "ISRG", asset_type: "equity", quantity: 0.1301, purchase_price: 459.07, purchase_date: "2026-05-06" },
  { id: "3", symbol: "BTC", asset_type: "crypto", quantity: 0.000544, purchase_price: 85286.46, purchase_date: "2025-12-01" },
  { id: "4", symbol: "AMZN", asset_type: "equity", quantity: 0.098, purchase_price: 255.79, purchase_date: "2025-11-01" },
];

export async function runCostBasisFxSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const portfolio = (await import("../../src/lib/portfolio")) as Record<string, any>;
  const fxh = (await import("../../src/lib/fx-history")) as Record<string, any>;
  const { computeHoldingMetrics, computeTotals, computeTimelineSeries } = portfolio;
  const { rateOn } = fxh;

  const costFx = { currency: "EUR", today: TODAY_EUR_PER_USD, points: EUR_PER_USD };

  // Prices chosen so the position is worth Yahoo's EUR 162.47 at today's rate.
  const valueUsd = 162.47 / TODAY_EUR_PER_USD;
  const usdCost = ADAM.reduce((s, h) => s + h.quantity * h.purchase_price, 0);
  const weights = ADAM.map((h) => (h.quantity * h.purchase_price) / usdCost);
  const closes = new Map(
    ADAM.map((h, i) => [h.symbol, { latest: (valueUsd * weights[i]) / h.quantity, prev: (valueUsd * weights[i]) / h.quantity }]),
  );

  // --- the "before": today's rate on the cost, which is what Cairn showed ---
  const before = computeTotals(computeHoldingMetrics(ADAM, closes), closes);
  const beforeCostEur = before.totalCostBasis * TODAY_EUR_PER_USD;
  check(
    "reproduction: converting the cost at today's rate gives Cairn's EUR 157.93",
    near(beforeCostEur, 157.93, 0.01),
    `cost EUR ${beforeCostEur.toFixed(2)} (Cairn showed 157.93; Yahoo 153.27)`,
  );
  check(
    "reproduction: that leaves the gain at +EUR 4.54, short of Yahoo's +EUR 9.20",
    near(before.totalGain * TODAY_EUR_PER_USD, 4.54, 0.01),
    `gain EUR ${(before.totalGain * TODAY_EUR_PER_USD).toFixed(2)} at the same EUR 162.47 value`,
  );

  // --- the fix ---
  const metrics = computeHoldingMetrics(ADAM, closes, costFx);
  const totals = computeTotals(metrics, closes);
  const costEur = totals.totalCostBasis * TODAY_EUR_PER_USD;
  const gainEur = totals.totalGain * TODAY_EUR_PER_USD;
  const valueEur = totals.totalValue * TODAY_EUR_PER_USD;
  check("value today stays at today's rate (EUR 162.47)", near(valueEur, 162.47, 0.005), `EUR ${valueEur.toFixed(2)}`);
  check("cost basis is the ECB rate on each purchase date: EUR 152.99", near(costEur, 152.99, 0.01), `EUR ${costEur.toFixed(2)}`);
  check("cost basis is within EUR 0.30 of Yahoo's EUR 153.27", near(costEur, 153.27, 0.3), `EUR ${costEur.toFixed(2)} (off by ${(costEur - 153.27).toFixed(2)})`);
  check("gain is within EUR 0.30 of Yahoo's +EUR 9.20", near(gainEur, 9.2, 0.3), `+EUR ${gainEur.toFixed(2)} (off by ${(gainEur - 9.2).toFixed(2)})`);
  check("gain = value today minus cost", near(gainEur, valueEur - costEur, 1e-9), `${gainEur.toFixed(4)}`);

  // --- the split adds up ---
  check(
    "price part + exchange-rate part = total gain",
    near((totals.totalPriceGain + totals.totalFxGain) * TODAY_EUR_PER_USD, gainEur, 1e-9),
    `price ${(totals.totalPriceGain * TODAY_EUR_PER_USD).toFixed(2)} + rate ${(totals.totalFxGain * TODAY_EUR_PER_USD).toFixed(2)} = ${gainEur.toFixed(2)}`,
  );
  check(
    "the price part is the asset's own move at today's rate",
    near(totals.totalPriceGain * TODAY_EUR_PER_USD, (totals.totalValue - usdCost) * TODAY_EUR_PER_USD, 1e-9),
    `EUR ${(totals.totalPriceGain * TODAY_EUR_PER_USD).toFixed(2)}`,
  );
  check("the cost was converted at the purchase date for every holding", totals.costAtTodayRateCount === 0, `${totals.costAtTodayRateCount} at today's rate`);
  check("a converted portfolio says so (the split is shown)", totals.costConverted === true, "costConverted");

  // --- a USD reader is unchanged ---
  const usdMetrics = computeHoldingMetrics(ADAM, closes, null);
  const usdTotals = computeTotals(usdMetrics, closes);
  check("a USD reader: cost is dollars paid, exactly", near(usdTotals.totalCostBasis, usdCost, 1e-9), `$${usdTotals.totalCostBasis.toFixed(2)}`);
  check("a USD reader: no split", usdTotals.costConverted === false && usdTotals.totalFxGain === 0, `fx part ${usdTotals.totalFxGain}`);
  check("a USD reader: gain identical to before", near(usdTotals.totalGain, before.totalGain, 1e-12), `${usdTotals.totalGain.toFixed(4)}`);
  const usdFx = computeHoldingMetrics(ADAM, closes, { currency: "USD", today: 1, points: ADAM.map((h) => [h.purchase_date, 1] as [string, number]) });
  check("a USD series (all 1) is a no-op too", near(computeTotals(usdFx, closes).totalGain, before.totalGain, 1e-12), "");

  // --- weekend and holiday purchase dates take the previous business day ---
  check("Saturday 2025-11-01 uses Friday 2025-10-31's rate", near(rateOn(costFx, "2025-11-01"), 1 / 1.1554, 1e-12), `${rateOn(costFx, "2025-11-01")}`);
  check("Sunday 2025-11-02 uses Friday's rate, not Monday's", near(rateOn(costFx, "2025-11-02"), 1 / 1.1554, 1e-12), "");
  check("a business day uses its own rate", near(rateOn(costFx, "2025-11-03"), 1 / 1.1514, 1e-12), "");

  // --- a date older than the rates we hold, or missing: today's rate, and it is counted ---
  check("older than the first rate held: null (caller says so)", rateOn(costFx, "2019-03-01") === null, "");
  check("missing date: null", rateOn(costFx, "") === null && rateOn(costFx, null) === null, "");
  check("garbage date: null", rateOn(costFx, "not-a-date") === null, "");
  check("far newer than the last rate held (stale table): null", rateOn(costFx, "2026-12-25") === null, "");
  const old: H[] = [{ ...ADAM[0], purchase_date: "2019-03-01" }, { ...ADAM[1], purchase_date: "" }];
  const oldClose = new Map(old.map((h) => [h.symbol, { latest: h.purchase_price, prev: h.purchase_price }]));
  const oldM = computeHoldingMetrics(old, oldClose, costFx);
  const oldT = computeTotals(oldM, oldClose);
  check(
    "no rate for the date: cost at today's rate (no phantom exchange-rate gain), counted",
    oldM.every((m: any) => near(m.costBasis, m.purchase_price * m.quantity, 1e-12) && m.costRate === "today-rate") && oldT.costAtTodayRateCount === 2 && near(oldT.totalFxGain, 0, 1e-12),
    `${oldT.costAtTodayRateCount} of ${oldM.length} at today's rate`,
  );
  const emptyM = computeHoldingMetrics(ADAM, closes, { currency: "EUR", today: TODAY_EUR_PER_USD, points: [] });
  check("no history at all: every holding falls back and says so", computeTotals(emptyM, closes).costAtTodayRateCount === 4, "");

  // --- a holding with no price counts at cost, adds nothing to gain ---
  const unpriced = computeHoldingMetrics(ADAM, new Map(), costFx);
  const unpricedT = computeTotals(unpriced, new Map());
  check("an unpriced holding adds 0 to gain and to the split", near(unpricedT.totalGain, 0, 1e-9) && near(unpricedT.totalFxGain, 0, 1e-9) && near(unpricedT.totalPriceGain, 0, 1e-9), `gain ${unpricedT.totalGain}`);

  // --- edited / sold holdings: each row stands alone, totals are sums of rows ---
  const edited = ADAM.map((h) => (h.symbol === "NVDA" ? { ...h, purchase_date: "2025-12-01", purchase_price: 190 } : h));
  const eM = computeHoldingMetrics(edited, closes, costFx);
  const nv = eM.find((m: any) => m.symbol === "NVDA");
  check("an edited date/price recomputes that row only", near(nv.costBasis * TODAY_EUR_PER_USD, (0.257 * 190) / 1.1646, 1e-9), `EUR ${(nv.costBasis * TODAY_EUR_PER_USD).toFixed(4)}`);
  const sold = computeTotals(computeHoldingMetrics(ADAM.slice(1), closes, costFx), closes);
  check("a sold holding drops out of cost and gain", sold.totalCostBasis < totals.totalCostBasis && sold.costAtTodayRateCount === 0, `$${sold.totalCostBasis.toFixed(2)}`);

  // --- a holding in the display currency's own terms: ratio 1 changes nothing ---
  const same = computeHoldingMetrics(ADAM, closes, { currency: "EUR", today: TODAY_EUR_PER_USD, points: ADAM.map((h) => [h.purchase_date, TODAY_EUR_PER_USD] as [string, number]) });
  check("rate on purchase date equal to today's: cost unchanged, no exchange-rate part", near(computeTotals(same, closes).totalFxGain, 0, 1e-9), "");

  // --- chart: no historical point converted at today's rate ---
  const bars = [
    { symbol: "NVDA", asset_type: "equity", ts: "2025-12-02", close: 180 },
    { symbol: "NVDA", asset_type: "equity", ts: "2026-09-30", close: 200 },
    { symbol: "NVDA", asset_type: "equity", ts: "2026-10-01", close: 200 },
  ];
  const series = computeTimelineSeries([ADAM[0]], bars, "ALL", costFx) as { date: string; value: number }[];
  const at = (d: string) => series.find((p) => p.date === d)!.value * TODAY_EUR_PER_USD;
  check("chart: 2025-12-02 point is valued at that day's rate", near(at("2025-12-02"), (180 * 0.257) / 1.1614, 1e-9), `EUR ${at("2025-12-02").toFixed(4)}`);
  check("chart: 2026-09-30 point is valued at that day's rate", near(at("2026-09-30"), (200 * 0.257) / 1.1355, 1e-9), `EUR ${at("2026-09-30").toFixed(4)}`);
  check("chart: the last point matches Total value (today's rate)", near(at("2026-10-01"), (200 * 0.257) / 1.1298, 1e-9), `EUR ${at("2026-10-01").toFixed(4)}`);
  const plain = computeTimelineSeries([ADAM[0]], bars, "ALL") as { date: string; value: number }[];
  check("chart: a USD reader's series is untouched", near(plain[0].value, 180 * 0.257, 1e-9), `$${plain[0].value.toFixed(4)}`);

  // --- the split text (pure), no advice wording ---
  const { gainSplit } = (await import("../../src/lib/gain-split")) as Record<string, any>;
  const prefs = { effectiveCurrency: "EUR", fxRate: TODAY_EUR_PER_USD, fxSource: "ECB" };
  const split = gainSplit(totals, prefs);
  check("split: price + exchange rate add up to the total, to the cent", split && near(split.price + split.exchange, split.total, 1e-9), split ? `${split.price} + ${split.exchange} = ${split.total}` : "no split");
  check("split: hidden for a USD reader", gainSplit(usdTotals, { effectiveCurrency: "USD", fxRate: 1, fxSource: null }) === null, "");
  const words = split ? `${split.priceLabel} ${split.exchangeLabel}` : "";
  check("split: plain words, no advice or verdict", /From the price/.test(words) && /From the exchange rate/.test(words) && !/good|bad|should|buy|sell|hold|great|poor/i.test(words), words);

  return { suiteName: "Cost basis at the purchase-date rate (display-currency gain)", gating: true, cases };
}

if (process.argv[1]?.endsWith("cost-basis-fx.ts")) {
  runCostBasisFxSuite().then((suite) => {
    for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
    const failed = suite.cases.filter((c) => c.status !== "pass");
    console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} passed`);
    writeReport([suite]);
    if (failed.length > 0) process.exitCode = 1;
  });
}
