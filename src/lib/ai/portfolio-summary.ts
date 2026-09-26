// Trusted-code portfolio summary for the chat assistant's context.
//
// The model NEVER computes a portfolio figure. It is handed a small block of
// already-computed numbers and may only restate them verbatim - enforced by
// checkPortfolioFigureDrift() in scope-guard.ts, not just the system prompt.
// This module produces that block, reusing lib/portfolio.ts's computeTotals /
// computeHoldingMetrics so the figures are exactly the ones the Portfolio page
// shows (no second implementation of the math).
//
// Gated OFF by default in every environment (ENABLE_PORTFOLIO_CONTEXT). This
// is NOT option (c) of docs/decisions/2026-09-04-ai-portfolio-figures.md as
// that memo defines it - under (c) the model never receives the figures. It
// is a hybrid: the figures are computed on Cairn infrastructure, as in (c),
// but they ARE sent to the model in the PORTFOLIO_SUMMARY block, which is (b)'s
// data flow, and checkPortfolioFigureDrift() stops it changing them. Because
// real dollar figures reach the inference provider, the flag must stay off in
// every deployed environment until the founder confirms Groq's data-retention /
// DPA terms cover that - a vendor-account decision, not an engineering one. With the flag off, buildChatContext never calls into here and behaviour
// is exactly what PR #58 shipped (ticker symbols only).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { computeHoldingMetrics, computeTotals } from "@/lib/portfolio";
import { getLatestCloses } from "@/lib/market-data/current-price";
import { normalizePortfolioFigure } from "@/lib/ai/scope-guard";

/**
 * Whether the assistant may be given the reader's real portfolio figures. A
 * bare "true" is the only value that enables it; anything else (unset, "false",
 * "1", "on") keeps it off, so a misremembered value fails safe.
 */
export function portfolioContextEnabled(): boolean {
  return process.env.ENABLE_PORTFOLIO_CONTEXT === "true";
}

export interface HoldingFigure {
  symbol: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface PortfolioSummary {
  totalValue: number;
  todayChangeValue: number;
  todayChangePct: number;
  /**
   * Per-holding detail, ONLY for tickers the reader named in the current
   * message and actually holds. Empty on a turn that names no held ticker -
   * the three top-line figures above are all the model gets by default. Never
   * the whole portfolio's cost basis on every turn (decision memo §5, "what
   * NOT to do").
   */
  holdings: HoldingFigure[];
}

const money = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number): string => n.toFixed(2);
const signedMoney = (n: number): string => `${n < 0 ? "-" : "+"}$${money(Math.abs(n))}`;
const signedPct = (n: number): string => `${n < 0 ? "-" : "+"}${pct(Math.abs(n))}%`;

/**
 * The delimited block injected into the chat context. Every number the model is
 * allowed to state about the reader's portfolio appears here, formatted exactly
 * as it must be restated.
 */
export function renderPortfolioSummaryBlock(s: PortfolioSummary): string {
  const lines = [
    "PORTFOLIO_SUMMARY (computed by Cairn from the reader's own holdings - " +
      "restate these figures verbatim only; never compute, estimate, or derive another):",
    `- Total portfolio value: $${money(s.totalValue)}`,
    `- Today's change: ${signedMoney(s.todayChangeValue)} (${signedPct(s.todayChangePct)})`,
  ];
  for (const h of s.holdings) {
    lines.push(
      `- ${h.symbol}: ${h.quantity} shares, cost basis $${money(h.costBasis)}, ` +
        `current value $${money(h.currentValue)}, ` +
        `unrealized P&L ${signedMoney(h.unrealizedPnl)} (${signedPct(h.unrealizedPnlPct)})`,
    );
  }
  return lines.join("\n");
}

/**
 * Every dollar / percent figure the model is permitted to echo about the
 * portfolio, normalized the same way checkPortfolioFigureDrift() normalizes
 * what it finds in the model's output. Derived from the same formatters as
 * renderPortfolioSummaryBlock(), so "restate the block verbatim" always passes
 * and a rounded / recomputed / invented number never does. (Share counts are
 * not figures the guard polices - "20 shares" is plain text, never "$20".)
 */
export function portfolioSummaryFigures(s: PortfolioSummary): string[] {
  const raw = [
    money(s.totalValue),
    money(Math.abs(s.todayChangeValue)),
    pct(Math.abs(s.todayChangePct)),
  ];
  for (const h of s.holdings) {
    raw.push(
      money(h.costBasis),
      money(h.currentValue),
      money(Math.abs(h.unrealizedPnl)),
      pct(Math.abs(h.unrealizedPnlPct)),
    );
  }
  return raw.map(normalizePortfolioFigure);
}

/**
 * Top-line portfolio figures for `userId`, plus per-holding detail for any of
 * `namedTickers` the user actually holds. Returns null when the user holds
 * nothing. Reuses computeTotals / computeHoldingMetrics - the Portfolio page's
 * own math - so a figure here can never disagree with that page.
 *
 * `client` is the same optional request-scope escape hatch buildChatContext
 * and generateAnalysis already take. When it is omitted the market-data read
 * uses the request-scoped client, so this path assumes a Next.js request
 * scope; buildChatContext wraps the call in try/catch so a failure here just
 * drops the block rather than failing the turn.
 */
export async function buildPortfolioSummary(
  userId: string,
  namedTickers: string[],
  client?: SupabaseClient<Database>,
): Promise<PortfolioSummary | null> {
  const supabase = client ?? (await createClient());

  const { data: holdings } = await supabase.from("holdings").select("*").eq("user_id", userId);
  if (!holdings || holdings.length === 0) return null;

  const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
  // Ground truth for the crypto-quote hint - see the same note on the
  // Portfolio page for why this can't be inferred from historical_prices bars.
  const assetTypeBySymbol = new Map(holdings.map((h) => [h.symbol, h.asset_type]));
  const closes = await getLatestCloses(symbols, undefined, assetTypeBySymbol);
  const metrics = computeHoldingMetrics(holdings, closes);
  const totals = computeTotals(metrics, closes);

  const named = new Set(namedTickers);
  const holdingFigures: HoldingFigure[] = metrics
    .filter((m) => named.has(m.symbol) && m.value !== null && m.gain !== null && m.gainPct !== null)
    .map((m) => ({
      symbol: m.symbol,
      quantity: m.quantity,
      costBasis: m.purchase_price * m.quantity,
      currentValue: m.value as number,
      unrealizedPnl: m.gain as number,
      unrealizedPnlPct: m.gainPct as number,
    }));

  return {
    totalValue: totals.totalValue,
    todayChangeValue: totals.todayChangeValue,
    todayChangePct: totals.todayChangePct,
    holdings: holdingFigures,
  };
}
