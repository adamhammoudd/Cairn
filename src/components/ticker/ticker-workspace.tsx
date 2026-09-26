"use client";

import { useState } from "react";
import Link from "next/link";
import { assetTypeBadge, formatMarketCap, formatVolume } from "@/lib/screener";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";
import { formatSupply } from "@/lib/crypto";
import { formatQuantity } from "@/lib/portfolio";
import { assetName } from "@/lib/asset-names";
import { decodeEntities } from "@/lib/news";
import type { TickerData } from "@/lib/actions/ticker";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { TickerHero } from "@/components/ticker/ticker-hero";
import { TickerChart } from "@/components/ticker/ticker-chart";
import { TickerAnalysisRequest } from "@/components/ticker/ticker-analysis-request";
import { MethodologyCard } from "@/components/analysis/methodology-card";
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
import {
  AnalysisFooter,
  FullBreakdown,
  HistoryPanel,
  PlainWordsPanel,
  ScorecardGrid,
  useBreakdownState,
  type BreakdownRow,
} from "@/components/analysis/summary-sections";
import { CompanyNumbersTable } from "@/components/ticker/company-numbers-table";
import { isEstimatedEvent } from "@/lib/calendar";

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
  analysisDepth,
  heldQuantity,
  avgCost,
  watchlists,
  canModerate = false,
  refreshRateSeconds = null,
  summary,
}: TickerWorkspaceProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const breakdown = useBreakdownState();
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
  // Was hardcoded `currency: "USD"` - every price on this page (the headline
  // number, day/52w range, avg cost) rendered in USD regardless of Settings >
  // Display > Primary currency, while Markets/Screener/Portfolio/Comparison
  // all converted correctly through this same formatMoney() helper.
  const currency = (n: number | null) => formatMoney(n, prefs);
  const money = isForex ? rate : isIndex ? level : currency;
  const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "-" : `${money(lo)} – ${money(hi)}`);

  const fromExtreme = (extreme: number | null) =>
    data.price === null || extreme === null || extreme === 0 ? "-" : `${(((data.price - extreme) / extreme) * 100).toFixed(2)}%`;

  // The hero's position line: "You own 20 shares · €3,050" (feat/analysis-
  // summary-layout). The average cost stays on the Profile tab's position card.
  const unit = isCrypto ? data.symbol : heldQuantity === 1 ? "share" : "shares";
  const heroChips = heldQuantity
    ? [`You own ${formatQuantity(heldQuantity)} ${unit}${data.price === null ? "" : ` · ${money(data.price * heldQuantity)}`}`]
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
        { label: "Market cap", value: formatMarketCap(data.cryptoMetrics?.market_cap ?? null, prefs) },
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
            { label: "Market cap", value: formatMarketCap(marketCap, prefs) },
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
                <Link href="/news" className="tap text-micro text-accent hover:underline">
                  All news →
                </Link>
              </div>
              {data.news.length === 0 ? (
                <p className="px-4 py-4 text-body text-dim">No recent news ingested for {data.symbol}.</p>
              ) : (
                data.news.slice(0, 8).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 border-b border-line-soft px-4 py-3.5 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active"
                  >
                    {/* The mock colours this rail by story sentiment. Nothing
                        in the pipeline scores sentiment (news_items has the
                        column; no ingest writes it), so it stays neutral
                        rather than being coloured from a guess. */}
                    <span aria-hidden className="w-[3px] shrink-0 self-stretch rounded-xs bg-line" />
                    <div className="min-w-0">
                      {n.url ? (
                        <a
                          href={n.url}
                          target="_blank"
                          rel="noreferrer"
                          className="tap block text-body leading-[1.5] text-primary text-pretty hover:text-accent"
                        >
                          {decodeEntities(n.title)}
                        </a>
                      ) : (
                        <span className="block text-body leading-[1.5] text-primary text-pretty">
                          {decodeEntities(n.title)}
                        </span>
                      )}
                      <div className="mt-1.5 font-mono text-micro text-dim">
                        {n.source_name} · {new Date(n.published_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
  );
  const breakdownRows: BreakdownRow[] = [
    {
      id: "sources",
      title: "Sources",
      detail: `${data.news.length} articles, ${filingSources.filter((x) => x.kind === "sec_filing").length} company filings`,
      content: (
        <div className="flex flex-col gap-4">
          {filingSources.length > 0 && (
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
          )}
          {newsPanel}
        </div>
      ),
    },
    {
      id: "cases",
      title: summary.history && summary.history.status === "ok" ? `All ${summary.history.n} historical cases` : "Historical cases",
      detail: "dates, setup, what happened",
      content: (
        <div className="flex flex-col gap-3.5">
          <TickerAnalysisRequest symbol={data.symbol} />
          {analyses.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-10 text-center text-lead text-muted">
              No Cairn analysis for {data.symbol} yet. Request one above - every answer shows its sources, historical analogs, and
              confidence.
            </div>
          ) : (
            analyses.map((a) => <MethodologyCard key={a.id} analysis={a} depth={analysisDepth} />)
          )}
        </div>
      ),
    },
    {
      id: "company",
      title: "Company numbers",
      detail: "sales, EBITDA, cash flow, debt, dividend history",
      content: <CompanyNumbersTable rows={summary.companyNumbers} status={summary.companyStatus} />,
    },
    {
      id: "trader",
      title: "Trader indicators",
      detail: "RSI, volatility, drawdown, 10-day move probabilities",
      content: (
        <div className="flex flex-col gap-3.5">
          {latest && (
            <p className="m-0 text-body text-primary/85">
              Chance of a move of 5% or more (either way) within 10 sessions:{" "}
              <span className="font-mono tabular-nums">
                {latest.probability_low}–{latest.probability_high}%
              </span>{" "}
              ({latest.confidence_level} confidence, {latest.sample_size} past cases). RSI, drawdown and the other readings are on the
              Technicals tab and in the case list above.
            </p>
          )}
          {stats.length > 0 && (
            <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(172px,1fr))] gap-3">
              {stats.map((s, i) => {
                // The mock's status dot. It only ever distinguishes "this
                // figure is here" from "this figure is missing", plus the one
                // volatility reading the design calls out in amber - it is not
                // a gain/loss signal, so the accent pair stays out of it.
                const missing = s.value === "-" || s.value === "n/a" || s.value === "";
                const warn = !missing && s.label.startsWith("Volatility");
                return (
                  <div
                    key={s.label}
                    className="animate-rise-in rounded-panel border border-line bg-panel px-4 py-3.5 transition-[border-color,background-color,transform] duration-base ease-standard hover:-translate-y-[3px] hover:border-line-strong hover:bg-active"
                    style={{ animationDelay: `${60 + i * 40}ms` }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                          missing ? "bg-line" : warn ? "bg-warning" : "bg-line-strong"
                        }`}
                      />
                      <span className="font-mono text-eyebrow text-dim uppercase">{s.label}</span>
                    </div>
                    <div
                      className={`mt-2.5 font-mono text-lead tabular-nums ${
                        missing ? "text-dim" : warn ? "text-warning" : "text-primary"
                      }`}
                    >
                      {s.value}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isCrypto && !isForex && !isIndex && !data.fundamentals && (
            <p className="mb-4 text-caption text-dim">
              No SEC fundamentals filed for this symbol (common for ETFs and funds) - cap, P/E, and yield stay blank
              rather than being estimated.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "how",
      title: "How this was calculated",
      content: (
        <div className="flex max-w-[76ch] flex-col gap-3 text-body leading-[1.65] text-primary/80">
          <p className="m-0">
            <strong className="font-medium text-primary">Scorecard.</strong> Each tile is computed in code from the company&apos;s SEC filings
            and stored daily prices, using fixed, published thresholds. No AI model sets a level or writes a number. Crypto and funds have
            no company filings, so their company tiles say &quot;not applicable&quot; rather than zero.
          </p>
          <p className="m-0">
            <strong className="font-medium text-primary">What history says.</strong> Cairn scans this symbol&apos;s own price history for
            past days in the same state as today, and counts how often the price was higher 10 trading days later. The range is a 95%
            Wilson interval, which widens when there are few cases. It describes the past; it is not a forecast.
          </p>
          <p className="m-0">
            <strong className="font-medium text-primary">In plain words.</strong> An AI model rewrites the scorecard and history in plain
            English. Before it is shown, code checks that every number in it appears in the figures above, that it gives no advice, and
            that any finance term is explained. If any check fails, the summary is built from the scorecard&apos;s own sentences instead.
          </p>
        </div>
      ),
    },
  ];

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
          {/* feat/analysis-summary-layout: the plain summary, scorecard and
              history lead; everything that used to be on this tab is in the
              Full breakdown below, collapsed, nothing removed. */}
          <PlainWordsPanel
            headline={summary.summary.headline}
            bullets={summary.summary.bullets}
            meta={
              summary.summary.fromAnalysis && summary.summary.writtenAt
                ? `Written ${new Date(summary.summary.writtenAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} from that day's scorecard${
                    summary.summary.source === "template" ? ", in Cairn's own words" : ""
                  }. Every number comes from the figures below.`
                : "Built from today's scorecard below, in Cairn's own words. Every number comes from the figures below."
            }
            forYou={
              summary.exposure
                ? exposureLines(name, summary.exposure, (usd) =>
                    // Rounded in the reader's currency, and shown without cents: "roughly €250".
                    roughMoney(usd * prefs.fxRate).toLocaleString(undefined, { style: "currency", currency: prefs.effectiveCurrency, maximumFractionDigits: 0 }),
                  )
                : null
            }
          />

          {/* The price chart stays on the page, not in the collapsed breakdown. */}
          <TickerChart symbol={data.symbol} bars={data.bars} priceSource={data.priceSource} priceAsOf={data.priceAsOf} />

          <ScorecardGrid scorecard={summary.scorecard} />

          <HistoryPanel
            history={summary.history}
            onShowCases={analyses.length > 0 ? () => breakdown.openAndScroll("cases") : undefined}
            empty={
              <div className="flex flex-col gap-3.5">
                <p className="m-0 text-body text-muted">
                  No analysis of {data.symbol} yet. An analysis looks for the past moments it looked like this and counts what followed.
                </p>
                <TickerAnalysisRequest symbol={data.symbol} />
              </div>
            }
          />

          <FullBreakdown openId={breakdown.openId} onToggle={breakdown.toggle} rows={breakdownRows} />

          <DiscussionPanel symbol={data.symbol} comments={discussion} canModerate={canModerate} />

          <AnalysisFooter />
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
              valueLabel={data.price === null ? "-" : money(data.price * heldQuantity)}
              gain={
                data.price === null || avgCost === null || avgCost === 0
                  ? null
                  : {
                      pct: ((data.price - avgCost) / avgCost) * 100,
                      amountLabel: money(Math.abs((data.price - avgCost) * heldQuantity)),
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
