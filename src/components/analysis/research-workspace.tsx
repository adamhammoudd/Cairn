"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toggleAnalysisPin } from "@/lib/actions/analysis";
import { useRouter } from "next/navigation";
import { runAnalysisGeneration, type AnalysisWithMethodology } from "@/lib/actions/analysis";
import { eventTypeLabel } from "@/lib/analysis";
import { searchSymbols, type SymbolSearchResult } from "@/lib/actions/symbols";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { decodeEntities } from "@/lib/news";
import { Disclosure } from "@/components/compliance/disclosure";
import {
  EmptyPanel,
  GeneratingPanel,
  NeedsPickPanel,
  QuotaReachedPanel,
  UnavailablePanel,
} from "@/components/analysis/research-states";
import { TIER_LIMITS } from "@/lib/billing";
import type { ScopeType } from "@/lib/supabase/types";

// The Research library, from "Research Library.dc.html" in the Base Camp Page
// Redesign project: a hero for the open analysis beside the library's own
// numbers, tabs and a search over what is saved, and a card per analysis.
//
// The design's entries are saved Assistant answers with a question, a topic and
// a revisit count. What Cairn actually stores here is a probability analysis
// (scope, finding, range, confidence, sources, analogs), so each card shows
// those - the finding stands in for the question, the scope for the topic - and
// nothing is invented to fill a slot the data does not have. Generation, plan
// gating and pinning are unchanged; MethodologyCard remains the one place the
// full sources and analogs render.

const CONF_STYLE: Record<string, { label: string; tint: string; bars: number }> = {
  high: { label: "High confidence", tint: "var(--color-accent)", bars: 3 },
  medium: { label: "Medium confidence", tint: "var(--color-warning)", bars: 2 },
  low: { label: "Low confidence", tint: "var(--color-muted)", bars: 1 },
};
const MONO_LABEL = "font-mono text-eyebrow text-dim uppercase";

const SCOPE_TAG_COLOR: Record<ScopeType, string> = {
  ticker: "var(--color-accent)",
  sector: "var(--color-info)",
  market: "var(--color-violet)",
};

interface Scope {
  type: ScopeType;
  label: string;
  sub: string;
}

interface Suggestion extends Scope {
  kind: string;
}

