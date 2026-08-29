// Derived volatility-regime analogs, shared by ingest-crypto and
// ingest-historical-events.
//
// Why this is shared: the analysis engine needs historical analogs to compute a
// probability at all, and for equities the only analog sources were Nasdaq
// earnings and Yahoo dividends. Both return nothing for most long-tail names
// (and both are wrapped in a .catch that swallows the failure), so every
// symbol outside the original mega-cap seed set had zero events and analysis
// generation failed outright with "No news or historical event data".
//
// Crypto never had that problem because ingest-crypto derives regimes from the
// price history it already stores. That derivation is asset-agnostic - the
// threshold is relative to the asset's own median - so it is lifted here
// verbatim rather than reimplemented, and both callers now use it.
//
// See docs/decisions/2026-08-20-volatility-regime-as-analog.md.

export interface DerivedRegime {
  event_date: string;
  description: string;
  price_before: number;
  price_after: number;
}

/** Trading days per year. Crypto trades every day; equities and ETFs do not. */
export const CRYPTO_PERIODS_PER_YEAR = 365;
export const EQUITY_PERIODS_PER_YEAR = 252;

export function rollingVolatility(
  closes: number[],
  window: number,
  periodsPerYear: number,
): (number | null)[] {
  const returns = closes.map((c, i) => (i === 0 || closes[i - 1] === 0 ? 0 : Math.log(c / closes[i - 1])));
  return closes.map((_, i) => {
    if (i < window) return null;
    const slice = returns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    return Math.sqrt(variance) * Math.sqrt(periodsPerYear);
  });
}

/**
 * Flag windows where 30-day realized vol ran materially above the asset's own
 * median. Threshold is relative to the asset itself, not an absolute number -
 * an absolute equity-style threshold would mark essentially all of crypto as
 * "elevated" and carry no information.
 */
export function deriveVolatilityRegimes(
  dates: string[],
  closes: number[],
  periodsPerYear: number = CRYPTO_PERIODS_PER_YEAR,
): DerivedRegime[] {
  const window = 30;
  const vols = rollingVolatility(closes, window, periodsPerYear);
  const observed = vols.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (observed.length < window) return [];

  const median = observed[Math.floor(observed.length / 2)];

  // Relative-only thresholds break on stablecoins: 1.5x a near-zero median is
  // still near-zero, which manufactured "elevated volatility" analogs for USDT
  // whose price went $1.00 -> $1.00. Feeding those to the analysis engine
  // would yield confident-sounding output about no movement at all. Require
  // the regime to also clear an absolute floor to count as one.
  const MIN_ANNUALIZED_VOL = 0.15;
  const threshold = Math.max(median * 1.5, MIN_ANNUALIZED_VOL);

  const regimes: DerivedRegime[] = [];
  let inRegime = false;
  let startIdx = 0;

  for (let i = 0; i < vols.length; i++) {
    const v = vols[i];
    if (v === null) continue;

    if (!inRegime && v > threshold) {
      inRegime = true;
      startIdx = i;
    } else if (inRegime && v <= threshold) {
      inRegime = false;
      // Only keep regimes that persisted - a single day over the line is noise.
      if (i - startIdx >= 5) {
        regimes.push({
          event_date: dates[startIdx],
          description:
            `Elevated volatility regime: 30-day realized volatility exceeded ` +
            `${(threshold * 100).toFixed(0)}% annualized (1.5x this asset's own median) ` +
            `for ${i - startIdx} days.`,
          price_before: closes[startIdx],
          price_after: closes[i],
        });
      }
    }
  }

  // Keep the most recent handful - older regimes add little for pattern matching.
  return regimes.slice(-8);
}
