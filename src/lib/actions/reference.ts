"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureProfile, ensureStatements, ensureOptions, STATEMENT_LINES } from "@/lib/market-data/reference";
import type { StatementKind, PeriodType, SymbolProfile } from "@/lib/market-data/reference";

// These load on tab activation rather than with the page. Profile, statements
// and the options chain are three more provider round-trips, and paying for
// them on every ticker view would slow the Overview tab for the majority of
// readers who never open the others.

export interface ProfileResult {
  profile: SymbolProfile | null;
  /** Why there is no profile, when there is none - never left to the reader to guess. */
  detail: string | null;
}

export async function getSymbolProfile(symbol: string): Promise<ProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profile: null, detail: "Sign in to load company profiles." };

  const profile = await ensureProfile(symbol.trim().toUpperCase());
  if (profile) return { profile, detail: null };
  return {
    profile: null,
    detail:
      "The market-data provider carries no company profile for this instrument. That is expected for indices, FX pairs and most funds - nothing is shown rather than a generic description.",
  };
}

export interface StatementTable {
  periods: { period_end: string; currency: string | null; line_items: Record<string, number> }[];
  lines: { key: string; label: string; emphasis?: boolean }[];
  detail: string | null;
}

export async function getFinancialStatements(
  symbol: string,
  statement: StatementKind,
  periodType: PeriodType,
): Promise<StatementTable> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { periods: [], lines: [], detail: "Sign in to load financial statements." };

  const upper = symbol.trim().toUpperCase();
  await ensureStatements(upper);

  const { data } = await supabase
    .from("financial_statements")
    .select("period_end, currency, line_items")
    .eq("symbol", upper)
    .eq("statement", statement)
    .eq("period_type", periodType)
    .order("period_end", { ascending: false })
    .limit(5);

  const periods = (data ?? []).map((r) => ({
    period_end: r.period_end,
    currency: r.currency,
    line_items: (r.line_items ?? {}) as Record<string, number>,
  }));

  // Only the lines this filing actually reported, in the declared reading
  // order. A line the provider omitted is left out entirely rather than shown
  // as a dash beside real figures, where it would read as "reported nothing".
  const present = new Set(periods.flatMap((p) => Object.keys(p.line_items)));
  const lines = STATEMENT_LINES[statement].filter((l) => present.has(l.key));

  return {
    periods,
    lines,
    detail:
      periods.length === 0
        ? "No filed statements for this symbol. Funds, indices, FX pairs and coins do not file company accounts, and the provider carries none for them."
        : null,
  };
}

export interface OptionsChain {
  expiries: string[];
  expiry: string | null;
  calls: OptionRow[];
  puts: OptionRow[];
  asOf: string | null;
  detail: string | null;
}

export interface OptionRow {
  strike: number;
  last_price: number | null;
  bid: number | null;
  ask: number | null;
  change_pct: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  in_the_money: boolean | null;
}

export async function getOptionsChain(symbol: string, expiry?: string): Promise<OptionsChain> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { expiries: [], expiry: null, calls: [], puts: [], asOf: null, detail: "Sign in to load options." };

  const upper = symbol.trim().toUpperCase();
  const { expiries } = await ensureOptions(upper, expiry);

  const { data: stored } = await supabase
    .from("option_contracts")
    .select("expiry, option_type, strike, last_price, bid, ask, change_pct, volume, open_interest, implied_volatility, in_the_money, as_of")
    .eq("symbol", upper)
    .order("strike", { ascending: true });

  const rows = stored ?? [];
  const known = [...new Set([...expiries, ...rows.map((r) => r.expiry)])].sort();
  const selected = expiry && known.includes(expiry) ? expiry : (known[0] ?? null);
  const forExpiry = rows.filter((r) => r.expiry === selected);

  const shape = (r: (typeof rows)[number]): OptionRow => ({
    strike: Number(r.strike),
    last_price: r.last_price === null ? null : Number(r.last_price),
    bid: r.bid === null ? null : Number(r.bid),
    ask: r.ask === null ? null : Number(r.ask),
    change_pct: r.change_pct === null ? null : Number(r.change_pct),
    volume: r.volume === null ? null : Number(r.volume),
    open_interest: r.open_interest === null ? null : Number(r.open_interest),
    implied_volatility: r.implied_volatility === null ? null : Number(r.implied_volatility),
    in_the_money: r.in_the_money,
  });

  return {
    expiries: known,
    expiry: selected,
    calls: forExpiry.filter((r) => r.option_type === "call").map(shape),
    puts: forExpiry.filter((r) => r.option_type === "put").map(shape),
    asOf: latestAsOf(forExpiry),
    detail:
      known.length === 0
        ? "No listed options for this symbol. Indices, FX pairs, coins and most funds have no options chain at this provider, and none is invented here."
        : null,
  };
}

/** Newest as-of across the returned contracts, for the staleness label. */
function latestAsOf(rows: { as_of: string }[]): string | null {
  if (rows.length === 0) return null;
  return rows.reduce((latest, r) => (r.as_of > latest ? r.as_of : latest), rows[0].as_of);
}
