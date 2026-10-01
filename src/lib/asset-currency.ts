// The currency an asset is quoted in - the unit its price, chart, range and
// market cap are stored and shown in (feat/native-currency).
//
// Cairn shows an asset in its own currency, the way the exchange, the filings
// and the news quote it; only the reader's own money is converted to their
// display currency (lib/display-prefs.ts, formatUserMoney). So every asset
// figure needs to know its currency, and that has to come from data rather than
// a hard-coded "USD":
//
//   1. symbol_profiles.currency, the provider's own statement of it, when set.
//   2. Otherwise USD, but only where USD is known to be right:
//        - equities and ETFs with no foreign exchange suffix. Every listing in
//          symbol_directory comes from the SEC's company_tickers files or is a
//          bare Yahoo symbol, and both are US listings quoted in dollars. A
//          suffixed Yahoo symbol (SAP.DE, VOD.L, SHOP.TO) is a foreign listing
//          and is NOT assumed to be USD.
//        - coins. Every coin price Cairn stores is CoinGecko's
//          `vs_currency=usd` (supabase/functions/ingest-crypto) or a Yahoo
//          "-USD" pair, so a coin is USD-quoted by construction - including a
//          euro stablecoin like EURC, whose *price* is still stored in dollars.
//   3. Anything else (a forex pair, an index level, an unknown type): null,
//      "currency unknown". The UI says so rather than guessing a symbol.
//
// Plain module, no server imports: client components resolve a row's currency
// with this directly. The server lookup that reads the tables is
// lib/market-data/asset-currency.ts.

/**
 * Yahoo exchange suffixes for listings outside the US. A US share class is
 * also written with a dot (BRK.B, BF.B), so the check is a list of known
 * foreign venues rather than "has a dot".
 */
const FOREIGN_SUFFIX =
  /\.(L|IL|DE|F|BE|DU|HM|HA|MU|SG|XETRA|PA|AS|BR|LS|MC|MI|SW|VX|ST|OL|CO|HE|IC|IR|VI|WA|PR|BD|AT|IS|TO|V|CN|NE|AX|NZ|HK|SS|SZ|T|KS|KQ|TW|TWO|SI|KL|JK|BK|NS|BO|TA|JO|SA|MX|BA|SN|CR|LM|QA|SR|SAU|AE|KW)$/i;

/**
 * Minor-unit codes some providers report (pence, cents, agorot). A price in
 * GBp is 100x its GBP figure, so formatting it as GBP would be wrong by two
 * orders of magnitude; these resolve to unknown rather than to the major unit.
 */
const MINOR_UNITS = new Set(["GBX", "ZAC", "ILA"]);

/** An ISO 4217 major-unit code, or null. "GBp" (pence) is not "GBP". */
export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return MINOR_UNITS.has(code) ? null : code;
}

export interface AssetCurrencyInput {
  symbol: string;
  assetType: string | null | undefined;
  /** symbol_profiles.currency, when the profile row exists and carries one. */
  profileCurrency?: string | null;
}

/** The asset's quote currency, or null when it isn't known (see the file header). */
export function resolveAssetCurrency({ symbol, assetType, profileCurrency }: AssetCurrencyInput): string | null {
  const stated = normalizeCurrencyCode(profileCurrency);
  if (stated) return stated;
  if (assetType === "crypto") return "USD";
  if ((assetType === "equity" || assetType === "etf") && !FOREIGN_SUFFIX.test(symbol.trim())) return "USD";
  return null;
}
