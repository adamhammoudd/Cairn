// Tests for xAxisConfig (src/lib/portfolio.ts) - the per-timeframe X-axis tick
// spacing and label formatting shared by the Portfolio, Ticker and Compare
// charts (Phase 3: "X-axis scales to the selected timeline filter, hourly for
// 1D through quarterly/yearly markers for ALL, with zero overlap bugs").
//
// Run: npx tsx --conditions=react-server scripts/tests/x-axis-config.ts

import { xAxisConfig } from "../../src/lib/portfolio";
import { formatTooltipLabel } from "../../src/lib/chart-dates";
import type { ChartView } from "../../src/lib/supabase/types";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// Build `n` points spaced `stepMs` apart ending now. 1D/1W carry a time
// component (ISO with hours); the daily ranges are date-only (matches how
// buildPriceSeries / the intraday path produce them).
function series(n: number, stepMs: number, withTime: boolean) {
  const end = Date.UTC(2026, 7, 30, 15, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(end - (n - 1 - i) * stepMs);
    return { date: withTime ? d.toISOString() : d.toISOString().slice(0, 10), value: 100 + i };
  });
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const scenarios: { tf: ChartView; pts: ReturnType<typeof series>; wantLabelPattern: RegExp }[] = [
  { tf: "1D", pts: series(78, 5 * 60_000, true), wantLabelPattern: /\d/ },            // 5-min bars, one session
  { tf: "1W", pts: series(7 * 26, 15 * 60_000, true), wantLabelPattern: /[A-Za-z]/ }, // 15-min bars, a week
  { tf: "1M", pts: series(22, DAY, false), wantLabelPattern: /[A-Za-z]{3}\s?\d/ },     // ~22 trading days
  { tf: "3M", pts: series(64, DAY, false), wantLabelPattern: /[A-Za-z]{3}\s?\d/ },
  { tf: "1Y", pts: series(252, DAY, false), wantLabelPattern: /^[A-Za-z]{3}$/ },       // month only
  { tf: "ALL", pts: series(760, DAY, false), wantLabelPattern: /[A-Za-z]{3}.*\d{2}/ }, // month + 2-digit year
];

for (const { tf, pts, wantLabelPattern } of scenarios) {
  const { interval, tickFormatter } = xAxisConfig(pts, tf);

  // Ticks actually shown = every (interval + 1)th point.
  const shown = pts.filter((_, i) => i % (interval + 1) === 0);
  check(`${tf}: keeps tick count sane (<= 8)`, shown.length <= 8, `${shown.length} ticks from ${pts.length} points`);
  check(`${tf}: shows at least 3 ticks`, shown.length >= 3, `${shown.length} ticks`);

  const labels = shown.map((p) => tickFormatter(p.date));
  check(`${tf}: every label non-empty`, labels.every((l) => l && l.trim().length > 0), JSON.stringify(labels.slice(0, 3)));
  check(`${tf}: label shape matches the timeframe granularity`, labels.every((l) => wantLabelPattern.test(l)), `e.g. "${labels[0]}" vs ${wantLabelPattern}`);

  // "Zero overlap" proxy: consecutive shown ticks must not render the same
  // label (that is what an un-scaled axis does - the same "Aug" 30 times).
  const adjacentDupes = labels.filter((l, i) => i > 0 && l === labels[i - 1]).length;
  check(`${tf}: adjacent ticks are distinct (no repeated-label overlap)`, adjacentDupes === 0, `${adjacentDupes} adjacent dupes in ${JSON.stringify(labels)}`);
}

// Degenerate inputs must not throw.
try {
  xAxisConfig([], "1M");
  xAxisConfig(series(1, DAY, false), "ALL");
  check("empty / single-point series does not throw", true);
} catch (e) {
  check("empty / single-point series does not throw", false, String(e));
}

// Daily-bar labels must not shift by a day depending on the viewer's time
// zone. `historical_prices.ts` is "YYYY-MM-DD"; new Date("2026-08-28") is UTC
// midnight, so a naive toLocaleDateString() rendered "Aug 27" west of UTC.
// formatChartLabel / formatTooltipLabel pin date-only values to UTC.
{
  const tick = xAxisConfig(series(22, DAY, false), "1M").tickFormatter("2026-08-28");
  check("a daily bar's axis label keeps its own calendar date (Aug 28)", /Aug\s*28/.test(tick), `"${tick}"`);
  check("the tooltip label keeps its own calendar date (Aug 28)", /Aug\s*28/.test(formatTooltipLabel("2026-08-28")), `"${formatTooltipLabel("2026-08-28")}"`);
  check(
    "an intraday timestamp still formats with a time component",
    /\d/.test(formatTooltipLabel("2026-08-28T14:30:00.000Z")) && formatTooltipLabel("2026-08-28T14:30:00.000Z").length > 12,
    `"${formatTooltipLabel("2026-08-28T14:30:00.000Z")}"`,
  );
}

console.log(`\n${pass}/${pass + fail} x-axis cases passed`);
process.exit(fail === 0 ? 0 : 1);
