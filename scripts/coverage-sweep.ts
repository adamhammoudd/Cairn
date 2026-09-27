// Coverage sweep: does analysis generation work for the tickers users can
// actually search, not just the handful Cairn happens to track?
//
// Runs the full generation pipeline - the same generateForScope the "Generate
// analysis" button runs after its quota gate (ingest, SEC company data,
// factor scan, fallbacks, text, guards, storage) - against real production
// data, READ-ONLY, with the model mocked:
//   * scripts/harness/tsconfig.readonly.json swaps the Supabase admin client
//     for one that reads production and keeps every write in memory, and the
//     LLM for one that makes no call (the text falls back to Cairn's template,
//     which must pass the same guards);
//   * provider fetches (Yahoo prices, SEC filings, CoinGecko) are real, and
//     throttled exactly as in production.
//
// The sample is drawn from symbol_directory with a fixed seed, so it repeats:
//   60 US equities - large / mid / small (by position in SEC's
//      company_tickers.json, which SEC orders by market value: top 500 /
//      501-2000 / the rest), including never-ingested `listed` ones
//   15 ETFs - the directory's ETFs plus listed rows named "... ETF"
//   40 coins - 20 from the top 100 by market-cap rank, 20 from the long tail
//
// For every symbol: the result, the stored bars, and for a failure its
// reason and whether it is legitimate. Legitimate: fewer than a year (252) of
// stored bars, or the provider has no data for the symbol. NOT legitimate:
// any failure for a symbol with a year or more of prices. Target: >= 95% of
// symbols with a year or more of prices produce an analysis.
//
// On a branch without lib/ai/analysis-pipeline.ts (main before
// fix/analysis-failure-reasons) it runs the action's old steps directly:
// ensureSymbolIngested at the analysis depth, then generateAnalysis.
//
// Run:
//   npx tsx --conditions=react-server --tsconfig scripts/harness/tsconfig.readonly.json scripts/coverage-sweep.ts [--seed 20260927] [--label after] [--only SYM,SYM]
// Writes docs/audits/coverage-sweep-<label>.md and .json. Exit code is 0
// whatever the result: this is a report, not a gate (it needs the network).

import "./tests/env";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readOnlyClient, resetOverlay } from "./harness/readonly-supabase";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { generateAnalysis } from "@/lib/ai/generate";
import { FACTOR_HISTORY_RANGE, TARGET_FACTOR_HISTORY_BARS, MIN_FACTOR_HISTORY_BARS } from "@/lib/ai/factors";
import { SEC_USER_AGENT } from "../supabase/functions/_shared/sec-user-agent";

// ------------------------------------------------------------------ sampling

/** mulberry32: small, fast, seeded. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` distinct items from `items` (sorted first, so the draw depends only on the seed). */
export function pick<T>(items: T[], n: number, rand: () => number, key: (t: T) => string): T[] {
  const pool = [...items].sort((a, b) => key(a).localeCompare(key(b)));
  const out: T[] = [];
  while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

interface DirRow {
  symbol: string;
  asset_type: string;
  name: string | null;
  status: string;
}

export interface SampleItem {
  symbol: string;
  stratum: string;
  status: string;
}

const ETF_NAME = /\b(ETF|ETN)\b/i;
const FUND_NAME = /\b(ETF|ETN|fund|trust)\b/i;

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function drawSample(seed: number): Promise<SampleItem[]> {
  const db = readOnlyClient();
  const rand = rng(seed);
  const dir = await readAll<DirRow>((f, t) => db.from("symbol_directory").select("symbol, asset_type, name, status").in("status", ["available", "listed"] as never).order("symbol").range(f, t));

  // Size proxy for US shares: SEC orders company_tickers.json by market value.
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`SEC ticker file: HTTP ${res.status}`);
  const secOrder = new Map<string, number>();
  Object.values((await res.json()) as Record<string, { ticker: string }>).forEach((e, i) => {
    if (!secOrder.has(e.ticker.toUpperCase())) secOrder.set(e.ticker.toUpperCase(), i);
  });

  const shares = dir.filter((d) => d.asset_type === "equity" && !FUND_NAME.test(d.name ?? "") && secOrder.has(d.symbol));
  const rank = (d: DirRow) => secOrder.get(d.symbol)!;
  const large = shares.filter((d) => rank(d) < 500);
  const mid = shares.filter((d) => rank(d) >= 500 && rank(d) < 2000);
  const small = shares.filter((d) => rank(d) >= 2000);
  const etfs = dir.filter((d) => d.asset_type === "etf" || (d.asset_type === "equity" && ETF_NAME.test(d.name ?? "")));

  const coinRows = dir.filter((d) => d.asset_type === "crypto");
  const ranks = await readAll<{ symbol: string; market_cap_rank: number | null }>((f, t) => db.from("crypto_metrics").select("symbol, market_cap_rank").order("symbol").range(f, t));
  const rankOf = new Map(ranks.filter((r) => r.market_cap_rank !== null).map((r) => [r.symbol, r.market_cap_rank as number]));
  const topCoins = coinRows.filter((d) => (rankOf.get(d.symbol) ?? Infinity) <= 100);
  const tailCoins = coinRows.filter((d) => !((rankOf.get(d.symbol) ?? Infinity) <= 100));

  const tag = (rows: DirRow[], stratum: string) => rows.map((d) => ({ symbol: d.symbol, stratum, status: d.status }));
  const key = (d: DirRow) => d.symbol;
  return [
    ...tag(pick(large, 20, rand, key), "equity: large"),
    ...tag(pick(mid, 20, rand, key), "equity: mid"),
    ...tag(pick(small, 20, rand, key), "equity: small"),
    ...tag(pick(etfs, 15, rand, key), "etf"),
    ...tag(pick(topCoins, 20, rand, key), "coin: top 100"),
    ...tag(pick(tailCoins, 20, rand, key), "coin: long tail"),
  ];
}

