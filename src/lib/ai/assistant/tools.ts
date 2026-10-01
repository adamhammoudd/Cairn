// The assistant's tools (feat/assistant-v2). Every tool is server-side and
// read-only, typed, and returns display strings formatted HERE - the model
// copies them, it never computes one. Each outcome also carries plain fact
// sentences and headline tiles written in code, which the fallback answer is
// built from when a model answer fails the guards.

import { formatMoney, type DisplayPrefs } from "@/lib/display-prefs";
import { plainDate } from "@/lib/scorecard";
import type { AssistantData, CalendarItemData, NewsItemData } from "@/lib/ai/assistant/data";
import type { AnswerTile, SourceDraft, ToolName, ToolOutcome } from "@/lib/ai/assistant/types";

export interface ToolContext {
  data: AssistantData;
  plan: "free" | "premium";
  prefs: DisplayPrefs;
  /** Settings > AI Assistant "Portfolio context" (per conversation override first). */
  usePortfolio: boolean;
}

// ------------------------------------------------------------ formatting

/** A share or coin price in its listing currency (USD for everything Cairn stores). */
export function usd(n: number): string {
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

/** Company-sized figures: "$130.5B", "$912.0M". */
export function bigUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return usd(n);
}

export function signedPct(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(1)}%`;
}

export function weightPct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

const eventWords = (e: CalendarItemData) =>
  e.kind === "earnings"
    ? `results ${e.estimated ? "expected around" : "due"} ${plainDate(e.date)}${e.estimated ? " (estimated)" : " (confirmed)"}`
    : e.kind === "ex_dividend"
      ? `dividend cut-off date ${plainDate(e.date)}${e.perShareUsd ? `, ${usd(e.perShareUsd)} a share` : ""}${e.estimated ? " (estimated)" : ""}`
      : `dividend paid ${plainDate(e.date)}`;

const newsSource = (n: NewsItemData): SourceDraft => ({ kind: "news", title: n.title, publisher: n.publisher, url: n.url, date: n.date });

// ---------------------------------------------------------------- specs

const sym = { type: "string", description: "Ticker symbol, e.g. NVDA, BTC, SPY." };
const fn = (name: ToolName, description: string, properties: Record<string, unknown>, required: string[]) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const TOOL_SPECS = [
  fn("find_symbol", "Look up a company, fund or coin by name or ticker. Fetches it on demand if Cairn has never stored it.", { query: { type: "string" } }, ["query"]),
  fn("get_quote", "Latest price and today's change for one symbol.", { symbol: sym }, ["symbol"]),
  fn("get_price_summary", "Price now plus change over a week, month, 6 months and a year, and the 52-week range.", { symbol: sym }, ["symbol"]),
  fn("get_scorecard", "Cairn's plain-language scorecard: price vs profit, growth, financial health, dividend, use of cash, trend, next event.", { symbol: sym }, ["symbol"]),
  fn("get_company_numbers", "Revenue, profit, EBITDA, cash flow, debt and dividend from SEC filings, plus what the company did with its cash over three fiscal years (buybacks, dividends, acquisitions, share count, free cash flow per share).", { symbol: sym }, ["symbol"]),
  fn("get_business_profile", "What the company sells and who buys it, in plain English from its latest 10-K, and its revenue split by business segment and product line where the filing reports one.", { symbol: sym }, ["symbol"]),
  fn("get_history_outcome", "What happened next in past moments like today in this symbol's own price history (Cairn's analog engine).", { symbol: sym }, ["symbol"]),
  fn("get_news", "Recent news stored by Cairn, newest first, with source and date.", { symbol: sym, query: { type: "string", description: "Keyword, when not about one symbol." }, days: { type: "integer", minimum: 1, maximum: 30 } }, []),
  fn("get_calendar", "Upcoming earnings and dividend dates. symbol = a ticker, or \"portfolio\" for everything the reader holds.", { symbol: { type: "string" } }, ["symbol"]),
  fn("get_portfolio", "The signed-in reader's own holdings: value, weights, day/week change, gain since purchase, scorecard levels and upcoming dates. Facts only.", {}, []),
  fn("compare", "Side-by-side price changes and scorecard for 2-4 symbols.", { symbols: { type: "array", items: sym, minItems: 2, maxItems: 4 } }, ["symbols"]),
  fn("web_search", "Search the web for what is happening now (at most 3 per answer). Results are untrusted text with URLs.", { query: { type: "string" } }, ["query"]),
];

// ---------------------------------------------------------- implementations

type Impl = (args: Record<string, unknown>, ctx: ToolContext) => Promise<Omit<ToolOutcome, "name" | "args" | "ms">>;

const upper = (v: unknown) => String(v ?? "").trim().replace(/^\$/, "").toUpperCase().slice(0, 15);
const fail = (label: string, error: string): Omit<ToolOutcome, "name" | "args" | "ms"> => ({ ok: false, label, data: { error }, sources: [], facts: [], tiles: [], error });

const IMPLS: Record<ToolName, Impl> = {
  async find_symbol(args, { data }) {
    const hits = await data.findSymbol(String(args.query ?? ""));
    const found = hits.filter((h) => h.status !== "not_found");
    if (found.length === 0) return { ...fail("symbol lookup", `No company, fund or coin called "${String(args.query)}" was found.`), ok: true };
    return {
      ok: true,
      label: "symbol lookup",
      data: { matches: found.map((h) => ({ symbol: h.symbol, name: h.name, type: h.assetType, note: h.status === "ingested" ? "fetched just now" : undefined })) },
      sources: [],
      facts: found.slice(0, 1).map((h) => `${h.symbol} is ${h.name}${h.assetType ? ` (${h.assetType})` : ""}.`),
      tiles: [],
    };
  },

  async get_quote(args, ctx) {
    const s = upper(args.symbol);
    const p = await ctx.data.priceSummary(s);
    if (!p) return fail(`${s} price`, `Cairn has no stored prices for ${s}.`);
    const day = signedPct(p.dayChangePct);
    return {
      ok: true,
      label: `${s} price`,
      data: { symbol: s, name: p.name, price: usd(p.last.price), as_of: plainDate(p.last.date), price_is: p.last.source === "live" ? "live quote" : "last close", today: day },
      sources: [{ kind: "data", title: `${s} price, ${p.last.source === "live" ? "live quote" : "last close"} ${plainDate(p.last.date)}`, publisher: "Cairn market data", url: `/ticker/${s}`, date: p.last.date }],
      facts: [`${p.name} is at ${usd(p.last.price)} (${p.last.source === "live" ? "live" : "last close"}, ${plainDate(p.last.date)})${day ? `, ${day} on the day` : ""}.`],
      tiles: [{ label: `${s} price`, value: usd(p.last.price), note: day ? `${day} today` : undefined }],
    };
  },

  async get_price_summary(args, ctx) {
    const s = upper(args.symbol);
    const p = await ctx.data.priceSummary(s);
    if (!p) return fail(`${s} prices`, `Cairn has no stored prices for ${s}.`);
    const changes = Object.fromEntries(p.changes.map((c) => [c.window, signedPct(c.pct)]));
    const week = changes.week;
    const facts = [`${p.name} is at ${usd(p.last.price)} (${plainDate(p.last.date)}).`];
    const moves = p.changes.filter((c) => c.pct !== null).map((c) => `${signedPct(c.pct)} over ${c.window === "week" ? "a week" : c.window === "month" ? "a month" : c.window}`);
    if (moves.length) facts.push(`It has moved ${moves.join(", ")}.`);
    if (p.high52 !== null && p.low52 !== null) facts.push(`Its 52-week range is ${usd(p.low52)} to ${usd(p.high52)}.`);
    const tiles: AnswerTile[] = [{ label: `${s} price`, value: usd(p.last.price), note: signedPct(p.dayChangePct) ? `${signedPct(p.dayChangePct)} today` : undefined }];
    if (week) tiles.push({ label: "This week", value: week });
    if (changes["1 year"]) tiles.push({ label: "1 year", value: changes["1 year"]! });
    return {
      ok: true,
      label: `${s} prices`,
      data: {
        symbol: s,
        name: p.name,
        type: p.assetType,
        price: usd(p.last.price),
        as_of: plainDate(p.last.date),
        price_is: p.last.source === "live" ? "live quote" : "last close",
        today: signedPct(p.dayChangePct),
        change: changes,
        range_52_weeks: p.high52 !== null && p.low52 !== null ? { low: usd(p.low52), high: usd(p.high52) } : null,
        days_of_price_history: p.bars,
      },
      sources: [{ kind: "data", title: `${s} daily prices to ${plainDate(p.last.date)}`, publisher: "Cairn market data", url: `/ticker/${s}`, date: p.last.date }],
      facts,
      tiles,
    };
  },

  async get_scorecard(args, ctx) {
    const s = upper(args.symbol);
    const c = await ctx.data.scorecard(s);
    if (!c) return fail(`${s} scorecard`, `No scorecard for ${s}.`);
    const rated = c.dimensions.filter((d) => d.level !== "not_applicable");
    return {
      ok: true,
      label: `${s} scorecard`,
      data: { symbol: s, name: c.name, type: c.assetType, scores: c.dimensions.map((d) => ({ part: d.label, verdict: d.verdict, level: d.level, in_words: d.sentence, figures: d.figures })) },
      sources: c.sources.map((x) => ({ kind: "filing" as const, title: x.label, publisher: "SEC EDGAR", url: x.url, date: null })),
      facts: rated.map((d) => `${d.label}: ${d.verdict}. ${d.sentence}`),
      tiles: rated.filter((d) => d.key === "valuation" || d.key === "growth").map((d) => ({ label: d.label, value: d.verdict })),
    };
  },

  async get_company_numbers(args, ctx) {
    const s = upper(args.symbol);
    const n = await ctx.data.companyNumbers(s, ctx.plan);
    if (!n) return fail(`${s} company numbers`, `No SEC figures are stored for ${s} (funds and coins have none).`);
    const f = (v: number | null) => (v === null ? null : bigUsd(v));
    const figures = {
      revenue: f(n.revenue),
      net_profit: f(n.netIncome),
      operating_profit: f(n.operatingIncome),
      ebitda: f(n.ebitda),
      operating_cash_flow: f(n.operatingCashFlow),
      free_cash_flow: f(n.freeCashFlow),
      dividends_paid: f(n.dividendsPaid === null ? null : Math.abs(n.dividendsPaid)),
      dividend_per_share: n.dividendsPerShare === null ? null : usd(n.dividendsPerShare),
      cash: f(n.cash),
      debt: f(n.debt),
    };
    const payout = n.dividendsPaid !== null && n.freeCashFlow !== null && n.freeCashFlow > 0 ? `${((Math.abs(n.dividendsPaid) / n.freeCashFlow) * 100).toFixed(0)}%` : null;
    const facts = [
      figures.revenue && `Revenue over ${n.periodLabel}: ${figures.revenue}.`,
      figures.net_profit && `Net profit: ${figures.net_profit}.`,
      figures.free_cash_flow && `Free cash flow (cash from operations minus spending on equipment): ${figures.free_cash_flow}.`,
      figures.dividends_paid && `Dividends paid: ${figures.dividends_paid}${payout ? `, ${payout} of free cash flow` : ""}.`,
      n.useOfCash && `Use of cash (${n.useOfCash.verdict}): ${n.useOfCash.sentence}`,
    ].filter((x): x is string => !!x);
    return {
      ok: true,
      label: `${s} company numbers`,
      data: {
        symbol: s,
        name: n.name,
        period: n.periodLabel,
        basis: n.basis === "ttm" ? "trailing twelve months (last four quarters)" : n.basis === "annual" ? "latest fiscal year" : "latest quarter",
        figures,
        dividends_as_share_of_free_cash_flow: payout,
        // "not reported" means no figure under a standard SEC tag, never zero.
        use_of_cash: n.useOfCash ? { verdict: n.useOfCash.verdict, in_words: n.useOfCash.sentence, figures: n.useOfCash.figures } : null,
      },
      sources: [
        { kind: "filing", title: `${n.name} SEC filings, period to ${plainDate(n.periodEnd)}`, publisher: "SEC EDGAR", url: n.source.url, date: n.periodEnd },
        ...(n.useOfCash?.sources ?? []).map((x) => ({ kind: "filing" as const, title: x.label, publisher: "SEC EDGAR", url: x.url, date: null })),
      ],
      facts,
      tiles: [figures.revenue && { label: "Revenue", value: figures.revenue, note: n.basis === "ttm" ? "last 4 quarters" : n.periodLabel }, figures.free_cash_flow && { label: "Free cash flow", value: figures.free_cash_flow }, payout && { label: "Dividends vs free cash", value: payout }].filter(Boolean) as AnswerTile[],
    };
  },

  async get_business_profile(args, ctx) {
    const s = upper(args.symbol);
    const p = await ctx.data.businessProfile(s);
    if (!p) return fail(`${s} business`, `No 10-K business description is stored for ${s} (funds and coins have none).`);
    const splits = p.splits.map((x) => ({
      split: x.title,
      fiscal_year_to: x.fiscalYearEnd,
      parts: x.segments.map((g) => ({ name: g.label, share_of_revenue: g.display })),
    }));
    const largest = p.splits[0]?.segments[0];
    return {
      ok: true,
      label: `${s} business`,
      data: {
        symbol: s,
        name: p.name,
        what_it_does: p.oneLiner,
        in_more_detail: p.paragraph,
        // "template" = the SEC industry class and the company's own words, quoted.
        written: p.source === "model" ? "plain English written from the 10-K and checked" : "SEC industry class and the company's own words",
        industry: p.sicDescription,
        revenue_split: splits,
        revenue_split_note:
          p.splits.length > 0 ? "From the 10-K's XBRL data; parts add up to reported revenue." : p.segmentStatus === "single_segment" ? "The company reports one segment." : "The 10-K does not tag a revenue split that adds up to its total.",
      },
      sources: [{ kind: "filing", title: `${p.name} ${p.filing.form}${p.filing.filed ? ` filed ${p.filing.filed}` : ""}`, publisher: "SEC EDGAR", url: p.filing.url, date: p.filing.filed }],
      facts: [`What it does: ${p.oneLiner}`, ...p.splits.map((x) => `${x.title}: ${x.segments.map((g) => `${g.label} ${g.display}`).join(", ")}.`)],
      tiles: largest ? [{ label: largest.label, value: largest.display, note: "of revenue" }] : [],
    };
  },

  async get_history_outcome(args, ctx) {
    const s = upper(args.symbol);
    const h = await ctx.data.history(s);
    if (!h) return fail(`${s} history`, `No price history for ${s}.`);
    return {
      ok: true,
      label: `${s} history`,
      data: {
        symbol: s,
        name: h.name,
        what_this_is: h.kind === "baseline" ? "base rate: every stretch of its price history (nothing unusual today) - NOT similar moments" : h.kind === "similar" ? "past moments like today in its own price history, and what followed" : "not enough comparable history",
        result: h.line,
        typical_range: h.range,
        confidence: h.confidence,
        matched_on: h.matchedOn,
        caveat: h.caveat,
      },
      sources: [{ kind: "data", title: `${s} analog scan of stored daily prices`, publisher: "Cairn analysis engine", url: `/ticker/${s}`, date: null }],
      facts: [h.line, h.range, `${h.confidence} ${h.caveat}`].filter((x): x is string => !!x),
      tiles: h.kind === "similar" || h.kind === "baseline" ? [{ label: "Higher afterwards", value: `${h.higher} of ${h.n}`, note: h.kind === "baseline" ? "any 2 weeks" : "similar moments" }] : [],
      analysisId: h.analysisId,
    };
  },

  async get_news(args, ctx) {
    const s = args.symbol ? upper(args.symbol) : undefined;
    const days = Math.min(Math.max(Number(args.days) || 7, 1), 30);
    const items = await ctx.data.news({ symbol: s, query: args.query ? String(args.query) : undefined, days });
    const label = s ? `${s} news` : "news";
    if (items.length === 0) return { ...fail(label, `No stored news${s ? ` for ${s}` : ""} in the last ${days} days.`), ok: true };
    return {
      ok: true,
      label,
      data: { headlines: items.map((n) => ({ title: n.title, source: n.publisher, date: plainDate(n.date) })) },
      sources: items.map(newsSource),
      facts: items.slice(0, 3).map((n) => `"${n.title}" (${n.publisher}, ${plainDate(n.date)}).`),
      tiles: [],
    };
  },

  async get_calendar(args, ctx) {
    const raw = String(args.symbol ?? "");
    let symbols: string[];
    if (/^portfolio$/i.test(raw)) {
      if (!ctx.usePortfolio) return fail("your calendar", "Portfolio context is turned off for this conversation.");
      const p = await ctx.data.portfolio();
      symbols = p ? p.holdings.map((h) => h.symbol) : [];
    } else symbols = [upper(raw)];
    const events = await ctx.data.calendar(symbols, 60);
    const label = /^portfolio$/i.test(raw) ? "your calendar" : `${symbols[0]} calendar`;
    if (events.length === 0) return { ok: true, label, data: { upcoming: [], note: "No earnings or dividend dates in the next 60 days." }, sources: [], facts: ["No earnings or dividend dates are in Cairn's calendar for the next 60 days."], tiles: [] };
    return {
      ok: true,
      label,
      data: { upcoming: events.map((e) => ({ symbol: e.symbol, event: eventWords(e), date: plainDate(e.date), status: e.estimated ? "estimated" : "confirmed" })) },
      sources: [{ kind: "data", title: "Cairn earnings and dividend calendar", publisher: "Cairn calendar", url: "/calendar", date: null }],
      facts: events.slice(0, 4).map((e) => `${e.symbol}: ${eventWords(e)}.`),
      tiles: events.slice(0, 1).map((e) => ({ label: `Next: ${e.symbol}`, value: plainDate(e.date), note: e.kind === "earnings" ? (e.estimated ? "results, estimated" : "results, confirmed") : "dividend" })),
    };
  },

  async get_portfolio(_args, ctx) {
    if (!ctx.usePortfolio) return fail("your portfolio", "Portfolio context is turned off for this conversation (Settings > AI Assistant).");
    const p = await ctx.data.portfolio();
    if (!p) return { ok: true, label: "your portfolio", data: { holdings: [], note: "The reader has no holdings in Cairn yet." }, sources: [], facts: ["You haven't added any holdings to Cairn yet."], tiles: [] };
    const money = (v: number | null) => (v === null ? null : formatMoney(v, ctx.prefs));
    const total = p.totalValueUsd;
    const holdings = p.holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      quantity: h.quantity,
      value: money(h.valueUsd),
      weight: h.valueUsd !== null && total > 0 ? weightPct(h.valueUsd / total) : null,
      today: signedPct(h.dayChangePct),
      this_week: signedPct(h.weekChangePct),
      gain_since_bought: h.gainUsd === null ? null : `${h.gainUsd >= 0 ? "+" : "-"}${money(Math.abs(h.gainUsd))} (${signedPct(h.gainPct)})`,
      scorecard: h.scores.filter((x) => x.level !== "not_applicable").map((x) => `${x.label}: ${x.verdict}`),
    }));
    const top = [...p.holdings].filter((h) => h.valueUsd !== null).sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))[0];
    const topWeight = top && total > 0 ? weightPct((top.valueUsd ?? 0) / total) : null;
    const facts = [
      `Your portfolio is worth ${money(total)}${signedPct(p.dayChangePct) ? `, ${signedPct(p.dayChangePct)} today` : ""}${signedPct(p.weekChangePct) ? ` and ${signedPct(p.weekChangePct)} this week` : ""}.`,
      p.gainUsd !== null ? `Since you bought, it is ${p.gainUsd >= 0 ? "up" : "down"} ${money(Math.abs(p.gainUsd))} (${signedPct(p.gainPct)}).` : null,
      top && topWeight ? `Your largest holding is ${top.name} at ${topWeight} of the total.` : null,
      ...p.upcoming.slice(0, 2).map((e) => `${e.symbol}: ${eventWords(e)}.`),
    ].filter((x): x is string => !!x);
    return {
      ok: true,
      label: "your portfolio",
      data: {
        display_currency: ctx.prefs.effectiveCurrency,
        total_value: money(total),
        today: `${p.dayChangeUsd >= 0 ? "+" : "-"}${money(Math.abs(p.dayChangeUsd))} (${signedPct(p.dayChangePct)})`,
        this_week: signedPct(p.weekChangePct),
        cost_basis: money(p.costBasisUsd),
        gain_since_bought: p.gainUsd === null ? null : `${p.gainUsd >= 0 ? "+" : "-"}${money(Math.abs(p.gainUsd))} (${signedPct(p.gainPct)})`,
        holdings,
        upcoming: p.upcoming.map((e) => ({ symbol: e.symbol, event: eventWords(e) })),
      },
      sources: [{ kind: "data", title: "Your holdings in Cairn, valued at the latest prices", publisher: "Cairn portfolio", url: "/portfolio", date: null }],
      facts,
      tiles: [
        { label: "Portfolio value", value: money(total)!, note: signedPct(p.dayChangePct) ? `${signedPct(p.dayChangePct)} today` : undefined },
        ...(signedPct(p.weekChangePct) ? [{ label: "This week", value: signedPct(p.weekChangePct)! }] : []),
        ...(p.gainUsd !== null ? [{ label: "Since bought", value: signedPct(p.gainPct)!, note: `${p.gainUsd >= 0 ? "+" : "-"}${money(Math.abs(p.gainUsd))}` }] : []),
        ...(top && topWeight ? [{ label: "Largest holding", value: topWeight, note: top.symbol }] : []),
      ],
    };
  },

  async compare(args, ctx) {
    const symbols = (Array.isArray(args.symbols) ? args.symbols : []).map(upper).filter(Boolean).slice(0, 4);
    if (symbols.length < 2) return fail("comparison", "Give two to four symbols to compare.");
    const rows = await Promise.all(
      symbols.map(async (s) => {
        const [p, c] = await Promise.all([ctx.data.priceSummary(s), ctx.data.scorecard(s)]);
        return { s, p, c };
      }),
    );
    const table = rows.map(({ s, p, c }) => ({
      symbol: s,
      name: p?.name ?? c?.name ?? s,
      price: p ? usd(p.last.price) : null,
      change: p ? Object.fromEntries(p.changes.map((x) => [x.window, signedPct(x.pct)])) : null,
      scorecard: c ? c.dimensions.filter((d) => d.level !== "not_applicable").map((d) => `${d.label}: ${d.verdict}`) : [],
    }));
    return {
      ok: rows.some((r) => r.p || r.c),
      label: `${symbols.join(" vs ")}`,
      data: { compared: table },
      sources: rows.filter((r) => r.p).map((r) => ({ kind: "data" as const, title: `${r.s} daily prices`, publisher: "Cairn market data", url: `/ticker/${r.s}`, date: r.p!.last.date })),
      facts: table.map((t) => `${t.name}: ${t.price ?? "no price"}${t.change?.["1 year"] ? `, ${t.change["1 year"]} over a year` : ""}${t.scorecard.length ? `; ${t.scorecard.slice(0, 2).join("; ")}` : ""}.`),
      tiles: table.slice(0, 4).map((t) => ({ label: t.symbol, value: t.change?.["1 year"] ?? t.price ?? "-", note: t.change?.["1 year"] ? "1 year" : undefined })),
    };
  },

  async web_search(args, ctx) {
    const r = await ctx.data.web(String(args.query ?? ""));
    if (!r.ok) return { ...fail("the web", r.error ?? "Web search failed."), costUsd: r.costUsd };
    return {
      ok: true,
      label: "the web",
      untrusted: true,
      data: { summary: r.summary, results: r.results.map((x) => ({ title: x.title, publisher: x.publisher, url: x.url, snippet: x.snippet })) },
      sources: r.results.map((x) => ({ kind: "web" as const, title: x.title, publisher: x.publisher, url: x.url, date: null })),
      facts: [],
      tiles: [],
      costUsd: r.costUsd,
    };
  },
};

export const TOOL_NAMES = Object.keys(IMPLS) as ToolName[];

export function isToolName(v: string): v is ToolName {
  return (TOOL_NAMES as string[]).includes(v);
}

/** Run one tool. Never throws: a failure is an outcome the answer can describe. */
export async function runTool(name: ToolName, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const started = Date.now();
  try {
    const out = await IMPLS[name](args, ctx);
    return { name, args, ms: Date.now() - started, ...out };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return { name, args, ms: Date.now() - started, ok: false, label: name.replace(/_/g, " "), data: { error: "This data could not be read just now." }, sources: [], facts: [], tiles: [], error };
  }
}
