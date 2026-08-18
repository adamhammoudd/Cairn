"use client";

import { useState } from "react";
import { formatMarketCap } from "@/lib/screener";
import { formatSupply } from "@/lib/crypto";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { DiscussionPanel } from "@/components/ticker/discussion-panel";
import { AddHoldingButton } from "@/components/ticker/add-holding-button";
import type { DiscussionComment } from "@/lib/discussion";

const EQUITY_TABS = ["Chart", "Profile", "Financials", "News", "Analysis", "Discussion"] as const;
const CRYPTO_TABS = ["Chart", "Profile", "News", "Analysis", "Discussion"] as const;

interface TickerWorkspaceProps {
  data: TickerData;
  analyses: AnalysisWithMethodology[];
  discussion: DiscussionComment[];
  analysisDepth: "top_line" | "full";
}

export function TickerWorkspace({ data, analyses, discussion, analysisDepth }: TickerWorkspaceProps) {
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
    <div>
      <div>
        <div>
          <div>
            {data.symbol.slice(0, 2)}
          </div>
          <div>
            <div>
              <h1>{data.symbol}</h1>
              <span>
                {data.assetType}
              </span>
            </div>
            {isCrypto && data.cryptoMetrics && (
              <div>{data.cryptoMetrics.name}</div>
            )}
          </div>
        </div>

        <div>
          <div>
            <div>
              {data.price === null ? "—" : data.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            </div>
            <div

 >
              {data.changePct === null ? "—" : `${positive ? "+" : ""}${data.changePct.toFixed(2)}% today`}
            </div>
            <div>
              {data.priceSource === "live" ? "Live" : "Last close · delayed"}
            </div>
          </div>
          <AddHoldingButton symbol={data.symbol} assetType={data.assetType} />
        </div>
      </div>

      <div>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}

 >
            {t}
          </button>
        ))}
      </div>

      {tab === "Chart" && <TickerChart bars={data.bars} positive={positive} />}

      {tab === "Profile" && (
        <div>
          {isCrypto ? (
            data.cryptoMetrics ? (
              <div>
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
              <p>No crypto metrics ingested yet for this asset.</p>
            )
          ) : (
            <div>
              <Stat label="Market cap" value={formatMarketCap(marketCap)} />
              <Stat label="P/E (TTM)" value={pe === null ? "—" : pe.toFixed(1)} />
              <Stat label="Dividend yield" value={dividendYield === null ? "—" : `${dividendYield.toFixed(2)}%`} />
              <Stat label="Volume" value={data.volume === null ? "—" : data.volume.toLocaleString()} />
            </div>
          )}
          {!isCrypto && !data.fundamentals && (
            <p>
              No SEC fundamentals filed for this symbol (common for ETFs/funds) — cap, P/E, and yield stay blank
              rather than being estimated.
            </p>
          )}

          {data.esg && (
            <div>
              <div>ESG scores</div>
              <div>
                <Stat label="Environmental" value={data.esg.environmental ?? "—"} />
                <Stat label="Social" value={data.esg.social ?? "—"} />
                <Stat label="Governance" value={data.esg.governance ?? "—"} />
                <Stat label="Total" value={data.esg.total ?? "—"} />
              </div>
              <p>
                ESG scores are illustrative demo data ({data.esg.source}), not sourced from a live ESG data provider.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "Financials" && !isCrypto && (
        <div>
          {data.fundamentals ? (
            <div>
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
            <p>
              No reported XBRL figures for this symbol — ETFs and funds don&apos;t file these concepts.
            </p>
          )}
        </div>
      )}

      {tab === "News" && (
        <div>
          {data.news.length === 0 ? (
            <p>No recent news ingested for {data.symbol}.</p>
          ) : (
            <ul>
              {data.news.map((n) => (
                <li key={n.id}>
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>
                  ) : (
                    <span>{n.title}</span>
                  )}
                  <div>
                    {n.source_name} · {new Date(n.published_at).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "Discussion" && <DiscussionPanel symbol={data.symbol} comments={discussion} />}

      {tab === "Analysis" && (
        <div>
          <TickerAnalysisRequest symbol={data.symbol} />
          {analyses.length === 0 ? (
            <div>
              No analyses for {data.symbol} yet. Request one above.
            </div>
          ) : (
            analyses.map((a) => <MethodologyCard key={a.id} analysis={a} depth={analysisDepth} />)
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}
