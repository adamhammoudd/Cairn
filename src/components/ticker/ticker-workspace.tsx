"use client";

import { useState } from "react";
import { formatMarketCap, formatVolume } from "@/lib/screener";
import { formatSupply } from "@/lib/crypto";
import { assetName } from "@/lib/asset-names";
import { DataFreshness } from "@/components/data-freshness";
import { decodeEntities } from "@/lib/news";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { DiscussionPanel } from "@/components/ticker/discussion-panel";
import { AddHoldingButton } from "@/components/ticker/add-holding-button";
import { WatchButton } from "@/components/ticker/watch-button";
import { ProfilePanel } from "@/components/ticker/profile-panel";
import { TechnicalsPanel } from "@/components/ticker/technicals-panel";
import { StatementsPanel } from "@/components/ticker/statements-panel";
import { OptionsPanel } from "@/components/ticker/options-panel";
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
  /** Whether this reader may resolve reports; drives the moderation affordance. */
  canModerate?: boolean;
}

type TabId = "overview" | "profile" | "technicals" | "financials" | "options";

export function TickerWorkspace({
  data,
  analyses,
  discussion,
  analysisDepth,
  heldQuantity,
  avgCost,
  watchlists,
  canModerate = false,
}: TickerWorkspaceProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const isCrypto = data.assetType === "crypto";
  const isForex = data.assetType === "forex";
  const isIndex = data.assetType === "index" || data.assetType === "future";
  const positive = (data.changePct ?? 0) >= 0;

  // Derived the same way the screener does - from fundamentals + latest
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

  // The provider's own display name, stored on symbol_directory at ingest.
  // assetName() is a seven-symbol hardcoded map and is now only the fallback
  // for rows ingested before the directory existed.
  const name = data.name ?? (isCrypto && data.cryptoMetrics ? data.cryptoMetrics.name : assetName(data.symbol, data.assetType));
  const subline = [
    name,
    heldQuantity === null || heldQuantity === 0 ? "not in your portfolio" : `${heldQuantity} held`,
    heldQuantity && avgCost
      ? `${avgCost.toLocaleString(undefined, { style: "currency", currency: "USD" })} avg`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Forex quotes are rates, not dollar amounts: a EURUSD "price" of 1.0847
  // formatted as $1.08 is wrong twice over - the currency symbol is a
  // fabrication and two decimals throws away the pip. Index levels are not
  // currency either.
  const rate = (n: number | null) => (n === null ? "-" : n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 5 }));
  const level = (n: number | null) => (n === null ? "-" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const usd = (n: number | null) => (n === null ? "-" : n.toLocaleString(undefined, { style: "currency", currency: "USD" }));
  const money = isForex ? rate : isIndex ? level : usd;
  const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "-" : `${money(lo)} – ${money(hi)}`);

  const fromExtreme = (extreme: number | null) =>
    data.price === null || extreme === null || extreme === 0 ? "-" : `${(((data.price - extreme) / extreme) * 100).toFixed(2)}%`;

  const common = [
    { label: "Open", value: money(data.open) },
    { label: "Day range", value: range(data.dayLow, data.dayHigh) },
    { label: "52w range", value: range(data.week52Low, data.week52High) },
  ];
  const volatility = { label: "Volatility 30d", value: data.volatility30d === null ? "-" : `${data.volatility30d.toFixed(0)}%` };

  // Asset-type routing (roadmap Phase 9). Forex and index used to fall through
  // to the equity grid and print "P/E (TTM)" and "Next event" on a currency
  // pair, which are not things a currency pair has.
  const stats: { label: string; value: string | number }[] = isCrypto
    ? [
        ...common,
        { label: "Volume", value: formatVolume(data.volume) },
        { label: "Market cap", value: formatMarketCap(data.cryptoMetrics?.market_cap ?? null) },
        { label: "Market cap rank", value: data.cryptoMetrics?.market_cap_rank ?? "-" },
        volatility,
        {
          label: "Circulating supply",
          value: data.cryptoMetrics ? `${formatSupply(data.cryptoMetrics.circulating_supply)} ${data.symbol}` : "-",
        },
      ]
    : isForex
      ? [
          // A pair has no share count, no earnings and no corporate calendar;
          // what it does have is the two currencies and where the rate sits in
          // its own year.
          { label: "Base / quote", value: /^[A-Z]{6}$/.test(data.symbol) ? `${data.symbol.slice(0, 3)} / ${data.symbol.slice(3)}` : data.symbol },
          ...common,
          { label: "From 52w high", value: fromExtreme(data.week52High) },
          { label: "From 52w low", value: fromExtreme(data.week52Low) },
          volatility,
        ]
      : isIndex
        ? [
            ...common,
            // Index "volume" is the summed volume of the constituents where the
            // provider reports it, and is omitted where it does not.
            ...(data.volume === null ? [] : [{ label: "Constituent volume", value: formatVolume(data.volume) }]),
            { label: "From 52w high", value: fromExtreme(data.week52High) },
            { label: "From 52w low", value: fromExtreme(data.week52Low) },
            volatility,
          ]
        : [
            ...common,
            { label: "Volume", value: formatVolume(data.volume) },
            { label: "Market cap", value: formatMarketCap(marketCap) },
            // The mock labels this P/E (fwd); no forward estimates are ingested,
            // so it stays trailing rather than presenting TTM as a forecast.
            { label: "P/E (TTM)", value: pe === null ? "-" : `${pe.toFixed(1)}x` },
            volatility,
            {
              label: "Next event",
              value: data.nextEvent
                ? `${data.nextEvent.event_type.charAt(0).toUpperCase()}${data.nextEvent.event_type.slice(1)} · ${new Date(
                    data.nextEvent.event_date,
                  ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : "None scheduled",
            },
          ];

  // Statements and options exist for listed companies and funds. Offering the
  // tabs on a coin or a currency pair would mean two tabs that can only ever
  // say "nothing here", so they are not offered - the asset-type routing the
  // roadmap asks for, applied to the tab bar and not just the stat grid.
  const hasFilings = data.assetType === "equity" || data.assetType === "etf";
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "profile", label: "Profile" },
    { id: "technicals", label: "Technicals" },
    ...(hasFilings ? ([{ id: "financials", label: "Financials" }, { id: "options", label: "Options" }] as const) : []),
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
            <div className="font-serif text-[30px] leading-none tabular-nums text-primary">{money(data.price)}</div>
            <div
              className={`mt-1.5 text-[12.5px] tabular-nums ${
                data.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"
              }`}
            >
              {data.changePct === null
                ? "-"
                : `${positive ? "+" : ""}${data.changePct.toFixed(2)}%${
                    changeAbs === null ? "" : ` · ${positive ? "+" : "-"}${money(Math.abs(changeAbs))}`
                  } ${data.priceSource === "live" ? "today" : "on the last close"}`}
            </div>
            <div className="mt-1">
              <DataFreshness source={data.priceSource} asOf={data.priceAsOf} />
            </div>
          </div>
          <div className="flex gap-2">
            <WatchButton symbol={data.symbol} watchlists={watchlists} />
            <AddHoldingButton symbol={data.symbol} assetType={data.assetType} />
          </div>
        </div>
      </div>

      <div role="tablist" aria-label={`${data.symbol} sections`} className="mb-3.5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ticker-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ticker-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-[13px] transition-colors duration-base ease-standard ${
              tab === t.id ? "border-accent text-primary" : "border-transparent text-muted hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div role="tabpanel" id="ticker-panel-overview" aria-labelledby="ticker-tab-overview">
          <div className="mb-3.5">
            <TickerChart symbol={data.symbol} bars={data.bars} priceSource={data.priceSource} priceAsOf={data.priceAsOf} />
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

          {!isCrypto && !isForex && !isIndex && !data.fundamentals && (
            <p className="mb-4 text-[12px] text-dim">
              No SEC fundamentals filed for this symbol (common for ETFs and funds) - cap, P/E, and yield stay blank
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
                  No Cairn analysis for {data.symbol} yet. Request one above - every answer shows its sources, historical
                  analogs, and confidence.
                </div>
              ) : (
                analyses.map((a) => <MethodologyCard key={a.id} analysis={a} depth={analysisDepth} />)
              )}

              <DiscussionPanel symbol={data.symbol} comments={discussion} canModerate={canModerate} />
            </div>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div role="tabpanel" id="ticker-panel-profile" aria-labelledby="ticker-tab-profile">
          <ProfilePanel symbol={data.symbol} esg={data.esg} assetType={data.assetType} />
        </div>
      )}

      {tab === "technicals" && (
        <div role="tabpanel" id="ticker-panel-technicals" aria-labelledby="ticker-tab-technicals">
          <TechnicalsPanel symbol={data.symbol} bars={data.bars} priceSource={data.priceSource} priceAsOf={data.priceAsOf} />
        </div>
      )}

      {tab === "financials" && (
        <div role="tabpanel" id="ticker-panel-financials" aria-labelledby="ticker-tab-financials">
          <StatementsPanel symbol={data.symbol} />
        </div>
      )}

      {tab === "options" && (
        <div role="tabpanel" id="ticker-panel-options" aria-labelledby="ticker-tab-options">
          <OptionsPanel symbol={data.symbol} spot={data.price} />
        </div>
      )}
    </div>
  );
}
