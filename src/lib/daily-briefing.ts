// The daily briefing at the top of Base Camp: "what changed for what you own".
//
// Pure and deterministic. Every card comes from one of four rules over stored
// data, never from a model, and a day with nothing to report says so instead
// of manufacturing news:
//
//   Coming up     earnings within 7 days (with past results-day moves)
//   Good news /   a dividend raised / cut in a filing from the last 21 days
//     Changed       (with coverage from the scorecard)
//   Unusual move  this week's move is more than 2x the symbol's typical
//                 weekly move, with how past moves this size turned out
//   Changed       a scorecard level differs from the card a week ago
//
// Money stays in USD here; the page formats it in the reader's currency.

import type { DimensionKey, Level, Scorecard } from "@/lib/scorecard";
import { plainDate } from "@/lib/scorecard";
import type { EarningsReaction, PricePoint } from "@/lib/fundamentals";
import { median } from "@/lib/fundamentals";
import { qualityPhrase } from "@/lib/ai/plain-summary";

export interface WeekAgoLevels {
  asOf: string;
  levels: Record<string, { level: string; verdict: string }>;
}

export interface BriefingEvent {
  type: "earnings" | "ex_dividend" | "dividend_payment";
  date: string;
  /** Dividend per share when the calendar gives it. */
  perShare?: number | null;
}

export interface BriefingHolding {
  symbol: string;
  name: string;
  assetType: string | null;
  quantity: number;
  /** Current value in USD; null when unpriced. */
  value: number | null;
  pricesAsc: PricePoint[];
  scorecard: Scorecard;
  scorecardWeekAgo: WeekAgoLevels | null;
  reactions: EarningsReaction[];
  /** Latest and previous quarterly dividend per share, from SEC filings. */
  dividends: { latest: { perShare: number; periodEnd: string; filed: string }; previous: { perShare: number } } | null;
  events: BriefingEvent[];
}

export type CardTag = "Coming up" | "Good news" | "Unusual move" | "Changed";

export interface ChangeCard {
  symbol: string;
  name: string;
  tag: CardTag;
  title: string;
  body: string[];
  href: string;
}

export interface GlanceRow {
  symbol: string;
  name: string;
  quantity: number;
  valueUsd: number | null;
  weekChangePct: number | null;
  bars: { key: DimensionKey; label: string; level: Level }[];
  line: string;
  href: string;
}

export interface ComingUpRow {
  date: string;
  symbol: string;
  title: string;
  detail: string | null;
  /** Approximate amount to the reader in USD (dividends), only with exposure figures on. */
  amountUsd: number | null;
}

export interface MixSummary {
  sentence: string;
  detail: string;
  segments: { symbol: string; name: string; share: number }[];
}

export interface Briefing {
  headline: string;
  valueUsd: number | null;
  weekChangePct: number | null;
  biggestEvent: string | null;
  cards: ChangeCard[];
  /** Changes found beyond the three shown. */
  moreCount: number;
  quietNote: string | null;
  holdings: GlanceRow[];
  comingUp: ComingUpRow[];
  mix: MixSummary | null;
}

export const BRIEFING_RULES = {
  /** Earnings this many days ahead or fewer make a "Coming up" card. */
  earningsCardDays: 7,
  /** "Coming up" lists the next 30 days. */
  comingUpDays: 30,
  /** A dividend filing newer than this is news. */
  dividendNewsDays: 21,
  /** A dividend change smaller than 1% is rounding, not news. */
  minDividendChange: 0.01,
  /** Unusual: this week's move above 2x the median weekly move of the past year... */
  unusualMultiple: 2,
  /** ...and at least 2% - on a very steady holding, twice nothing is still nothing. */
  minUnusualMove: 0.02,
  /** Past moves compared for "how did moves this size turn out": at most this many. */
  maxPastMoves: 20,
  /** Fewer than this and the history is not quoted. */
  minPastMoves: 3,
  maxCards: 3,
} as const;

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const pct0 = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const pct1 = (v: number) => `${(Math.round(Math.abs(v) * 1000) / 10).toFixed(1)}%`;

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export function numberWord(n: number): string {
  return n >= 1 && n <= 10 ? WORDS[n] : String(n);
}

/** A week is 5 sessions for a listed security, 7 days for a coin; a month 21 or 30. */
function periods(assetType: string | null) {
  return assetType === "crypto" ? { week: 7, month: 30 } : { week: 5, month: 21 };
}

// ------------------------------------------------------------ unusual moves

export interface UnusualMove {
  move: number;
  typical: number;
  ratio: number;
  unusual: boolean;
}

