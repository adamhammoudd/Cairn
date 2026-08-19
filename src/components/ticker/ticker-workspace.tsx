"use client";

import { formatMarketCap, formatVolume } from "@/lib/screener";
import { formatSupply } from "@/lib/crypto";
import { assetName } from "@/lib/asset-names";
import { decodeEntities } from "@/lib/news";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { DiscussionPanel } from "@/components/ticker/discussion-panel";
import { AddHoldingButton } from "@/components/ticker/add-holding-button";
import { WatchButton } from "@/components/ticker/watch-button";
import type { DiscussionComment } from "@/lib/discussion";

interface TickerWorkspaceProps {
  data: TickerData;
  analyses: AnalysisWithMethodology[];
  discussion: DiscussionComment[];
  analysisDepth: "top_line" | "full";
  /** Quantity held and weighted average cost, for the mock subline. */
  heldQuantity: number | null;
  avgCost: number | null;
  watchlists: { id: string; name: string; hasSymbol: boolean }[];
}

export function TickerWorkspace({
  data,
  analyses,
  discussion,
  analysisDepth,
  heldQuantity,
  avgCost,
  watchlists,
}: TickerWorkspaceProps) {
  const isCrypto = data.assetType === "crypto";
  const positive = (data.changePct ?? 0) >= 0;

  // Derived the same way the screener does — from fundamentals + latest
  // close, never stored, so it can't go stale as the price moves.
  const marketCap =
    data.price !== null && data.fundamentals?.shares_outstanding
      ? data.price * data.fundamentals.shares_outstanding
      : null;
  const pe =
    data.price !== null && data.fundamentals?.eps_ttm && data.fundamentals.eps_ttm > 0
      ? data.price / data.fundamentals.eps_ttm
      : null;
  // The mock's header shows the day's move in percent and dollars; only the
  // percent is stored, so the absolute is backed out of the current price.
  const changeAbs =
    data.price !== null && data.changePct !== null && data.changePct !== -100
      ? data.price - data.price / (1 + data.changePct / 100)
      : null;

  const name = isCrypto && data.cryptoMetrics ? data.cryptoMetrics.name : assetName(data.symbol, data.assetType);
  const subline = [
    name,
    heldQuantity === null || heldQuantity === 0 ? "not in your portfolio" : `${heldQuantity} held`,
    heldQuantity && avgCost
      ? `${avgCost.toLocaleString(undefined, { style: "currency", currency: "USD" })} avg`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const money = (n: number | null) => (n === null ? "—" : n.toLocaleString(undefined, { style: "currency", currency: "USD" }));
  const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "—" : `${money(lo)} – ${money(hi)}`);

  const stats: { label: string; value: string | number }[] = isCrypto
    ? [
        { label: "Open", value: money(data.open) },
        { label: "Day range", value: range(data.dayLow, data.dayHigh) },
        { label: "52w range", value: range(data.week52Low, data.week52High) },
        { label: "Volume", value: formatVolume(data.volume) },
        { label: "Market cap", value: formatMarketCap(data.cryptoMetrics?.market_cap ?? null) },
        { label: "Market cap rank", value: data.cryptoMetrics?.market_cap_rank ?? "—" },
        { label: "Volatility 30d", value: data.volatility30d === null ? "—" : `${data.volatility30d.toFixed(0)}%` },
        {
          label: "Circulating supply",
          value: data.cryptoMetrics ? `${formatSupply(data.cryptoMetrics.circulating_supply)} ${data.symbol}` : "—",
        },
      ]
    : [
        { label: "Open", value: money(data.open) },
        { label: "Day range", value: range(data.dayLow, data.dayHigh) },
        { label: "52w range", value: range(data.week52Low, data.week52High) },
        { label: "Volume", value: formatVolume(data.volume) },
        { label: "Market cap", value: formatMarketCap(marketCap) },
        // The mock labels this P/E (fwd); no forward estimates are ingested,
        // so it stays trailing rather than presenting TTM as a forecast.
        { label: "P/E (TTM)", value: pe === null ? "—" : `${pe.toFixed(1)}x` },
        { label: "Volatility 30d", value: data.volatility30d === null ? "—" : `${data.volatility30d.toFixed(0)}%` },
        {
          label: "Next event",
          value: data.nextEvent
            ? `${data.nextEvent.event_type.charAt(0).toUpperCase()}${data.nextEvent.event_type.slice(1)} · ${new Date(
                data.nextEvent.event_date,
              ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
            : "None scheduled",
        },
      ];

  return (
    <div className="animate-page-in">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4.5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-light to-accent-dark px-1 font-mono text-[11px] leading-none text-canvas">
            {data.symbol.slice(0, 5)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-serif text-[30px] leading-[1.1] font-normal text-primary">{data.symbol}</h1>
              <span className="rounded-full border border-line px-2 py-0.75 font-mono text-[9.5px] tracking-[0.1em] text-muted uppercase">
                {data.assetType}
              </span>
            </div>
            <div className="mt-1.25 text-[13px] text-muted">{subline}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5.5">
          <div className="text-right">
            <div className="font-serif text-[30px] leading-none tabular-nums text-primary">
              {data.price === null ? "—" : data.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            </div>
            <div
              className={`mt-1.5 text-[12.5px] tabular-nums ${
                data.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"
              }`}
            >
              {data.changePct === null
                ? "—"
                : `${positive ? "+" : ""}${data.changePct.toFixed(2)}%${
                    changeAbs === null
                      ? ""
                      : ` · ${positive ? "+" : "-"}${Math.abs(changeAbs).toLocaleString(undefined, {
                          style: "currency",
                          currency: "USD",
                        })}`
                  } today`}
            </div>
          </div>
          <div className="flex gap-2">
            <WatchButton symbol={data.symbol} watchlists={watchlists} />
            <AddHoldingButton symbol={data.symbol} assetType={data.assetType} />
          </div>
        </div>
      </div>

      <div className="mb-3.5">
        <TickerChart symbol={data.symbol} bars={data.bars} positive={positive} priceSource={data.priceSource} />
      </div>

      {stats.length > 0 && (
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-[#232323] bg-panel px-3.75 py-3.25">
              <div className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">{s.label}</div>
              <div className="mt-1.75 text-[13.5px] tabular-nums text-primary">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {!isCrypto && !data.fundamentals && (
        <p className="mb-4 text-[12px] text-dim">
          No SEC fundamentals filed for this symbol (common for ETFs and funds) — cap, P/E, and yield stay blank
          rather than being estimated.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[300px_1fr]">
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="border-b border-[#1E1E1E] px-4 py-3.25 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
            Related news
          </div>
          {data.news.length === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-dim">No recent news ingested for {data.symbol}.</p>
          ) : (
            data.news.slice(0, 8).map((n) => (
              <div
                key={n.id}
                className="border-b border-[#171717] px-4 py-3.25 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
              >
                {n.url ? (
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12.5px] leading-[1.5] text-primary hover:text-accent"
                  >
                    {decodeEntities(n.title)}
                  </a>
                ) : (
                  <span className="text-[12.5px] leading-[1.5] text-primary">{decodeEntities(n.title)}</span>
                )}
                <div className="mt-1.25 text-[11px] text-dim">
                  {n.source_name} · {new Date(n.published_at).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3.5">
          <TickerAnalysisRequest symbol={data.symbol} />
          {analyses.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-10 text-center text-sm text-muted">
              No Cairn analysis for {data.symbol} yet. Request one above — every answer shows its sources, historical
              analogs, and confidence.
            </div>
          ) : (
            analyses.map((a) => <MethodologyCard key={a.id} analysis={a} depth={analysisDepth} />)
          )}

          {data.esg && (
            <div className="rounded-card border border-line bg-panel p-5">
              <div className="mb-3 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">ESG scores</div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
                {[
                  { label: "Environmental", value: data.esg.environmental ?? "—" },
                  { label: "Social", value: data.esg.social ?? "—" },
                  { label: "Governance", value: data.esg.governance ?? "—" },
                  { label: "Total", value: data.esg.total ?? "—" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">{s.label}</div>
                    <div className="mt-1.5 text-[14px] tabular-nums text-primary">{s.value}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-dim">
                ESG scores are illustrative demo data ({data.esg.source}), not sourced from a live ESG data provider.
              </p>
            </div>
          )}

          <DiscussionPanel symbol={data.symbol} comments={discussion} />
        </div>
      </div>
    </div>
  );
}
