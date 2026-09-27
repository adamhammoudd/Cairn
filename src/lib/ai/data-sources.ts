// The data an analysis is computed from, as citable sources.
//
// "Every analysis shows its sources" was implemented as "every analysis cites
// a news article", so a share with years of prices and filings but no tagged
// news (Micron, 2026-09-27) could not be analysed. The history, the scorecard
// and the dates are computed from stored prices, SEC filings and the calendar;
// those ARE its sources. Each one here is built only from a row that was
// actually read - an accession number from stored filing provenance, a price
// range from stored bars, a calendar row by id - so a cited source always
// exists. Stored in ai_analysis_data_sources (migration 0057).
//
// buildDataSources is pure; loadDataSources does the reads.

export type DataSourceKind = "sec_filing" | "price_data" | "calendar" | "fund_profile" | "coin_profile";

export interface DataSource {
  kind: DataSourceKind;
  /** Plain words: "Quarterly report (10-Q) filed 30 Jul 2026". */
  label: string;
  /** What identifies it: an accession number, a symbol, a calendar row id. */
  reference: string;
  /** The date the source speaks for (filing date, last price, event date). */
  asOf: string | null;
  url: string | null;
}

export interface DataSourceInputs {
  symbol: string;
  assetType: string | null;
  /** The directory name ("Schwab U.S. Dividend Equity ETF"). */
  name: string | null;
  prices: { count: number; first: string; last: string } | null;
  /** The newest periodic filing behind the company figures. */
  filing: { cik: string; accn: string; form: string; filed: string } | null;
  /** The newest results release (8-K item 2.02). */
  release: { cik: string; accn: string; releaseDate: string } | null;
  calendar: { id: string; event_type: string; event_date: string }[];
  coin: { updatedAt: string; name: string | null } | null;
}

/** EDGAR folder for one filing: /Archives/edgar/data/<cik>/<accession without dashes>/. */
export function edgarUrl(cik: string, accn: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, "")}/`;
}

const FORM_WORDS: Record<string, string> = {
  "10-Q": "Quarterly report",
  "10-Q/A": "Amended quarterly report",
  "10-K": "Annual report",
  "10-K/A": "Amended annual report",
};

const day = (iso: string) => iso.slice(0, 10);

export function buildDataSources(i: DataSourceInputs): DataSource[] {
  const out: DataSource[] = [];
  if (i.prices && i.prices.count > 0) {
    const unit = i.assetType === "crypto" ? "daily" : "daily closing";
    out.push({
      kind: "price_data",
      label: `${i.prices.count} ${unit} prices for ${i.symbol}, ${day(i.prices.first)} to ${day(i.prices.last)} (Yahoo Finance chart data)`,
      reference: i.symbol,
      asOf: day(i.prices.last),
      url: null,
    });
  }
  if (i.filing) {
    out.push({
      kind: "sec_filing",
      label: `${FORM_WORDS[i.filing.form] ?? i.filing.form} (${i.filing.form}) filed ${day(i.filing.filed)}, SEC EDGAR`,
      reference: i.filing.accn,
      asOf: day(i.filing.filed),
      url: edgarUrl(i.filing.cik, i.filing.accn),
    });
  }
  if (i.release) {
    out.push({
      kind: "sec_filing",
      label: `Results release (8-K item 2.02) filed ${day(i.release.releaseDate)}, SEC EDGAR`,
      reference: i.release.accn,
      asOf: day(i.release.releaseDate),
      url: edgarUrl(i.release.cik, i.release.accn),
    });
  }
  for (const c of i.calendar) {
    const what = c.event_type === "earnings" ? "Results date" : c.event_type === "ex_dividend" ? "Dividend cut-off date" : "Dividend payment date";
    out.push({ kind: "calendar", label: `${what} ${day(c.event_date)}, Cairn's calendar`, reference: c.id, asOf: day(c.event_date), url: null });
  }
  if (i.assetType === "etf" && i.name) {
    out.push({ kind: "fund_profile", label: `Fund as listed: ${i.name}`, reference: i.symbol, asOf: null, url: null });
  }
  if (i.assetType === "crypto" && i.coin) {
    out.push({ kind: "coin_profile", label: `Market data for ${i.coin.name ?? i.symbol} (CoinGecko)`, reference: i.symbol, asOf: day(i.coin.updatedAt), url: null });
  }
  return out;
}

/** The plain line shown whenever an analysis cites no news. Computed in code, never written by a model. */
export function noNewsLine(name: string, dataSources: { kind: string }[]): string {
  const filings = dataSources.some((d) => d.kind === "sec_filing");
  return `No recent news mentioning ${name} was found. This analysis cites its ${filings ? "SEC filings and " : ""}price data instead.`;
}
