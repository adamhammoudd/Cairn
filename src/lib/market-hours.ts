// Real US equity market session state.
//
// The dashboard eyebrow rendered the literal string "markets open" on every
// render, so it said markets open at 3am on a Sunday. That is the app's
// "confident and wrong" failure mode in one line: a user has no way to tell a
// hardcoded claim from a computed one, so a wrong claim costs the credibility
// of the right ones next to it.
//
// Regular session is 09:30-16:00 America/New_York, Monday to Friday. DST is
// handled by resolving the wall clock in that zone rather than by offsetting
// UTC, so this does not need a twice-yearly correction.
//
// Holidays are the NYSE/Nasdaq full-day closures. They need extending each
// year, or the app silently reports "open" on a holiday past the last
// modelled year.

export type MarketPhase = "open" | "pre" | "after" | "closed" | "holiday" | "weekend";

export interface MarketStatus {
  phase: MarketPhase;
  /** Short label for the UI. */
  label: string;
  isOpen: boolean;
}

// NYSE full-day closures. Half-days (early close 13:00) are deliberately not
// modelled - treating a half day as a normal session is a 3-hour error at the
// end of the day, while treating it as closed would be a 3.5-hour error at the
// start, and the label is not load-bearing enough to justify the table.
const HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
];
const HOLIDAYS_2027 = [
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
];

const HOLIDAYS = new Set([...HOLIDAYS_2026, ...HOLIDAYS_2027]);

// The last calendar year HOLIDAYS covers. Past this, a full-day closure cannot
// be detected - so instead of silently reporting a holiday as a normal session
// (the "confident and wrong" failure this whole file exists to avoid), the
// status is hedged and a warning is logged once per year so the omission is
// visible in the deployment logs rather than only on screen.
export const LAST_MODELLED_HOLIDAY_YEAR = 2027;

const warnedYears = new Set<number>();
function warnStaleHolidayTable(year: number): void {
  if (warnedYears.has(year)) return;
  warnedYears.add(year);
  console.warn(
    `[market-hours] NYSE holiday table ends at ${LAST_MODELLED_HOLIDAY_YEAR}; asked about ${year}. ` +
      `Full-day closures for ${year} are not modelled - extend HOLIDAYS_* in src/lib/market-hours.ts.`,
  );
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Reads the wall clock in New York directly. Intl does the DST arithmetic, so
// there is no offset table here to drift.
function nyParts(at: Date): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // "24" appears at midnight under hour12:false in some runtimes.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_INDEX[parts.weekday as string] ?? 0,
  };
}

export function getMarketStatus(at: Date = new Date()): MarketStatus {
  const p = nyParts(at);
  const iso = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const minutes = p.hour * 60 + p.minute;

  if (p.weekday === 0 || p.weekday === 6) {
    return { phase: "weekend", label: "Markets closed · weekend", isOpen: false };
  }
  if (HOLIDAYS.has(iso)) {
    return { phase: "holiday", label: "Markets closed · holiday", isOpen: false };
  }
  if (p.year > LAST_MODELLED_HOLIDAY_YEAR) {
    // Weekday, past the holiday table: it might be a full-day closure and we
    // cannot tell, so never assert a bare "open".
    warnStaleHolidayTable(p.year);
    return { phase: "closed", label: "Market status unavailable · holiday calendar out of date", isOpen: false };
  }

  const OPEN = 9 * 60 + 30;
  const CLOSE = 16 * 60;
  const PRE_OPEN = 4 * 60;
  const AFTER_CLOSE = 20 * 60;

  if (minutes >= OPEN && minutes < CLOSE) {
    return { phase: "open", label: "Markets open", isOpen: true };
  }
  if (minutes >= PRE_OPEN && minutes < OPEN) {
    return { phase: "pre", label: "Pre-market", isOpen: false };
  }
  if (minutes >= CLOSE && minutes < AFTER_CLOSE) {
    return { phase: "after", label: "After hours", isOpen: false };
  }
  return { phase: "closed", label: "Markets closed", isOpen: false };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function isTradingDay(year: number, month: number, day: number, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return false;
  // Past the holiday table a closure cannot be told from a session; weekdays count as sessions.
  return !HOLIDAYS.has(`${year}-${pad2(month)}-${pad2(day)}`);
}

// Hour (New York) after which today's daily bar is expected to be stored. The
// daily ingest runs at 22:00 UTC (18:00 or 17:00 New York); an hour of grace.
const CLOSE_BAR_EXPECTED_AFTER_MINUTES = 19 * 60;

/**
 * Date (YYYY-MM-DD) of the newest daily bar that should exist at `at` for a
 * US-listed symbol. Every "close of ..." label and every staleness decision is
 * judged against this, so a price is only called current when it is the latest
 * close that could exist. During a session it is the PREVIOUS trading day -
 * today's close has not happened yet.
 */
export function expectedLatestCloseDate(at: Date = new Date()): string {
  const p = nyParts(at);
  // Walk the New York calendar in UTC arithmetic; only the date matters.
  let cursor = Date.UTC(p.year, p.month - 1, p.day);
  let weekday = p.weekday;
  const todayCounts = p.hour * 60 + p.minute >= CLOSE_BAR_EXPECTED_AFTER_MINUTES;
  let first = true;
  for (let i = 0; i < 14; i++) {
    const d = new Date(cursor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if ((!first || todayCounts) && isTradingDay(y, m, day, weekday)) return `${y}-${pad2(m)}-${pad2(day)}`;
    first = false;
    cursor -= 86_400_000;
    weekday = (weekday + 6) % 7;
  }
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