// --------------------------------------------------------------- one symbol

export interface SweepResult extends SampleItem {
  ok: boolean;
  /** Canonical symbol after ingestion (BTC-USD -> BTC). */
  canonical: string;
  bars: number;
  assetType: string | null;
  /** What the reader would see on failure. */
  message: string | null;
  /** Reason codes (new pipeline) or the thrown error's shape (old). */
  reasons: string[];
  /** The underlying error text, for the log. */
  detail: string | null;
  legitimate: boolean | null;
  legitimacy: string;
  basis: string | null;
  fallback: string | null;
  news: number | null;
  dataSources: number | null;
  ms: number;
}

type Outcome = { ok: boolean; scopeValue: string; message: string | null; reasons: string[]; detail: string | null; stored: Record<string, unknown> | null; ingestStatus: string | null };

/** The pipeline this branch has: generateForScope when present, else the action's old steps. */
async function runPipeline(symbol: string): Promise<Outcome & { pipeline: string }> {
  type PipelineModule = { generateForScope?: (t: "ticker", v: string, o: { supabaseClient: ReturnType<typeof readOnlyClient> }) => Promise<Record<string, unknown>> };
  let mod: PipelineModule | null = null;
  try {
    mod = (await import("@/lib/ai/analysis-pipeline" as string)) as PipelineModule;
  } catch {
    mod = null;
  }
  if (mod?.generateForScope) {
    const out = (await mod.generateForScope("ticker", symbol, { supabaseClient: readOnlyClient() })) as {
      ok: boolean;
      scopeValue?: string;
      stored?: Record<string, unknown>;
      message?: string;
      kind?: string;
      gap?: { reasons: string[] };
    };
    return {
      pipeline: "generateForScope",
      ok: out.ok,
      scopeValue: out.scopeValue ?? symbol,
      message: out.ok ? null : (out.message ?? null),
      reasons: out.ok ? [] : (out.gap?.reasons ?? [out.kind ?? "error"]),
      detail: null,
      stored: out.stored ?? null,
      ingestStatus: null,
    };
  }
  // main before fix/analysis-failure-reasons: the action's steps, verbatim.
  const ingest = await ensureSymbolIngested(symbol, { range: FACTOR_HISTORY_RANGE, minBars: TARGET_FACTOR_HISTORY_BARS });
  if (ingest.status !== "available") {
    return { pipeline: "legacy", ok: false, scopeValue: ingest.symbol, message: ingest.detail, reasons: [`ingest_${ingest.status}`], detail: ingest.detail, stored: null, ingestStatus: ingest.status };
  }
  try {
    const a = (await generateAnalysis({ scopeType: "ticker", scopeValue: ingest.symbol, supabaseClient: readOnlyClient() })) as unknown as Record<string, unknown>;
    return { pipeline: "legacy", ok: true, scopeValue: ingest.symbol, message: null, reasons: [], detail: null, stored: a, ingestStatus: "available" };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    // The three shapes lib/actions/analysis.ts isThinDataFailure mapped to one
    // message; anything else was a generic error.
    const reason = m.includes("No news or historical event data")
      ? "thin: no news and no events"
      : m.includes("No historical analogs with usable")
        ? "thin: no usable analogs"
        : m.includes("must cite at least one source")
          ? "thin: no news"
          : "error";
    const shown = reason.startsWith("thin")
      ? "Not enough historical data available for this scope yet - too few comparable situations in the record to put a confidence range on."
      : "Something went wrong generating that analysis.";
    return { pipeline: "legacy", ok: false, scopeValue: ingest.symbol, message: shown, reasons: [reason], detail: m, stored: null, ingestStatus: "available" };
  }
}

