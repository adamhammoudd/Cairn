"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toggleAnalysisPin } from "@/lib/actions/analysis";
import { useRouter } from "next/navigation";
import { runAnalysisGeneration, type AnalysisWithMethodology } from "@/lib/actions/analysis";
import { searchSymbols, type SymbolSearchResult } from "@/lib/actions/symbols";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import {
  EmptyPanel,
  GeneratingPanel,
  NeedsPickPanel,
  QuotaReachedPanel,
  UnavailablePanel,
} from "@/components/analysis/research-states";
import { TIER_LIMITS } from "@/lib/billing";
import type { CalendarEvent } from "@/lib/calendar";
import type { ScopeType } from "@/lib/supabase/types";

// The whole Research artboard from Context/mockups/Cairn.dc.html, minus the
// mock's own STATE/TIER chip row - that row is a design-time switcher, not
// product surface. Every state it toggles is reachable here from real data:
// empty when nothing is stored, generating while a run is in flight,
// unavailable/quota-reached from what the generation pipeline returns, and
// Free vs Premium depth from getUserPlan().

const CONF_STYLE: Record<string, { label: string; tint: string; bars: number }> = {
  high: { label: "High confidence", tint: "var(--color-accent)", bars: 3 },
  medium: { label: "Medium confidence", tint: "var(--color-warning)", bars: 2 },
  low: { label: "Low confidence", tint: "var(--color-muted)", bars: 1 },
};
const OFF_BAR = "var(--color-line)";

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

function ConfidenceBars({ level }: { level: string }) {
  const c = CONF_STYLE[level] ?? CONF_STYLE.low;
  return (
    <div aria-hidden className="flex shrink-0 items-end gap-0.5">
      {[7, 10, 13].map((h, i) => (
        <span
          key={h}
          className="w-1 rounded-xs"
          style={{ height: h, background: c.bars >= i + 1 ? c.tint : OFF_BAR }}
        />
      ))}
    </div>
  );
}

interface ResearchWorkspaceProps {
  analyses: AnalysisWithMethodology[];
  eventsByScope: Record<string, CalendarEvent[]>;
  /** Symbols the user actually holds - drives the "Relevant to your portfolio" row. */
  heldSymbols: string[];
  /** Distinct sectors present in the fundamentals table, for scope suggestions. */
  sectors: string[];
  depth: "top_line" | "full";
  planLabel: string;
  usage: { used: number; limit: number; unlimited: boolean };
  /** e.g. "1 September" - when the monthly allowance rolls over. */
  resetLabel: string;
  /** Analysis ids this user has pinned. Per-user, from ai_analysis_pins. */
  pinnedIds?: string[];
}

