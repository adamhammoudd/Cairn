import type { DisplayPrefs } from "@/lib/display-prefs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "25 Sep 2026" from an ECB publication date. Built by hand, not with
 * toLocaleDateString: this runs on the server and in the browser (Settings),
 * and ICU builds disagree ("Sep" / "Sept"), which is a hydration mismatch.
 */
export function formatRateDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d || m > 12) return isoDate;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * One line, on every app page, that dates a converted figure - or says the
 * conversion did not happen. Nothing for a USD account: nothing is converted.
 */
export function currencyNoteText(prefs: DisplayPrefs): string | null {
  if (prefs.currency === "USD") return null;
  if (prefs.fxUnavailable) {
    return `Figures in USD - the ${prefs.currency} reference rate could not be fetched, so nothing is converted.`;
  }
  if (!prefs.fxAsOf) return null;
  return `Figures in ${prefs.effectiveCurrency}, converted from USD at the European Central Bank reference rate of ${formatRateDate(prefs.fxAsOf)}.`;
}

export function CurrencyNote({ prefs }: { prefs: DisplayPrefs }) {
  const text = currencyNoteText(prefs);
  if (!text) return null;
  return <p className="cn-currency-note mb-3 text-right text-caption text-muted text-pretty">{text}</p>;
}