/** This week's move against the median absolute weekly move of the past year. */
export function unusualMove(pricesAsc: PricePoint[], assetType: string | null): UnusualMove | null {
  const { week } = periods(assetType);
  const n = pricesAsc.length;
  if (n < week * 21 + 1) return null;
  const last = pricesAsc[n - 1].close;
  const base = pricesAsc[n - 1 - week].close;
  if (!(base > 0)) return null;
  const move = last / base - 1;
  const weekly: number[] = [];
  for (let k = 1; k <= 52; k++) {
    const end = n - 1 - week * k;
    const start = end - week;
    if (start < 0) break;
    const a = pricesAsc[start].close;
    if (a > 0) weekly.push(Math.abs(pricesAsc[end].close / a - 1));
  }
  if (weekly.length < 20) return null;
  const typical = median(weekly)!;
  if (!(typical > 0)) return null;
  const ratio = Math.abs(move) / typical;
  return { move, typical, ratio, unusual: ratio > BRIEFING_RULES.unusualMultiple && Math.abs(move) >= BRIEFING_RULES.minUnusualMove };
}

/**
 * Past weeks with a move at least this size in the same direction, and how
 * they turned out a month later: a drop "recovered" when the price got back
 * to where it was before the drop within the month; a rise "held" when the
 * price was still above where it started a month later. Non-overlapping, most
 * recent first, and never counting the current week.
 */
export function moveHistory(pricesAsc: PricePoint[], assetType: string | null, move: number): { count: number; recovered: number } {
  const { week, month } = periods(assetType);
  const hits: boolean[] = [];
  const c = pricesAsc.map((p) => p.close);
  for (let t = week; t + month <= c.length - 1 - week; t++) {
    const before = c[t - week];
    if (!(before > 0)) continue;
    const r = c[t] / before - 1;
    if (move < 0 ? r > move : r < move) continue;
    let ok: boolean;
    if (move < 0) {
      ok = false;
      for (let j = t + 1; j <= t + month; j++) if (c[j] >= before) ok = true;
    } else {
      ok = c[t + month] > before;
    }
    hits.push(ok);
    t += month;
  }
  const recent = hits.slice(-BRIEFING_RULES.maxPastMoves);
  return { count: recent.length, recovered: recent.filter(Boolean).length };
}

// ---------------------------------------------------------- scorecard change

const RATED: DimensionKey[] = ["valuation", "growth", "health", "dividend", "trend"];
const RANK: Record<string, number> = { strong: 3, mixed: 2, weak: 1 };

export interface LevelChange {
  key: DimensionKey;
  label: string;
  from: string;
  to: string;
  sentence: string;
}

export function snapshotLevels(card: Scorecard): Record<string, { level: string; verdict: string }> {
  return Object.fromEntries(card.dimensions.map((d) => [d.key, { level: d.level, verdict: d.verdict }]));
}

/** Levels that moved since the card a week ago. Null when there is no card to compare with. */
export function scorecardChanges(card: Scorecard, weekAgo: WeekAgoLevels | null): { weakened: LevelChange[]; improved: LevelChange[] } | null {
  if (!weekAgo) return null;
  const weakened: LevelChange[] = [];
  const improved: LevelChange[] = [];
  for (const d of card.dimensions) {
    if (!RATED.includes(d.key)) continue;
    const old = weekAgo.levels[d.key];
    if (!old || !(old.level in RANK) || !(d.level in RANK) || old.level === d.level) continue;
    const change = { key: d.key, label: d.label, from: old.verdict, to: d.verdict, sentence: d.sentence };
    (RANK[d.level] < RANK[old.level] ? weakened : improved).push(change);
  }
  return { weakened, improved };
}

// -------------------------------------------------------------- plain lines

const TREND_WORDS: Record<string, string> = { Rising: "rising", Sideways: "going sideways", Falling: "falling" };

export function holdingLine(card: Scorecard, assetType: string | null): string {
  const dim = (k: DimensionKey) => card.dimensions.find((d) => d.key === k);
  const trend = TREND_WORDS[dim("trend")?.verdict ?? ""] ?? "not measurable yet";
  const companyApplies = RATED.slice(0, 4).some((k) => dim(k) && dim(k)!.level !== "not_applicable");
  if (!companyApplies) {
    if (assetType === "crypto") return `No company behind it, so only the price trend applies, and it is ${trend}.`;
    if (assetType === "etf") return `A fund of many companies. Its price trend is ${trend}.`;
    return `Company figures aren't available. Its price trend is ${trend}.`;
  }
  const quality = qualityPhrase(dim("growth")?.verdict, dim("health")?.verdict);
  const v = dim("valuation")?.verdict;
  const price =
    v === "Expensive"
      ? "The share is priced high for its profit."
      : v === "Cheap"
        ? "The share is priced low for its profit."
        : v === "Fair"
          ? "The share is fairly priced for its profit."
          : `Its price trend is ${trend}.`;
  return `${quality}. ${price}`;
}