export function ResearchWorkspace({
  analyses,
  eventsByScope,
  heldSymbols,
  sectors,
  depth,
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
  const [filter, setFilter] = useState<"all" | "pinned" | ScopeType>("all");
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

  const library = analyses
    .filter((a) => (filter === "all" ? true : filter === "pinned" ? pins.has(a.id) : a.scope_type === filter))
    .slice()
    .sort((a, b) =>
      sort === "confidence"
        ? (CONF_STYLE[b.confidence_level]?.bars ?? 0) - (CONF_STYLE[a.confidence_level]?.bars ?? 0)
        : 0,
    );

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

  const portfolioCards = analyses.filter((a) => a.scope_type === "ticker" && held.has(a.scope_value));
  const open = analyses.find((a) => a.id === openId) ?? null;

  const generateEnabled = !!scope && !atCap && !pending;

  // Only show a dropdown whose result matches what is currently typed.
  const suggestions = suggest && suggest.q === query.trim() ? suggest.items : null;

  return (
    <div
      className="animate-page-in"
      style={{
        backgroundImage:
          "radial-gradient(880px 420px at 8% -8%, rgba(155,140,224,.10), transparent 70%), radial-gradient(720px 380px at 95% 0%, rgba(47,198,133,.07), transparent 72%)",
      }}
    >
      {/* Header + quota indicator */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-[18px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">
            Assistant · Research library
          </div>
          <h1 className="m-0 font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            Research library
          </h1>
          <p className="mt-2 max-w-[540px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Probability analysis with its inputs shown - sources, historical analogs, and a stated confidence level on
            every run.
          </p>
        </div>

        <div
          className={`min-w-[250px] rounded-2xl border bg-panel px-4 py-3.5 ${
            atCap ? "border-[rgba(217,164,65,0.35)]" : "border-[#232323]"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className={MONO_LABEL}>This month</span>
            <span className={`text-body tabular-nums ${atCap ? "text-warning" : "text-muted"}`}>
              {usage.unlimited ? `${usage.used} used · no cap` : `${usage.used} of ${usage.limit} used`}
            </span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-xs bg-active">
            <div
              className={`h-full origin-left rounded-xs transition-[width] duration-[340ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
                atCap ? "bg-warning" : "bg-gradient-to-r from-accent-light to-accent-dark"
              }`}
              style={{ width: usage.unlimited ? "100%" : `${Math.min((usage.used / usage.limit) * 100, 100)}%` }}
            />
          </div>
          {(atCap || nearCap) && (
            <div className="mt-3">
              <div className="text-caption leading-[1.55] text-muted text-pretty">
                {/* Both tiers have a monthly analysis cap - Premium raises it
                    (5 -> 100), it does not remove it. Only chat is unlimited on
                    Premium. */}
                {isFreePlan
                  ? atCap
                    ? `You've used all ${usage.limit} analyses on the Free plan this month. Premium raises the cap to ${TIER_LIMITS.premium.monthlyAiAnalyses} a month with full methodology detail. They reset on ${resetLabel}.`
                    : `One analysis left this month on the Free plan. Premium raises the cap to ${TIER_LIMITS.premium.monthlyAiAnalyses} a month and adds full methodology detail.`
                  : atCap
                    ? `You've used all ${usage.limit} Premium analyses this month. They reset on ${resetLabel}.`
                    : `One analysis left this month on the Premium plan. It resets on ${resetLabel}.`}
              </div>
              {isFreePlan && (
                <a
                  href="/billing"
                  className="mt-2.5 inline-block rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-3 py-2 text-caption font-semibold text-canvas transition-[box-shadow] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]"
                >
                  Upgrade to Premium
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scope selector */}
      <div className="mb-3.5 rounded-2xl border border-[#232323] bg-panel px-[22px] py-5">
        <div className={`${MONO_LABEL} mb-2.5`}>What should Cairn research?</div>
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
                <div className="flex items-center gap-2 rounded-panel border border-line bg-canvas px-3 py-3 transition-[border-color] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus-within:border-accent">
                  <svg
                    aria-hidden
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="shrink-0 text-dim"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
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
                        className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-[background] duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-active"
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
            className={`rounded-panel px-5 py-3 text-body font-semibold whitespace-nowrap transition-[box-shadow,transform] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${
              generateEnabled
                ? "bg-gradient-to-br from-accent-light to-accent-dark text-canvas hover:-translate-y-px hover:shadow-[0_0_24px_rgba(47,198,133,0.28)]"
                : "cursor-not-allowed bg-active text-dim"
            }`}
          >
            {atCap ? "Monthly limit reached" : pending ? "Generating…" : "Generate analysis"}
          </button>
        </div>
        {error && <p className="mt-2.5 text-body text-warning">{error}</p>}
      </div>

      {/* Relevant to your portfolio */}
      <div className="mb-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="font-mono text-eyebrow text-muted uppercase">Relevant to your portfolio</span>
          <span className="text-caption text-dim">Analyses touching what you hold</span>
        </div>
        {portfolioCards.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3">
            {portfolioCards.map((a, i) => {
              const c = CONF_STYLE[a.confidence_level] ?? CONF_STYLE.low;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setOpenId(a.id);
                    setPhase("idle");
                  }}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className="animate-rise-in min-w-0 rounded-[14px] border border-[#232323] bg-panel p-4 text-left transition-[border-color,transform,background] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:border-line-strong hover:bg-[#121212]"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <span className="text-lead text-primary">{a.scope_value}</span>
                    <span
                      className="rounded-full border px-2 py-1 font-mono text-eyebrow whitespace-nowrap uppercase"
                      style={{ borderColor: `${c.tint}66`, background: `${c.tint}1F`, color: c.tint }}
                    >
                      {c.label}
                    </span>
                  </div>
                  <div className="mt-2 text-caption text-muted capitalize">{a.analysis_type.replace(/_/g, " ")}</div>
                  <div className="mt-2.5 font-serif text-h2 tabular-nums text-primary">
                    {a.probability_low}–{a.probability_high}%
                  </div>
                  <div className="mt-2.5 font-mono text-eyebrow text-dim uppercase" suppressHydrationWarning>
                    {whenLabel(a.created_at)}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
            <div className="font-serif text-h3 text-primary">No analyses on your holdings yet</div>
            <p className="mx-auto mt-2 mb-4 max-w-[400px] text-body text-muted text-pretty">
              Pick a ticker you own above and generate the first one - it&apos;ll show up here afterwards.
            </p>
          </div>
        )}
      </div>

      {/* Library rail + detail column */}
      {/* The mock's researchGrid switches at w >= 1100, not at Tailwind's xl. */}
      <div className="grid grid-cols-1 items-start gap-4 min-[1100px]:grid-cols-[340px_1fr]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[#232323] bg-panel">
          <div className="border-b border-[#1c1c1c] bg-[#0c0c0c] px-4 py-3.5">
            <div className="font-mono text-eyebrow text-muted uppercase">Library · {library.length}</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["pinned", `Pinned${pins.size > 0 ? ` · ${pins.size}` : ""}`],
                  ["ticker", "Tickers"],
                  ["sector", "Sectors"],
                  ["market", "Market-wide"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-control px-2.5 py-1 text-caption transition-[background,color] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:text-primary ${
                    filter === value ? "bg-active text-primary" : "bg-transparent text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
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
                  className={`rounded-control px-2 py-1 text-micro transition-[background,color] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:text-primary ${
                    sort === value ? "bg-active text-primary" : "bg-transparent text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {pinError && (
            <p role="alert" className="border-b border-[#171717] px-4 py-2.5 text-caption text-negative">
              {pinError}
            </p>
          )}

          {library.length === 0 ? (
            <div className="px-4 py-8 text-center text-caption text-dim">
              {filter === "pinned" ? "Nothing pinned yet. Star an analysis to keep it here." : "Nothing in the library yet."}
            </div>
          ) : (
            library.map((a, i) => {
              const c = CONF_STYLE[a.confidence_level] ?? CONF_STYLE.low;
              const isOpen = a.id === openId && phase === "idle";
              const pinned = pins.has(a.id);
              return (
                <div key={a.id} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(a.id);
                    setPhase("idle");
                  }}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`animate-rise-in relative block w-full border-b border-[#171717] px-4 py-3.5 pr-10 pl-[15px] text-left transition-[background] duration-[140ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-raised ${
                    isOpen ? "bg-raised" : ""
                  }`}
                >
                  {/* The rail carries the analysis's own confidence tint, so a
                      scan down the list separates a high-confidence read from
                      a thin one before any of the text is read. */}
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 left-0 w-[3px]"
                    style={{ background: c.tint, opacity: isOpen ? 1 : 0.55 }}
                  />
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-primary">{a.scope_value}</span>
                      <span className="rounded-full border border-line px-[7px] py-px font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase">
                        {a.scope_type}
                      </span>
                    </div>
                    <ConfidenceBars level={a.confidence_level} />
                  </div>
                  <div className="mt-2 text-[12.5px] leading-[1.65] text-muted text-pretty">
                    <span className="capitalize">{a.analysis_type.replace(/_/g, " ")}</span> · {a.probability_low}–
                    {a.probability_high}%
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2.5">
                    <span className="font-mono text-eyebrow uppercase" style={{ color: c.tint }}>
                      {c.label}
                    </span>
                    <span className="font-mono text-eyebrow text-dim uppercase" suppressHydrationWarning>
                      {whenLabel(a.created_at)}
                    </span>
                  </div>
                </button>
                {/* Sibling, not a child: the row is itself a button, and a
                    nested one is invalid HTML. Violet rather than the accent
                    because a pin says nothing about the analysis's direction
                    or confidence - green here would read as a verdict. */}
                <button
                  type="button"
                  onClick={() => togglePin(a.id)}
                  aria-pressed={pinned}
                  aria-label={pinned ? `Unpin the ${a.scope_value} analysis` : `Pin the ${a.scope_value} analysis`}
                  title={pinned ? "Unpin" : "Pin"}
                  className={`absolute top-2.5 right-2 flex h-7 w-7 items-center justify-center rounded-control text-title leading-none transition-colors duration-fast ease-standard hover:bg-active ${
                    pinned ? "text-violet" : "text-dim hover:text-muted"
                  }`}
                >
                  <span aria-hidden>{pinned ? "★" : "☆"}</span>
                </button>
                </div>
              );
            })
          )}
        </div>

        <div className="min-w-0">
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
            <MethodologyCard analysis={open} depth={depth} upcomingEvents={eventsByScope[open.scope_value] ?? []} />
          ) : analyses.length === 0 ? (
            <EmptyPanel onGenerate={generate} />
          ) : (
            <NeedsPickPanel onGenerate={generate} />
          )}
        </div>
      </div>
    </div>
  );
}