function whenLabel(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  if (minutes < 60 * 24 * 7) {
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type LibraryTab = "all" | "pinned" | "holdings" | "tickers" | "macro";

/** The topic pill on a card. A ticker the reader holds reads "Holdings". */
function topicFor(a: AnalysisWithMethodology, held: Set<string>): { label: string; className: string } {
  if (a.scope_type === "ticker" && held.has(a.scope_value)) {
    return { label: "Holdings", className: "border-accent/35 bg-accent/10 text-accent" };
  }
  if (a.scope_type === "ticker") return { label: "Ticker", className: "border-violet/35 bg-violet/10 text-violet" };
  if (a.scope_type === "sector") return { label: "Sector", className: "border-info/35 bg-info/10 text-info" };
  return { label: "Macro", className: "border-warning/35 bg-warning/10 text-warning" };
}

interface ResearchWorkspaceProps {
  analyses: AnalysisWithMethodology[];
  /** Symbols the user actually holds - drives the "Relevant to your portfolio" row. */
  heldSymbols: string[];
  /** Distinct sectors present in the fundamentals table, for scope suggestions. */
  sectors: string[];
  planLabel: string;
  usage: { used: number; limit: number; unlimited: boolean };
  /** e.g. "1 September" - when the monthly allowance rolls over. */
  resetLabel: string;
  /** Analysis ids this user has pinned. Per-user, from ai_analysis_pins. */
  pinnedIds?: string[];
}

export function ResearchWorkspace({
  analyses,
  heldSymbols,
  sectors,
  planLabel,
  usage,
  resetLabel,
  pinnedIds = [],
}: ResearchWorkspaceProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, startPin] = useTransition();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope | null>(null);
  // Keyed by the query it was fetched for, so a stale result from a previous
  // keystroke is simply not rendered - no clearing setState in the effect.
  const [suggest, setSuggest] = useState<{ q: string; items: Suggestion[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(analyses[0]?.id ?? null);
  const [tab, setTab] = useState<LibraryTab>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  // The scope picker stays out of the way until asked for, unless a run is in
  // flight or the library is empty and generating is the only thing to do.
  const [showComposer, setShowComposer] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  // Optimistic: the star flips on click and the server action reconciles.
  // A pin is a one-bit preference - waiting on a round trip to redraw it
  // makes the control feel broken.
  const [pins, setPins] = useState<Set<string>>(() => new Set(pinnedIds));
  const [pinError, setPinError] = useState<string | null>(null);
  const [sort, setSort] = useState<"date" | "confidence">("date");
  const [phase, setPhase] = useState<"idle" | "generating" | "unavailable" | "quota">("idle");
  const [error, setError] = useState<string | null>(null);

  const held = new Set(heldSymbols);
  // Admins have no cap; the quota chip shows the count for reference only.
  const atCap = !usage.unlimited && usage.used >= usage.limit;
  const nearCap = !usage.unlimited && usage.used === usage.limit - 1;
  const isFreePlan = planLabel !== TIER_LIMITS.premium.label;

  // Type-ahead. Tickers come from the same searchSymbols action "Add holding"
  // uses, so a scope is only offerable if it is a real tracked instrument;
  // sectors and market-wide are matched locally against what actually exists.
  const seq = useRef(0);
  const scopeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      let symbols: SymbolSearchResult[] = [];
      try {
        symbols = await searchSymbols(q);
      } catch {
        symbols = [];
      }
      if (seq.current !== mine) return;

      const lower = q.toLowerCase();
      const out: Suggestion[] = symbols.map((s) => ({
        kind: "Ticker",
        type: "ticker",
        label: s.symbol,
        sub: s.name ?? s.assetType.toUpperCase(),
      }));
      sectors
        .filter((sec) => sec.toLowerCase().includes(lower))
        .forEach((sec) => out.push({ kind: "Sector", type: "sector", label: sec, sub: "Sector-level analysis" }));
      if ("market-wide".includes(lower) || "market".includes(lower)) {
        out.push({
          kind: "Market",
          type: "market",
          label: "Market-wide",
          sub: "Breadth, dispersion, and regime",
        });
      }
      setSuggest({ q, items: out.slice(0, 6) });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, sectors]);

  function generate() {
    // The mock always shows a "Generate analysis" button in the empty states.
    // With no scope picked there is nothing to generate, so send the reader to
    // the thing they have to fill in rather than leaving a dead control.
    if (!scope) {
      scopeInput.current?.focus();
      return;
    }
    // At cap, explain rather than doing nothing. The button reads as
    // unavailable but still responds, so the quota-reached panel (with its
    // reset date and upgrade CTA) is actually reachable - a silently inert
    // control would leave the reader with no explanation at all.
    if (atCap) {
      setPhase("quota");
      return;
    }
    if (pending) return;
    setError(null);
    setPhase("generating");
    startTransition(async () => {
      const outcome = await runAnalysisGeneration(scope.type, scope.label);
      if (outcome.ok) {
        setOpenId(outcome.analysisId);
        setPhase("idle");
        router.refresh();
        return;
      }
      if (outcome.kind === "quota") setPhase("quota");
      else if (outcome.kind === "unavailable") setPhase("unavailable");
      else {
        setPhase("idle");
        setError(outcome.message);
      }
    });
  }

  function togglePin(id: string) {
    const next = new Set(pins);
    const pinning = !next.has(id);
    if (pinning) next.add(id);
    else next.delete(id);
    setPins(next);
    setPinError(null);
    startPin(async () => {
      const err = await toggleAnalysisPin(id, pinning);
      if (err) {
        // Put the star back where it was rather than leaving the row
        // claiming a state the server rejected.
        setPins((current) => {
          const reverted = new Set(current);
          if (pinning) reverted.delete(id);
          else reverted.add(id);
          return reverted;
        });
        setPinError(err);
      }
    });
  }

  const open = analyses.find((a) => a.id === openId) ?? null;
  const generateEnabled = !!scope && !atCap && !pending;

  // Only show a dropdown whose result matches what is currently typed.
  const suggestions = suggest && suggest.q === query.trim() ? suggest.items : null;

  const q = search.trim().toLowerCase();
  const entries = analyses
    .filter((a) => {
      if (tab === "pinned") return pins.has(a.id);
      if (tab === "holdings") return a.scope_type === "ticker" && held.has(a.scope_value);
      if (tab === "tickers") return a.scope_type === "ticker";
      if (tab === "macro") return a.scope_type !== "ticker";
      return true;
    })
    .filter((a) => !q || `${a.scope_value} ${a.scope_type} ${a.analysis_type} ${a.reasoning_text}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) =>
      sort === "confidence" ? (CONF_STYLE[b.confidence_level]?.bars ?? 0) - (CONF_STYLE[a.confidence_level]?.bars ?? 0) : 0,
    );

  const counts: Record<LibraryTab, number> = {
    all: analyses.length,
    pinned: analyses.filter((a) => pins.has(a.id)).length,
    holdings: analyses.filter((a) => a.scope_type === "ticker" && held.has(a.scope_value)).length,
    tickers: analyses.filter((a) => a.scope_type === "ticker").length,
    macro: analyses.filter((a) => a.scope_type !== "ticker").length,
  };
  const TABS: { key: LibraryTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pinned", label: "Pinned" },
    { key: "holdings", label: "Holdings" },
    { key: "tickers", label: "Tickers" },
    { key: "macro", label: "Sectors & market" },
  ];

  const oldest = analyses.reduce<string | null>((o, a) => (!o || a.created_at < o ? a.created_at : o), null);
  const sourcesCited = analyses.reduce((n, a) => n + a.sources.length, 0);
  const STATS: { label: string; value: string; className: string }[] = [
    { label: "Saved analyses", value: String(analyses.length), className: "text-primary" },
    { label: "Pinned", value: String(counts.pinned), className: "text-violet" },
    { label: "Sources cited", value: String(sourcesCited), className: "text-info" },
    {
      label: "Oldest entry",
      value: oldest ? new Date(oldest).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "-",
      className: "text-muted",
    },
  ];

  const composerOpen = showComposer || phase !== "idle" || analyses.length === 0;

  return (
    <div className="animate-page-in mx-auto max-w-[1240px]">
      <div className="flex flex-wrap items-end justify-between gap-[18px]">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Assistant · Research library</div>
          <h1 className="m-0 mt-2 font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            Research library
          </h1>
          <p className="mt-2 max-w-[540px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Every analysis Cairn has run for you, kept with its sources. Pin the ones that held up; the rest stay
            searchable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-[3px] rounded-[10px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
            {(
              [
                ["list", "List"],
                ["grid", "Grid"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-[7px] px-3 py-1.5 text-[11.5px] transition-colors duration-base ease-standard ${
                  view === key ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowComposer((v) => !v);
              setTimeout(() => scopeInput.current?.focus(), 0);
            }}
            className="rounded-[9px] bg-accent px-4 py-[9px] text-[12.5px] font-bold text-canvas transition-[background,transform] duration-base ease-standard hover:-translate-y-px hover:bg-accent-light"
          >
            {showComposer && analyses.length > 0 ? "Close" : "New analysis"}
          </button>
        </div>
      </div>

      {/* The composer takes `relative z-10` so the scope typeahead can overhang
          what follows it. The section below is `animate-rise-in relative`, and
          that animation leaves a transform on it, which makes it a stacking
          context; being positioned and later in the DOM, it painted OVER this
          panel and sliced the suggestion list off at its own top edge. The
          dropdown's z-20 could not win that, because it only ranks inside this
          panel's context (animate-menu-in gives this one a transform too), so
          it is the panel that has to be ranked. z-10 and no higher: the sticky
          top nav is z-30 and must keep covering the list as the page scrolls. */}
      {composerOpen && (
        <div className="animate-menu-in relative z-10 mt-5 rounded-2xl border border-[#232323] bg-panel px-[22px] py-5">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
            <div className={MONO_LABEL}>What should Cairn research?</div>
            <div className="text-caption tabular-nums text-dim">
              {usage.unlimited ? `${usage.used} used this month · no cap` : `${usage.used} of ${usage.limit} used this month`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[260px] flex-1">
              {scope ? (
                <div className="flex items-center gap-2.5 rounded-panel border border-[rgba(47,198,133,0.4)] bg-canvas px-3 py-3">
                  <span
                    className="shrink-0 rounded-full border border-line px-2 py-1 font-mono text-eyebrow uppercase"
                    style={{ color: SCOPE_TAG_COLOR[scope.type] }}
                  >
                    {scope.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-lead text-primary">{scope.label}</div>
                    <div className="mt-0.5 truncate text-micro text-muted">{scope.sub}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Clear scope"
                    onClick={() => {
                      setScope(null);
                      setQuery("");
                      setPhase("idle");
                    }}
                    className="h-6.5 w-6.5 shrink-0 rounded-control bg-transparent text-title text-muted hover:bg-active hover:text-primary"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-panel border border-line bg-canvas px-3 py-3 transition-[border-color] duration-[160ms] ease-standard focus-within:border-accent">
                    <span aria-hidden className="text-caption text-dim">
                      ⌕
                    </span>
                    <input
                      ref={scopeInput}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="A ticker, a sector, or “market-wide”"
                      aria-label="Analysis scope"
                      className="min-w-0 flex-1 border-0 bg-transparent text-lead text-primary outline-none"
                    />
                  </div>

                  {suggestions && suggestions.length > 0 && (
                    <div className="animate-menu-in absolute top-[calc(100%+6px)] right-0 left-0 z-20 max-h-[250px] overflow-y-auto rounded-panel border border-line bg-panel p-1 shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
                      {suggestions.map((sg) => (
                        <button
                          key={`${sg.type}:${sg.label}`}
                          type="button"
                          onClick={() => {
                            setScope({ type: sg.type, label: sg.label, sub: sg.sub });
                            setQuery("");
                            setPhase("idle");
                          }}
                          className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-[background] duration-[120ms] ease-standard hover:bg-active"
                        >
                          <span
                            className="shrink-0 rounded-full border border-line px-2 py-0.5 font-mono text-eyebrow uppercase"
                            style={{ color: SCOPE_TAG_COLOR[sg.type] }}
                          >
                            {sg.kind}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-body text-primary">{sg.label}</span>
                            <span className="mt-0.5 block truncate text-micro text-muted">{sg.sub}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {suggestions && suggestions.length === 0 && (
                    <div className="absolute top-[calc(100%+6px)] right-0 left-0 z-20 rounded-panel border border-line bg-panel px-3 py-3.5 text-center text-caption text-dim">
                      Nothing matches “{query}”. Try a ticker symbol, a sector name, or “market-wide”.
                    </div>
                  )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={generate}
              aria-disabled={!generateEnabled}
              className={`rounded-panel px-5 py-3 text-body font-semibold whitespace-nowrap transition-[box-shadow,transform] duration-[180ms] ease-standard ${
                generateEnabled
                  ? "bg-gradient-to-br from-accent-light to-accent-dark text-canvas hover:-translate-y-px hover:shadow-[0_0_24px_rgba(47,198,133,0.28)]"
                  : "cursor-not-allowed bg-active text-dim"
              }`}
            >
              {atCap ? "Monthly limit reached" : pending ? "Generating…" : "Generate analysis"}
            </button>
          </div>
          {error && <p className="mt-2.5 text-body text-warning">{error}</p>}
          {(atCap || nearCap) && (
            <div className="mt-3 text-caption leading-[1.55] text-muted text-pretty">
              {/* Both tiers have a monthly analysis cap - Premium raises it
                  (5 -> 100), it does not remove it. Only chat is unlimited on
                  Premium. */}
              {isFreePlan
                ? atCap
                  ? `You've used all ${usage.limit} analyses on the Free plan this month. Premium raises the cap to ${TIER_LIMITS.premium.monthlyAiAnalyses} a month with full methodology detail. They reset on ${resetLabel}. `
                  : `One analysis left this month on the Free plan. Premium raises the cap to ${TIER_LIMITS.premium.monthlyAiAnalyses} a month and adds full methodology detail. `
                : atCap
                  ? `You've used all ${usage.limit} Premium analyses this month. They reset on ${resetLabel}.`
                  : `One analysis left this month on the Premium plan. It resets on ${resetLabel}.`}
              {isFreePlan && (
                <a href="/billing" className="text-accent-light hover:underline">
                  Upgrade to Premium
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* The library lists bare finding text and confidence in every state,
          before any methodology card has rendered, so the disclosure lives at
          page level - the only placement that covers every state. */}
      <div className="mt-3.5">
        <Disclosure variant="callout" />
      </div>

      {/* Hero: the open analysis, condensed, beside the library's own numbers. */}
      <section
        className="animate-rise-in relative mt-3.5 overflow-hidden rounded-card border border-[#232323] bg-gradient-to-b from-[#111012] to-[#0d0d0d] px-6 py-5.5"
        style={{ animationDelay: "60ms" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: "-60% 56% 45% -14%",
            background: "radial-gradient(closest-side, rgba(155,140,224,.16), transparent)",
            animation: "cn-glow 7s ease-in-out infinite",
          }}
        />
        <div className="relative flex flex-wrap gap-6.5">
          <div className="min-w-0 flex-[2_1_380px]">
            {phase === "generating" ? (
              <GeneratingPanel scopeLabel={scope?.label} />
            ) : phase === "unavailable" ? (
              <UnavailablePanel
                onBroaden={() => {
                  setScope(null);
                  setQuery("");
                  setPhase("idle");
                }}
                onAskAssistant={() => router.push("/assistant")}
              />
            ) : phase === "quota" ? (
              <QuotaReachedPanel
                used={usage.used}
                limit={usage.limit}
                planLabel={planLabel}
                resetLabel={resetLabel}
                onBrowseLibrary={() => setPhase("idle")}
              />
            ) : open ? (
              <FeaturedAnalysis
                analysis={open}
                pinned={pins.has(open.id)}
                held={open.scope_type === "ticker" && held.has(open.scope_value)}
                methodOpen={showMethod}
                onToggleMethod={() => setShowMethod((v) => !v)}
              />
            ) : analyses.length === 0 ? (
              <EmptyPanel onGenerate={generate} />
            ) : (
              <NeedsPickPanel onGenerate={generate} />
            )}
          </div>
          <div className="flex min-w-0 flex-[1_1_250px] flex-col gap-[9px]">
            <div className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">Library at a glance</div>
            {STATS.map((s) => (
              <span
                key={s.label}
                className="flex items-baseline justify-between gap-2.5 border-b border-[#1a1a1a] py-[9px] text-[12.5px]"
              >
                <span className="text-muted">{s.label}</span>
                <span className={`font-mono text-[13px] ${s.className}`}>{s.value}</span>
              </span>
            ))}
            {!usage.unlimited && (
              <div className="mt-1">
                <div className="flex items-baseline justify-between text-caption text-dim">
                  <span>This month</span>
                  <span className={`tabular-nums ${atCap ? "text-warning" : ""}`}>
                    {usage.used} of {usage.limit}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-xs bg-active">
                  <div
                    className={`h-full rounded-xs transition-[width] duration-[340ms] ease-standard ${
                      atCap ? "bg-warning" : "bg-gradient-to-r from-accent-light to-accent-dark"
                    }`}
                    style={{ width: `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {showMethod && open && phase === "idle" && (
        <div className="mt-3.5">
          <MethodologyCard analysis={open} />
        </div>
      )}

      <div className="animate-rise-in mt-3.5 flex flex-wrap items-center gap-2.5" style={{ animationDelay: "120ms" }}>
        <div className="flex flex-wrap gap-[3px] rounded-[11px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                  on ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-[5px] px-[5px] py-px font-mono text-eyebrow ${
                    on ? "bg-accent/15 text-accent-light" : "bg-[#161616] text-dim"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>
        <label className="flex min-w-0 flex-[1_1_220px] items-center gap-2 rounded-[11px] border border-line bg-panel px-[13px] py-[9px] pointer-coarse:min-h-11 transition-colors duration-base ease-standard hover:border-line-strong">
          <span aria-hidden className="text-[13px] text-dim">
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your saved analyses"
            aria-label="Search your saved analyses"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-primary outline-none placeholder:text-dim"
          />
        </label>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-eyebrow text-dim uppercase">Sort</span>
          {(
            [
              ["date", "Newest"],
              ["confidence", "Confidence"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              className={`rounded-control px-2 py-1 text-micro transition-colors duration-fast ease-standard hover:text-primary ${
                sort === value ? "bg-active text-primary" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {pinError && (
        <p role="alert" className="mt-2.5 text-caption text-warning">
          {pinError}
        </p>
      )}

      <div
        className={
          view === "grid"
            ? "mt-3 grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-2.5"
            : "mt-3 flex flex-col gap-2.5"
        }
      >
        {entries.map((a, i) => {
          const c = CONF_STYLE[a.confidence_level] ?? CONF_STYLE.low;
          const t = topicFor(a, held);
          const pinned = pins.has(a.id);
          const isOpen = a.id === openId;
          // The headline and the history line, never a probability (docs/decisions/2026-09-27-analysis-rebuild.md).
          const finding = a.display.headline;
          const body = a.display.history.line;
          return (
            <div
              key={a.id}
              className={`animate-rise-in relative flex gap-[15px] overflow-hidden rounded-[14px] border bg-panel transition-[transform,border-color,background] duration-200 ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:bg-[#121212] ${
                isOpen ? "border-violet/45" : pinned ? "border-violet/25" : "border-[#232323]"
              }`}
              style={{ animationDelay: `${120 + i * 50}ms` }}
            >
              <span aria-hidden className="w-[3px] shrink-0 self-stretch" style={{ background: c.tint }} />
              <button
                type="button"
                onClick={() => {
                  setOpenId(a.id);
                  setPhase("idle");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label={`Open the ${a.scope_value} analysis`}
                className="flex min-w-0 flex-1 flex-col items-start gap-2.5 py-4 pr-12 text-left"
              >
                <span className="flex flex-wrap items-center gap-[9px]">
                  <span
                    className={`rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.12em] uppercase ${t.className}`}
                  >
                    {t.label}
                  </span>
                  <span
                    className="rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.1em] uppercase"
                    style={{ borderColor: `${c.tint}44`, background: `${c.tint}14`, color: c.tint }}
                  >
                    {c.label}
                  </span>
                </span>
                <span className="font-serif text-[19px] leading-[1.38] text-primary text-pretty">{finding}</span>
                {body && (
                  <span className="line-clamp-3 text-[12.5px] leading-[1.65] text-muted text-pretty">{body}</span>
                )}
                <span
                  className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-dim"
                  suppressHydrationWarning
                >
                  <span>{whenLabel(a.created_at)}</span>
                  <span className="text-[#3a3a3a]">·</span>
                  <span>
                    {a.sources.length} {a.sources.length === 1 ? "source" : "sources"}
                  </span>
                </span>
                <span className="flex flex-wrap gap-[7px]">
                  {[a.scope_value, a.analysis_type.replace(/_/g, " ")].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line bg-[#0c0c0c] px-2.5 py-[3px] font-mono text-[10px] tracking-[0.08em] text-[#9a9a9a]"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </button>
              {/* Sibling, not a child: the card body is itself a button, and a
                  nested one is invalid HTML. Violet rather than the accent
                  because a pin says nothing about the analysis's direction
                  or confidence - green here would read as a verdict. */}
              <button
                type="button"
                onClick={() => togglePin(a.id)}
                aria-pressed={pinned}
                aria-label={pinned ? `Unpin the ${a.scope_value} analysis` : `Pin the ${a.scope_value} analysis`}
                title={pinned ? "Unpin" : "Pin"}
                className={`absolute top-3.5 right-3 flex h-7 w-7 items-center justify-center rounded-control text-[15px] leading-none transition-colors duration-fast ease-standard hover:bg-active ${
                  pinned ? "text-violet" : "text-dim hover:text-muted"
                }`}
              >
                <span aria-hidden>{pinned ? "★" : "☆"}</span>
              </button>
            </div>
          );
        })}
      </div>

      {analyses.length > 0 && entries.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-line px-5 py-14 text-center text-body text-dim">
          {tab === "pinned" && !q
            ? "Nothing pinned yet. Star an analysis to keep it here."
            : q
              ? `Nothing saved matches “${search.trim()}”.`
              : "Nothing in this view yet."}
        </div>
      )}

      <p className="mt-5.5 text-center text-caption text-dim">
        Saved analyses reflect the data available when they were generated. Nothing here is a recommendation.
      </p>
    </div>
  );
}

// The condensed hero for the open analysis: the finding, how sure Cairn is, the
// range it estimated, and the strongest source and analog behind it. The full
// methodology stays one click away rather than hidden - the compliance
// requirement is that sources and analogs are shown, not pre-expanded.
function FeaturedAnalysis({
  analysis: a,
  pinned,
  held,
  methodOpen,
  onToggleMethod,
}: {
  analysis: AnalysisWithMethodology;
  pinned: boolean;
  held: boolean;
  methodOpen: boolean;
  onToggleMethod: () => void;
}) {
  const c = CONF_STYLE[a.confidence_level] ?? CONF_STYLE.low;
  const finding = a.display.headline;
  const h = a.display.history;
  const topSource = a.sources[0];
  const topAnalog = a.analogs[0];
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="animate-breathe h-1.5 w-1.5 rounded-full bg-accent-light" />
        <span className="font-mono text-[9.5px] tracking-[0.16em] text-accent-light uppercase">Cairn analysis</span>
      </div>
      <div
        className="mt-[11px] flex flex-wrap items-center gap-2.5 font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase"
        suppressHydrationWarning
      >
        <span>
          {held ? "Holdings" : a.scope_type} · {a.scope_value} · {whenLabel(a.created_at)}
        </span>
        {pinned && <span className="text-violet">Pinned</span>}
      </div>
      <p className="mt-3 max-w-[600px] font-serif text-[19px] leading-[1.45] text-primary text-pretty">{finding}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-y border-[#1a1a1a] py-3.5">
        <span
          className="flex items-center gap-[7px] rounded-lg border px-[11px] py-1.5 text-[11.5px]"
          style={{ borderColor: `${c.tint}55`, background: `${c.tint}14`, color: c.tint }}
        >
          <span aria-hidden className="animate-breathe h-[5px] w-[5px] rounded-full" style={{ background: c.tint }} />
          {c.label}
        </span>
        <div className="min-w-[150px] flex-[1_1_220px]">
          <div className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">What history says</div>
          <p className="mt-1.5 text-[14px] leading-[1.5] text-primary text-pretty">{h.line}</p>
          {h.range && <p className="mt-1 text-[12.5px] leading-[1.5] text-muted text-pretty">{h.range}</p>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(228px,1fr))] gap-3">
        <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] transition-colors duration-base ease-standard hover:border-[#2f2f2f]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[#1a1a1a] px-[13px] py-2.5">
            <span className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">Sources · {a.sources.length}</span>
            <button type="button" onClick={onToggleMethod} className="text-[11px] text-accent-light hover:underline">
              {methodOpen ? "Hide" : "View all"}
            </button>
          </div>
          <div className="px-[13px] py-[11px]">
            {topSource ? (
              <>
                <div className="text-[12px] leading-[1.5] text-pretty">{decodeEntities(topSource.title)}</div>
                <div className="mt-2 flex items-center justify-between gap-2.5 font-mono text-[10px] text-dim">
                  <span>{topSource.source_name}</span>
                  <span suppressHydrationWarning>{whenLabel(topSource.published_at)}</span>
                </div>
              </>
            ) : (
              <div className="text-[12px] text-dim">No sources were attached to this run.</div>
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] transition-colors duration-base ease-standard hover:border-[#2f2f2f]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[#1a1a1a] px-[13px] py-2.5">
            <span className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">Similar moments</span>
            <span className="font-mono text-[9px] tracking-[0.1em] text-dim">{a.display.caseCount} counted</span>
          </div>
          <div className="px-[13px] py-[11px]">
            {topAnalog ? (
              <>
                <div className="flex items-baseline justify-between gap-2.5">
                  <span className="text-[12px]">
                    <strong className="font-mono font-medium">{topAnalog.symbol ?? topAnalog.sector ?? "Market"}</strong> ·{" "}
                    {eventTypeLabel(topAnalog.event_type)}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted">{Math.round(topAnalog.similarity_score * 100)}%</span>
                </div>
                <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-[#1c1c1c]">
                  <div
                    className="animate-grow-x h-full origin-left rounded-full bg-gradient-to-r from-accent to-accent-light"
                    style={{ width: `${Math.round(topAnalog.similarity_score * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <div className="text-[12px] text-dim">No close historical analog on record.</div>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleMethod}
        className="mt-3.5 text-caption text-muted transition-colors duration-fast ease-standard hover:text-primary"
      >
        {methodOpen ? "Hide the full analysis ↑" : "Read the full analysis ↓"}
      </button>
    </div>
  );
}