function reactionSentence(reactions: EarningsReaction[]): string | null {
  const recent = reactions.slice(0, 12);
  if (recent.length < 4) return null;
  const big = recent.filter((r) => Math.abs(r.move) >= 0.05).length;
  return `On its last ${recent.length} results days the share moved 5% or more ${big} times.`;
}

export function mixSummary(holdings: { symbol: string; name: string; value: number | null }[]): MixSummary | null {
  const priced = holdings.filter((h): h is { symbol: string; name: string; value: number } => h.value !== null && h.value > 0);
  const total = priced.reduce((s, h) => s + h.value, 0);
  if (priced.length === 0 || total <= 0) return null;
  const sorted = priced.slice().sort((a, b) => b.value - a.value);
  const segments = sorted.map((h) => ({ symbol: h.symbol, name: h.name, share: h.value / total }));
  const [a, b] = segments;
  const p = (v: number) => Math.round(v * 100);
  if (segments.length === 1) return { sentence: `All your money is in ${a.name}.`, detail: `${a.name} is your only priced holding.`, segments };
  if (a.share >= 0.4) {
    return { sentence: `${a.name} is ${p(a.share)}% of your portfolio.`, detail: `The other ${segments.length - 1} holdings make up ${100 - p(a.share)}%.`, segments };
  }
  if (a.share + b.share >= 0.5) {
    const word = a.share + b.share < 0.55 ? "Half" : "More than half";
    return { sentence: `${word} your money is in two holdings.`, detail: `${a.name} and ${b.name} make up ${p(a.share + b.share)}% of your portfolio.`, segments };
  }
  return { sentence: `Your money is spread across ${segments.length} holdings.`, detail: `The largest, ${a.name}, is ${p(a.share)}%.`, segments };
}

// ------------------------------------------------------------------- build

interface Candidate {
  card: ChangeCard;
  priority: number;
  order: number;
  value: number;
}

