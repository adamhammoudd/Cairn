"use client";

import { useState } from "react";
import Link from "next/link";
import { assetTypeBadge, formatMarketCap, formatVolume } from "@/lib/screener";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatAssetMoney, formatRoughUserMoney, formatUserMoney, pricesInLabel, userEquivalent } from "@/lib/display-prefs";
import { formatRateDate } from "@/components/layout/currency-note";
import { formatSupply } from "@/lib/crypto";
import { formatQuantity } from "@/lib/portfolio";
import { assetName } from "@/lib/asset-names";
import { TickerNewsList } from "@/components/news/ticker-news-list";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerHero } from "@/components/ticker/ticker-hero";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { AnalysisView, PremiumNote } from "@/components/analysis/analysis-view";
import type { AnalysisDisplay } from "@/lib/analysis-display";
import { DiscussionPanel } from "@/components/ticker/discussion-panel";
import { AddHoldingButton } from "@/components/ticker/add-holding-button";
import { WatchButton } from "@/components/ticker/watch-button";
import { ProfilePanel } from "@/components/ticker/profile-panel";
import { PositionCard } from "@/components/ticker/position-card";
import { TechnicalsPanel } from "@/components/ticker/technicals-panel";
import { StatementsPanel } from "@/components/ticker/statements-panel";
import { OptionsPanel } from "@/components/ticker/options-panel";
import type { DiscussionComment } from "@/lib/discussion";
import type { AnalysisSummaryView } from "@/lib/analysis-summary";
import { exposureLines, roughMoney } from "@/lib/exposure";
import { WhatItDoes } from "@/components/analysis/what-it-does";
import { CompanyNumbersTable } from "@/components/ticker/company-numbers-table";
import { isEstimatedEvent } from "@/lib/calendar";

interface TickerWorkspaceProps {
  data: TickerData;
  analyses: AnalysisWithMethodology[];
  discussion: DiscussionComment[];
  /** Quantity held and weighted average cost, for the mock subline. */
  heldQuantity: number | null;
  avgCost: number | null;
  watchlists: { id: string; name: string; hasSymbol: boolean }[];
  /** Whether this reader may resolve reports; drives the moderation affordance. */
  canModerate?: boolean;
  /** user_settings.refresh_rate_seconds - poll cadence for the live-quote refresh. */
  refreshRateSeconds?: number | null;
  /** Plain summary, scorecard, history and company numbers (feat/analysis-summary-layout). */
  summary: AnalysisSummaryView;
}

type TabId = "overview" | "profile" | "technicals" | "financials" | "options";

