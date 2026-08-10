"use client";

import { useState } from "react";
import { formatMarketCap } from "@/lib/screener";
import { formatSupply } from "@/lib/crypto";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { MethodologyCard } from "@/components/analysis/methodology-card";

const EQUITY_TABS = ["Chart", "Profile", "Financials", "News", "Analysis"] as const;
const CRYPTO_TABS = ["Chart", "Profile", "News", "Analysis"] as const;

interface TickerWorkspaceProps {
  data: TickerData;
  analyses: AnalysisWithMethodology[];
}

export function TickerWorkspace({ data, analyses }: TickerWorkspaceProps) {
  const isCrypto = data.assetType === "crypto";
  const tabs = isCrypto ? CRYPTO_TABS : EQUITY_TABS;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Chart");
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
  const dividendYield =
    data.price !== null && data.price > 0 && data.fundamentals?.dividends_ttm
      ? (data.fundamentals.dividends_ttm / data.price) * 100
      : null;

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-2xl text-primary">{data.symbol}</h2>
            <span className="rounded-md border border-line px-2 py-0.5 text-[11px] text-muted capitalize">
              {data.assetType}
            </span>
          </div>
          {isCrypto && data.cryptoMetrics && (
            <div className="mt-0.5 text-[13px] text-muted">{data.cryptoMetrics.name}</div>
          )}
        </div>
        <div className="text-right">
          <div className="font-serif text-2xl text-primary">
            {data.price === null ? "—" : data.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
          </div>
          <div className={`text-[13px] ${data.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"}`}>
            {data.changePct === null ? "—" : `${positive ? "+" : ""}${data.changePct.toFixed(2)}%`}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3.5 py-2.5 text-[13.5px] ${
              tab === t ? "border-b-2 border-accent text-primary" : "text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Chart" && <TickerChart bars={data.bars} positive={positive} />}

      {tab === "Profile" && (
        <div className="rounded-card border border-line bg-panel p-6">
          {isCrypto ? (
            data.cryptoMetrics ? (
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Market cap rank" value={data.cryptoMetrics.market_cap_rank ?? "—"} />
                <Stat label="Market cap" value={formatMarketCap(data.cryptoMetrics.market_cap)} />
                <Stat label="Volume (24h)" value={formatMarketCap(data.cryptoMetrics.total_volume_24h)} />
                <Stat
                  label="Circulating supply"
                  value={`${formatSupply(data.cryptoMetrics.circulating_supply)} ${data.symbol}`}
                />
                <Stat
                  label="Max supply"
                  value={data.cryptoMetrics.max_supply ? `${formatSupply(data.cryptoMetrics.max_supply)} ${data.symbol}` : "Uncapped"}
                />
              </div>
            ) : (
              <p className="text-[13px] text-dim">No crypto metrics ingested yet for this asset.</p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Market cap" value={formatMarketCap(marketCap)} />
              <Stat label="P/E (TTM)" value={pe === null ? "—" : pe.toFixed(1)} />
              <Stat label="Dividend yield" value={dividendYield === null ? "—" : `${dividendYield.toFixed(2)}%`} />
              <Stat label="Volume" value={data.volume === null ? "—" : data.volume.toLocaleString()} />
            </div>
          )}
          {!isCrypto && !data.fundamentals && (
            <p className="mt-4 text-[12px] text-dim">
              No SEC fundamentals filed for this symbol (common for ETFs/funds) — cap, P/E, and yield stay blank
              rather than being estimated.
            </p>
          )}
        </div>
      )}

      {tab === "Financials" && !isCrypto && (
        <div className="rounded-card border border-line bg-panel p-6">
          {data.fundamentals ? (
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Shares outstanding"
                value={data.fundamentals.shares_outstanding ? data.fundamentals.shares_outstanding.toLocaleString() : "—"}
              />
              <Stat label="EPS (TTM)" value={data.fundamentals.eps_ttm === null ? "—" : `$${data.fundamentals.eps_ttm.toFixed(2)}`} />
              <Stat
                label="Dividends (TTM)"
                value={data.fundamentals.dividends_ttm === null ? "—" : `$${data.fundamentals.dividends_ttm.toFixed(2)}`}
              />
            </div>
          ) : (
            <p className="text-[13px] text-dim">
              No reported XBRL figures for this symbol — ETFs and funds don&apos;t file these concepts.
            </p>
          )}
        </div>
      )}

      {tab === "News" && (
        <div className="rounded-card border border-line bg-panel p-6">
          {data.news.length === 0 ? (
            <p className="text-[13px] text-dim">No recent news ingested for {data.symbol}.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.news.map((n) => (
                <li key={n.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer" className="text-[13.5px] text-primary hover:text-accent">
                      {n.title}
                    </a>
                  ) : (
                    <span className="text-[13.5px] text-primary">{n.title}</span>
                  )}
                  <div className="mt-1 text-[11.5px] text-muted">
                    {n.source_name} · {new Date(n.published_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "Analysis" && (
        <div className="flex flex-col gap-5">
          <TickerAnalysisRequest symbol={data.symbol} />
          {analyses.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
              No analyses for {data.symbol} yet. Request one above.
            </div>
          ) : (
            analyses.map((a) => <MethodologyCard key={a.id} analysis={a} />)
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="mb-1 text-[11px] tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className="text-[14px] text-primary">{value}</div>
    </div>
  );
}