export function buildBriefing(input: { today: string; holdings: BriefingHolding[]; exposureEnabled: boolean }): Briefing {
  const R = BRIEFING_RULES;
  const { today, holdings } = input;
  if (holdings.length === 0) {
    return {
      headline: "Add what you own to get a briefing about it.",
      valueUsd: null,
      weekChangePct: null,
      biggestEvent: null,
      cards: [],
      moreCount: 0,
      quietNote: null,
      holdings: [],
      comingUp: [],
      mix: null,
    };
  }

  const candidates: Candidate[] = [];
  for (const h of holdings) {
    const href = `/ticker/${encodeURIComponent(h.symbol)}`;
    const base = { symbol: h.symbol, name: h.name, href };
    const value = h.value ?? 0;

    const um = unusualMove(h.pricesAsc, h.assetType);
    if (um?.unusual) {
      const hist = moveHistory(h.pricesAsc, h.assetType, um.move);
      const times = um.ratio < 2.5 ? "about twice" : `about ${Math.round(um.ratio)} times`;
      const body = [`That is ${times} its usual weekly swing of ${pct1(um.typical)}.`];
      if (hist.count >= R.minPastMoves) {
        body.push(
          um.move < 0
            ? `Of its last ${hist.count} drops this size, ${hist.recovered} were back to their earlier price within a month.`
            : `Of its last ${hist.count} rises this size, ${hist.recovered} were still above their starting price a month later.`,
        );
      } else {
        body.push("It has rarely moved this much before, so there is little history to compare.");
      }
      candidates.push({ card: { ...base, tag: "Unusual move", title: `${um.move < 0 ? "Down" : "Up"} ${pct0(um.move)} this week`, body }, priority: 0, order: -um.ratio, value });
    }

    const ch = scorecardChanges(h.scorecard, h.scorecardWeekAgo);
    if (ch && (ch.weakened.length || ch.improved.length)) {
      const all = [...ch.weakened, ...ch.improved];
      const first = all[0];
      const body = [first.sentence];
      if (all.length > 1) body.push(`Also: ${all.slice(1).map((c) => `${c.label.toLowerCase()} went from ${c.from} to ${c.to}`).join("; ")}.`);
      candidates.push({ card: { ...base, tag: "Changed", title: `${first.label}: ${first.from} to ${first.to}`, body }, priority: ch.weakened.length ? 1 : 4, order: 0, value });
    }

    const earnings = h.events.filter((e) => e.type === "earnings" && e.date >= today && days(today, e.date) <= R.earningsCardDays).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (earnings) {
      const d = days(today, earnings.date);
      const when = d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
      const past = reactionSentence(h.reactions);
      candidates.push({
        card: { ...base, tag: "Coming up", title: `Reports earnings ${when}`, body: [`Results are due ${plainDate(earnings.date)}.`, ...(past ? [past] : [])] },
        priority: 2,
        order: d,
        value,
      });
    }

    const dv = h.dividends;
    if (dv && dv.previous.perShare > 0 && days(dv.latest.filed, today) <= R.dividendNewsDays && days(dv.latest.filed, today) >= 0) {
      const change = dv.latest.perShare / dv.previous.perShare - 1;
      if (Math.abs(change) >= R.minDividendChange) {
        const divDim = h.scorecard.dimensions.find((d) => d.key === "dividend");
        const coverage = divDim?.sentence.split(/(?<=\.)\s+/).find((s) => /payments use|no free cash flow/.test(s));
        const raised = change > 0;
        candidates.push({
          card: {
            ...base,
            tag: raised ? "Good news" : "Changed",
            title: `${raised ? "Raised" : "Cut"} its dividend by ${pct0(change)}`,
            body: [`From ${dv.previous.perShare.toFixed(2)} to ${dv.latest.perShare.toFixed(2)} dollars a share each quarter.`, ...(coverage ? [coverage] : [])],
          },
          priority: raised ? 3 : 1,
          order: 0,
          value,
        });
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority || a.order - b.order || b.value - a.value);
  const cards = candidates.slice(0, R.maxCards).map((c) => c.card);
  const n = candidates.length;
  const headline =
    n === 0 ? "Nothing changed for what you own. Nothing needs you today." : `${numberWord(n)} thing${n === 1 ? "" : "s"} changed for what you own. Nothing needs you today.`;

  // Portfolio value and this week's change, from each holding's own closes.
  let now = 0;
  let before = 0;
  let priced = 0;
  const rows: GlanceRow[] = [];
  for (const h of holdings) {
    const { week } = periods(h.assetType);
    const p = h.pricesAsc;
    const base = p.length > week ? p[p.length - 1 - week].close : null;
    const last = p.length ? p[p.length - 1].close : null;
    const weekChangePct = base && last ? (last / base - 1) * 100 : null;
    if (h.value !== null && base && last) {
      now += h.value;
      before += h.value * (base / last);
      priced++;
    }
    const dims = h.scorecard.dimensions;
    rows.push({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      valueUsd: h.value,
      weekChangePct,
      bars: (["valuation", "growth", "health", "trend"] as DimensionKey[]).map((k) => {
        const d = dims.find((x) => x.key === k)!;
        return { key: k, label: d.label, level: d.level };
      }),
      line: holdingLine(h.scorecard, h.assetType),
      href: `/ticker/${encodeURIComponent(h.symbol)}`,
    });
  }
  rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const comingUp: ComingUpRow[] = holdings
    .flatMap((h) =>
      h.events
        .filter((e) => e.date >= today && days(today, e.date) <= R.comingUpDays)
        .map((e) => ({
          date: e.date,
          symbol: h.symbol,
          title: e.type === "earnings" ? `${h.name} earnings` : e.type === "ex_dividend" ? `${h.name} dividend cut-off date` : `${h.name} dividend paid`,
          detail:
            e.type === "earnings"
              ? reactionSentence(h.reactions)
              : e.type === "ex_dividend"
                ? "Only shares owned before this day get the next dividend."
                : null,
          amountUsd: input.exposureEnabled && e.type !== "earnings" && e.perShare ? e.perShare * h.quantity : null,
          value: h.value ?? 0,
        })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.value - a.value))
    .map((r) => ({ date: r.date, symbol: r.symbol, title: r.title, detail: r.detail, amountUsd: r.amountUsd }));

  const bigHolder = holdings
    .filter((h) => h.events.some((e) => e.type === "earnings" && e.date >= today && days(today, e.date) <= R.comingUpDays))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  const bigDate = bigHolder?.events.filter((e) => e.type === "earnings" && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return {
    headline,
    valueUsd: priced ? now : null,
    weekChangePct: priced && before > 0 ? (now / before - 1) * 100 : null,
    biggestEvent: bigHolder && bigDate ? `The biggest date ahead is ${bigHolder.name}'s earnings on ${plainDate(bigDate.date)}.` : null,
    cards,
    moreCount: Math.max(0, n - cards.length),
    quietNote: n === 0 ? "No earnings in the next week, no dividend changes, no unusual price moves and no scorecard changes for your holdings." : null,
    holdings: rows,
    comingUp,
    mix: input.exposureEnabled ? mixSummary(holdings.map((h) => ({ symbol: h.symbol, name: h.name, value: h.value }))) : null,
  };
}