export function TickerWorkspace({
  data,
  analyses,
  discussion,
  heldQuantity,
  avgCost,
  watchlists,
  canModerate = false,
  refreshRateSeconds = null,
  summary,
}: TickerWorkspaceProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const prefs = useDisplayPrefs();
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

  // Forex quotes are rates, not dollar amounts: a EURUSD "price" of 1.0847
  // formatted as $1.08 is wrong twice over - the currency symbol is a
  // fabrication and two decimals throws away the pip. Index levels are not
  // currency either.
  const rate = (n: number | null) => (n === null ? "-" : n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 5 }));
  const level = (n: number | null) => (n === null ? "-" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  // Every price on this page - the headline, open, day and 52-week ranges,
  // market cap, chart and technicals - describes the asset, so it is shown in
  // the asset's own currency and never converted (feat/native-currency). Only
  // the reader's own position (value, gain) is their money, in their display
  // currency - see `userMoney` below.
  const currency = (n: number | null) => formatAssetMoney(n, data.currency);
  const money = isForex ? rate : isIndex ? level : currency;
  const userMoney = (n: number | null) => formatUserMoney(n, prefs);
  // "≈ €192.40 (ECB, 26 Sep 2026)" under the price, only when the display
  // currency differs and a dated rate converts it. A hint, not a restatement:
  // the headline stays in the asset's currency.
  const equivalent = isForex || isIndex ? null : userEquivalent(data.price, data.currency, prefs);
  const priceHint = equivalent && prefs.fxAsOf ? `${equivalent} (ECB, ${formatRateDate(prefs.fxAsOf)})` : equivalent;
  const pricesIn = isForex || isIndex ? null : pricesInLabel([data.currency]);
  const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "-" : `${money(lo)} – ${money(hi)}`);

  const fromExtreme = (extreme: number | null) =>
    data.price === null || extreme === null || extreme === 0 ? "-" : `${(((data.price - extreme) / extreme) * 100).toFixed(2)}%`;

  // The hero's position line: "You own 20 shares · €3,050" (feat/analysis-
  // summary-layout). The average cost stays on the Profile tab's position card.
  const unit = isCrypto ? data.symbol : heldQuantity === 1 ? "share" : "shares";
  const heroChips = heldQuantity
    ? [`You own ${formatQuantity(heldQuantity)} ${unit}${data.price === null ? "" : ` · ${userMoney(data.price * heldQuantity)}`}`]
    : [];

  // This week's change from the stored daily closes: 5 sessions back for a
  // listed security, 7 days for a coin (it trades every day).
  const weekBack = isCrypto ? 7 : 5;
  const weekBase = data.bars.length > weekBack ? data.bars[data.bars.length - 1 - weekBack]?.close ?? null : null;
  const weekChangePct = data.price !== null && weekBase ? ((data.price - weekBase) / weekBase) * 100 : null;

  // Where the last price sits between the session low and high, for the hero's
  // day-range rail. Null whenever the session has no spread to place it in.
  const dayRange =
    data.dayLow === null || data.dayHigh === null
      ? null
      : {
          low: money(data.dayLow),
          high: money(data.dayHigh),
          position:
            data.price === null || data.dayHigh === data.dayLow
              ? null
              : Math.min(1, Math.max(0, (data.price - data.dayLow) / (data.dayHigh - data.dayLow))),
        };

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
        { label: "Market cap", value: formatMarketCap(data.cryptoMetrics?.market_cap ?? null, data.currency) },
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
            { label: "Market cap", value: formatMarketCap(marketCap, data.currency) },
            // The mock labels this P/E (fwd); no forward estimates are ingested,
            // so it stays trailing rather than presenting TTM as a forecast.
            { label: "P/E (TTM)", value: pe === null ? "-" : `${pe.toFixed(1)}x` },
            volatility,
            {
              label: "Next event",
              value: data.nextEvent
                ? `${data.nextEvent.event_type.charAt(0).toUpperCase()}${data.nextEvent.event_type.slice(1)}${
                    isEstimatedEvent(data.nextEvent.metadata) ? " (est.)" : ""
                  } · ${new Date(data.nextEvent.event_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
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

  // ---- Full breakdown rows. Everything the Overview tab showed before this
  // layout lives here, collapsed; nothing is removed.
  const latest = analyses[0] ?? null;
  const filingSources = Array.from(
    new Map(summary.scorecard.dimensions.flatMap((d) => d.sources).map((src) => [`${src.label}|${src.ref ?? ""}`, src])).values(),
  );
  const newsPanel = (
            <div className="animate-rise-in overflow-hidden rounded-card border border-line bg-panel">
              <div className="flex items-center justify-between gap-2.5 border-b border-line-soft px-4 py-3.5">
                <span className="font-mono text-eyebrow text-muted uppercase">Related news</span>
                <Link href={`/news?q=${encodeURIComponent(data.symbol)}`} className="tap text-micro text-accent hover:underline">
                  All news →
                </Link>
              </div>
              <TickerNewsList symbol={data.symbol} initial={data.news} />
            </div>
  );
  // The analysis this page shows: the latest one, drawn by the same component
  // as every other surface. With none yet, the same view is built from
  // today's scorecard in Cairn's own words, and the history section offers to
  // make one.
  const display: AnalysisDisplay = latest
    ? latest.display
    : {
        id: `none-${data.symbol}`,
        scopeType: "ticker",
        scopeValue: data.symbol,
        name: summary.name,
        createdAt: new Date().toISOString(),
        textSource: "template",
        headline: summary.summary.headline,
        bullets: summary.summary.bullets,
        history: {
          kind: "none",
          basisLabel: null,
          line: `No analysis of ${summary.name} yet. An analysis looks for past moments like today in its own prices and counts what followed.`,
          range: null,
          extremes: null,
          confidence: "low",
          confidenceText: "",
          caveat: "",
          n: 0,
          higher: 0,
          lower: 0,
          horizon: isCrypto ? "10 days" : "2 weeks",
          dots: [],
          matchedOn: [],
        },
        scorecard: summary.scorecard,
        watch: [],
        sourcesUsed: [],
        dataSources: [],
        noNews: null,
        cases: null,
        caseCount: 0,
        trader: null,
        plan: summary.plan,
      };
  const closestAnalog = latest && latest.display.cases === null ? (latest.analogs[0] ?? null) : null;
  const statsGrid =
    stats.length > 0 ? (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(172px,100%),1fr))] gap-3">
        {stats.map((s) => {
          const missing = s.value === "-" || s.value === "n/a" || s.value === "";
          return (
            <div key={s.label} className="rounded-panel border border-line bg-canvas px-4 py-3.5">
              <span className="font-mono text-eyebrow text-dim uppercase">{s.label}</span>
              <div className={`mt-2.5 font-mono text-lead tabular-nums ${missing ? "text-dim" : "text-primary"}`}>{s.value}</div>
            </div>
          );
        })}
      </div>
    ) : null;
  const filingList =
    filingSources.length > 0 ? (
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-body">
        {filingSources.map((src) => (
          <li key={`${src.label}|${src.ref ?? ""}`} className="text-primary/85">
            {src.url ? (
              <a href={src.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                {src.label}
              </a>
            ) : (
              src.label
            )}
            {src.ref && !src.url && <span className="text-dim"> · {src.ref}</span>}
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div className="animate-page-in">
      <TickerHero
        symbol={data.symbol}
        name={name}
        typeBadge={assetTypeBadge(data.assetType)}
        chips={heroChips}
        priceLabel={money(data.price)}
        changePct={data.changePct}
        changeLabel={
          [
            changeAbs === null
              ? null
              : `${positive ? "+" : "-"}${money(Math.abs(changeAbs))} ${data.priceSource === "live" ? "today" : "on the last close"}`,
            weekChangePct === null ? null : `${weekChangePct >= 0 ? "+" : ""}${weekChangePct.toFixed(1)}% this week`,
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
        priceSource={data.priceSource}
        priceAsOf={data.priceAsOf}
        priceHint={priceHint}
        pricesIn={pricesIn}
        refreshRateSeconds={refreshRateSeconds}
        dayRange={dayRange}
        actions={
          <>
            <WatchButton symbol={data.symbol} watchlists={watchlists} />
            <AddHoldingButton symbol={data.symbol} assetType={data.assetType} />
          </>
        }
      />

      {/* The mock's segmented tab rail: one tray, the active tab lifted out of
          it on a ring rather than underlined. */}
      <div
        role="tablist"
        aria-label={`${data.symbol} sections`}
        className="animate-rise-in my-4.5 flex flex-wrap gap-1 rounded-card border border-line bg-panel p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ticker-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`ticker-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex-[1_1_120px] rounded-control px-3.5 py-2.5 text-body transition-[background-color,color,box-shadow] duration-base ease-standard ${
              tab === t.id
                ? "bg-active text-primary shadow-[inset_0_0_0_1px_var(--color-line),0_2px_10px_rgba(0,0,0,0.4)]"
                : "text-muted hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div role="tabpanel" id="ticker-panel-overview" aria-labelledby="ticker-tab-overview" className="flex flex-col gap-9">
          {/* feat/analysis-display-v2: the same AnalysisView as Research, the
              Assistant and the briefing. Today's scorecard, the price chart
              after the summary, and this page's news, filings and key stats
              in the breakdown; nothing that used to be here is removed. */}
          <AnalysisView
            display={display}
            sources={latest?.sources ?? []}
            closestCase={
              closestAnalog
                ? {
                    date: closestAnalog.event_date,
                    label: new Date(closestAnalog.event_date).toLocaleDateString(undefined, { month: "short", year: "numeric" }),
                    note: closestAnalog.note,
                  }
                : null
            }
            scorecard={summary.scorecard}
            forYou={
              summary.exposure
                ? exposureLines(name, summary.exposure, (usd) =>
                    // The reader's own money: rounded in their currency, without cents - "roughly €250".
                    formatRoughUserMoney(usd, prefs, roughMoney),
                  )
                : null
            }
            whatItDoes={summary.business ? { oneLiner: summary.business.oneLiner, content: <WhatItDoes profile={summary.business} /> } : undefined}
            companyNumbers={
              summary.companyLocked ? (
                <PremiumNote what="Premium shows the quarterly company table: sales, EBITDA (profit before interest, tax and write-downs), cash flow and debt, each linked to its SEC filing." />
              ) : (
                <CompanyNumbersTable rows={summary.companyNumbers} status={summary.companyStatus} />
              )
            }
            historyAction={<TickerAnalysisRequest symbol={data.symbol} />}
            extras={{
              sources: (
                <>
                  {filingList}
                  {newsPanel}
                </>
              ),
              trader:
                summary.plan === "premium" ? (
                  <>
                    {statsGrid}
                    {!isCrypto && !isForex && !isIndex && !data.fundamentals && (
                      <p className="m-0 text-caption text-dim">
                        No SEC fundamentals filed for this symbol (common for ETFs and funds) - cap, P/E, and yield stay blank rather than being estimated.
                      </p>
                    )}
                  </>
                ) : null,
            }}
            afterSummary={<TickerChart symbol={data.symbol} bars={data.bars} priceSource={data.priceSource} priceAsOf={data.priceAsOf} currency={data.currency} />}
          />

          <DiscussionPanel symbol={data.symbol} comments={discussion} canModerate={canModerate} />
        </div>
      )}

      {tab === "profile" && (
        <div
          role="tabpanel"
          id="ticker-panel-profile"
          aria-labelledby="ticker-tab-profile"
          // The mock sets the position card beside the profile. It only exists
          // when there is a holding, so the grid collapses to one column for
          // everyone else rather than leaving a gap where a card would be.
          className={
            heldQuantity ? "grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[1.35fr_1fr]" : undefined
          }
        >
          <ProfilePanel symbol={data.symbol} esg={data.esg} assetType={data.assetType} />
          {heldQuantity ? (
            <PositionCard
              symbol={data.symbol}
              quantity={heldQuantity}
              quantityLabel={formatQuantity(heldQuantity)}
              avgCostLabel={avgCost === null ? null : money(avgCost)}
              valueLabel={data.price === null ? "-" : userMoney(data.price * heldQuantity)}
              gain={
                data.price === null || avgCost === null || avgCost === 0
                  ? null
                  : {
                      pct: ((data.price - avgCost) / avgCost) * 100,
                      amountLabel: userMoney(Math.abs((data.price - avgCost) * heldQuantity)),
                    }
              }
            />
          ) : null}
        </div>
      )}

      {tab === "technicals" && (
        <div role="tabpanel" id="ticker-panel-technicals" aria-labelledby="ticker-tab-technicals">
          <TechnicalsPanel
            symbol={data.symbol}
            bars={data.bars}
            priceSource={data.priceSource}
            priceAsOf={data.priceAsOf}
            volatility30d={data.volatility30d}
            currency={data.currency}
          />
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