async function storedBars(symbol: string): Promise<number> {
  const { count, error } = await readOnlyClient().from("historical_prices").select("ts", { count: "exact", head: true }).eq("symbol", symbol).not("close", "is", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const PROVIDER_MISSING = /couldn't find market data|no data for this symbol|not a valid symbol|ingest_unavailable|provider returned a/i;

export function judge(r: Pick<SweepResult, "ok" | "bars" | "message" | "reasons" | "detail">): { legitimate: boolean | null; legitimacy: string } {
  if (r.ok) return { legitimate: null, legitimacy: "produced an analysis" };
  const text = `${r.message ?? ""} ${r.reasons.join(" ")} ${r.detail ?? ""}`;
  // A provider refusal says nothing about the symbol: never "legitimate", whatever is stored.
  if (/rate_limited|busy|provider is busy/i.test(text)) return { legitimate: false, legitimacy: "transient: provider busy (re-run)" };
  if (r.bars === 0 && PROVIDER_MISSING.test(text)) return { legitimate: true, legitimacy: "provider has no data for this symbol" };
  if (r.bars < MIN_FACTOR_HISTORY_BARS) return { legitimate: true, legitimacy: `only ${r.bars} days of history (under a year)` };
  return { legitimate: false, legitimacy: `NOT legitimate: ${r.bars} days of history and still failed` };
}

async function sweepOne(item: SampleItem): Promise<SweepResult & { pipeline: string }> {
  resetOverlay(["SPY", "BTC"]);
  const t0 = Date.now();
  let o: Outcome & { pipeline: string };
  try {
    o = await runPipeline(item.symbol);
  } catch (err) {
    o = { pipeline: "?", ok: false, scopeValue: item.symbol, message: "threw", reasons: ["threw"], detail: err instanceof Error ? err.message : String(err), stored: null, ingestStatus: null };
  }
  const bars = await storedBars(o.scopeValue).catch(() => 0);
  const { data: dir } = await readOnlyClient().from("symbol_directory").select("asset_type").eq("symbol", o.scopeValue).maybeSingle();
  const cond = (o.stored?.direction_conditions ?? null) as { basis?: string; fallback?: { matches?: number } } | null;
  const { overlayRows } = await import("./harness/readonly-supabase");
  const base = {
    ...item,
    ok: o.ok,
    canonical: o.scopeValue,
    bars,
    assetType: (dir?.asset_type as string | undefined) ?? null,
    message: o.message,
    reasons: o.reasons,
    detail: o.detail,
    basis: o.ok ? (cond?.basis ?? (o.stored?.direction_n != null ? "similar" : "none")) : null,
    fallback: cond?.fallback ? `unusual setup (${cond.fallback.matches} matches)` : null,
    news: o.ok ? overlayRows("ai_analysis_sources").length : null,
    dataSources: o.ok ? overlayRows("ai_analysis_data_sources").length : null,
    ms: Date.now() - t0,
  };
  return { ...base, ...judge(base), pipeline: o.pipeline };
}

// ------------------------------------------------------------------- report

export function summarise(results: SweepResult[]) {
  const groups = new Map<string, SweepResult[]>();
  for (const r of results) {
    const g = r.stratum.split(":")[0];
    groups.set(g, [...(groups.get(g) ?? []), r]);
  }
  const rows = [...groups.entries()].map(([g, rs]) => {
    const year = rs.filter((r) => r.bars >= MIN_FACTOR_HISTORY_BARS);
    const ok = year.filter((r) => r.ok).length;
    return { group: g, sampled: rs.length, produced: rs.filter((r) => r.ok).length, withYear: year.length, okWithYear: ok, rate: year.length ? ok / year.length : null };
  });
  const year = results.filter((r) => r.bars >= MIN_FACTOR_HISTORY_BARS);
  const okYear = year.filter((r) => r.ok).length;
  return { rows, total: { sampled: results.length, produced: results.filter((r) => r.ok).length, withYear: year.length, okWithYear: okYear, rate: year.length ? okYear / year.length : null } };
}

const pct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export function renderReport(results: (SweepResult & { pipeline: string })[], meta: { seed: number; label: string; commit: string; started: string; pipeline: string }): string {
  const s = summarise(results);
  const lines: string[] = [];
  lines.push(`# Coverage sweep - ${meta.label}`, "");
  lines.push(`Commit \`${meta.commit}\`, seed ${meta.seed}, run ${meta.started}. Pipeline: \`${meta.pipeline}\`. Production data read-only, model mocked (text from Cairn's template).`, "");
  lines.push(`**${pct(s.total.rate)}** of sampled symbols with a year or more of prices produced an analysis (${s.total.okWithYear} of ${s.total.withYear}). Target: 95%.`, "");
  lines.push("| Asset type | Sampled | Produced | With >= 1 year of prices | Produced (of those) | Rate |", "|---|---|---|---|---|---|");
  for (const r of s.rows) lines.push(`| ${r.group} | ${r.sampled} | ${r.produced} | ${r.withYear} | ${r.okWithYear} | ${pct(r.rate)} |`);
  lines.push(`| **all** | ${s.total.sampled} | ${s.total.produced} | ${s.total.withYear} | ${s.total.okWithYear} | **${pct(s.total.rate)}** |`, "");
  const failures = results.filter((r) => !r.ok);
  lines.push(`## Failures (${failures.length})`, "");
  if (failures.length === 0) lines.push("None.", "");
  else {
    lines.push("| Symbol | Stratum | Bars | Legitimate? | What the reader saw | Reason / detail |", "|---|---|---|---|---|---|");
    for (const r of failures) lines.push(`| ${r.symbol} | ${r.stratum} | ${r.bars} | ${r.legitimacy} | ${(r.message ?? "").replace(/\|/g, "/")} | ${[r.reasons.join(", "), r.detail ?? ""].filter(Boolean).join(": ").replace(/\|/g, "/").slice(0, 220)} |`);
    lines.push("");
  }
  lines.push("## Every symbol", "", "| Symbol | Stratum | Directory status | Bars | Result | History basis | Fallback | News cited | Data sources | Seconds |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) lines.push(`| ${r.symbol}${r.canonical !== r.symbol ? ` (${r.canonical})` : ""} | ${r.stratum} | ${r.status} | ${r.bars} | ${r.ok ? "analysis" : "failed"} | ${r.basis ?? ""} | ${r.fallback ?? ""} | ${r.news ?? ""} | ${r.dataSources ?? ""} | ${(r.ms / 1000).toFixed(1)} |`);
  return lines.join("\n") + "\n";
}

// --------------------------------------------------------------------- main

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const seed = Number(arg("seed") ?? 20260927);
  const label = arg("label") ?? "run";
  const only = arg("only")?.split(",").map((s) => s.trim().toUpperCase());
  const started = new Date().toISOString();
  // The commit of the code that ran (this file's checkout), not of the cwd.
  const commit = (() => {
    try {
      return execSync("git rev-parse --short HEAD", { cwd: path.dirname(fileURLToPath(import.meta.url)) }).toString().trim();
    } catch {
      return "unknown";
    }
  })();
  const sample = only ? only.map((symbol) => ({ symbol, stratum: "manual", status: "?" })) : await drawSample(seed);
  console.log(`Sample of ${sample.length} (seed ${seed}): ${sample.map((s) => s.symbol).join(" ")}`);
  const results: (SweepResult & { pipeline: string })[] = [];
  for (const item of sample) {
    const r = await sweepOne(item);
    results.push(r);
    console.log(`${r.ok ? "OK  " : "FAIL"} ${r.symbol.padEnd(8)} ${r.stratum.padEnd(16)} bars=${String(r.bars).padStart(5)} ${r.ok ? `basis=${r.basis}${r.fallback ? ` fallback=${r.fallback}` : ""}` : `${r.legitimacy} | ${r.message}`}`);
  }
  const outDir = path.resolve("docs/audits");
  fs.mkdirSync(outDir, { recursive: true });
  const md = renderReport(results, { seed, label, commit, started, pipeline: results[0]?.pipeline ?? "?" });
  fs.writeFileSync(path.join(outDir, `coverage-sweep-${label}.md`), md);
  fs.writeFileSync(path.join(outDir, `coverage-sweep-${label}.json`), JSON.stringify({ seed, label, commit, started, results }, null, 1));
  const s = summarise(results);
  console.log(`\n${pct(s.total.rate)} of symbols with >= 1 year of prices produced an analysis (${s.total.okWithYear}/${s.total.withYear}). Report: docs/audits/coverage-sweep-${label}.md`);
}

if (process.argv[1]?.endsWith("coverage-sweep.ts")) void main().catch((err) => {
  console.error(err);
  process.exitCode = 0; // a report, never a gate
});
