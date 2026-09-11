import { UNAVAILABLE_MESSAGE } from "@/lib/analysis";
import { TIER_LIMITS } from "@/lib/billing";

// The Research detail column's non-populated states, transcribed from the
// `rIsGenerating` / `rNeedsPick` / `rIsEmpty` / `rIsUnavailable` / `rIsQuota`
// blocks of the Research artboard in Context/mockups/Cairn.dc.html.
//
// These live in their own file because the chat-triggered generation path
// renders GeneratingPanel, UnavailablePanel and QuotaReachedPanel too - the
// wording and treatment of a failure must not differ by entry point.

const PANEL_SOLID = "rounded-card border border-line bg-canvas px-6.5 py-11 text-center";
const PANEL_DASHED = "rounded-card border border-dashed border-line px-6.5 py-15 text-center";
const HEADING = "font-serif text-primary";
const BLURB = "mx-auto mt-2 mb-5 text-body leading-[1.6] text-muted text-pretty";
const PRIMARY_BUTTON =
  "inline-block rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5 py-3 text-body font-semibold text-canvas transition-[box-shadow] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]";
const SECONDARY_BUTTON =
  "rounded-panel border border-line px-4.5 py-3 text-body text-primary transition-[border-color] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-line-strong";

// Three stones, the same 32/24/17 x 9px shapes the mock uses for both the idle
// cairn and the breathing one.
function Stones({ live }: { live?: boolean }) {
  return (
    <div aria-hidden className="mb-4.5 flex h-10 items-end justify-center gap-1.5">
      {[32, 24, 17].map((w, i) => (
        <span
          key={w}
          className={`h-2 rounded-full ${
            live
              ? "animate-breathe bg-gradient-to-br from-accent-light to-accent-dark"
              : i === 2
                ? "bg-active"
                : "bg-active"
          }`}
          style={{ width: w, animationDelay: live ? `${i * 200}ms` : undefined }}
        />
      ))}
    </div>
  );
}

/**
 * Generation in flight. The progress bar grows over `durationMs` - pass the
 * real expected duration so the bar tracks the actual request rather than
 * pretending. Stage lines flip to a green checkmark once that stage's count
 * is known; until then they read as still running.
 */
export function GeneratingPanel({
  scopeLabel,
  sourcesRead,
  analogsMatched,
  durationMs = 2600,
}: {
  scopeLabel?: string;
  sourcesRead?: number;
  analogsMatched?: number;
  durationMs?: number;
}) {
  return (
    <div className={PANEL_SOLID} role="status" aria-live="polite">
      <Stones live />
      <div className={`${HEADING} text-h3`}>
        {scopeLabel ? `Building the analysis for ${scopeLabel}` : "Building the analysis"}
      </div>
      <p className={`${BLURB} max-w-[380px] text-body`}>
        Reading sources, matching historical analogs, and computing the confidence range. Usually under ten seconds.
      </p>
      <div className="mx-auto h-1 max-w-[300px] overflow-hidden rounded-xs bg-active">
        <div
          className="animate-grow-x h-full w-full origin-left rounded-xs bg-gradient-to-r from-accent-light to-accent-dark"
          style={{ animationDuration: `${durationMs}ms` }}
        />
      </div>
      <div className="mx-auto mt-4.5 flex max-w-[300px] flex-col gap-2 text-left">
        <div className={`font-mono text-eyebrow uppercase ${sourcesRead ? "text-accent" : "text-dim"}`}>
          {sourcesRead ? `✓ ${sourcesRead} sources read` : "· reading sources"}
        </div>
        <div className={`font-mono text-eyebrow uppercase ${analogsMatched ? "text-accent" : "text-dim"}`}>
          {analogsMatched ? `✓ ${analogsMatched} analogs matched` : "· matching analogs"}
        </div>
        <div className="animate-blink font-mono text-eyebrow text-dim uppercase">· computing range</div>
      </div>
    </div>
  );
}

/** Library has entries, but the reader hasn't opened one yet. */
export function NeedsPickPanel({ onGenerate }: { onGenerate?: () => void }) {
  return (
    <div className={PANEL_DASHED}>
      <Stones />
      <div className={`${HEADING} text-h2`}>Pick an analysis to read it in full</div>
      <p className={`${BLURB} max-w-[400px]`}>
        Choose any entry from the library, or set a scope above and generate a new one. Every analysis opens with its
        sources, its historical analogs, and a stated confidence level.
      </p>
      {onGenerate && (
        <button type="button" onClick={onGenerate} className={PRIMARY_BUTTON}>
          Generate analysis
        </button>
      )}
    </div>
  );
}

/** Nothing stored for the selected scope (or nothing stored at all). */
export function EmptyPanel({ onGenerate }: { onGenerate?: () => void }) {
  return (
    <div className={PANEL_DASHED}>
      <Stones />
      <div className={`${HEADING} text-h2`}>No analysis for this scope yet</div>
      <p className={`${BLURB} max-w-[400px]`}>
        Pick a ticker, sector, or market-wide scope above and generate one. Every run shows its sources, its analogs, and
        how confident it is.
      </p>
      {onGenerate && (
        <button type="button" onClick={onGenerate} className={PRIMARY_BUTTON}>
          Generate analysis
        </button>
      )}
    </div>
  );
}

/**
 * The record is too thin to put a range on. This is the honest refusal the
 * guardrails require - never a fabricated number, never a raw internal error.
 * Chat renders this same panel with this same wording.
 */
export function UnavailablePanel({
  onBroaden,
  onAskAssistant,
}: {
  onBroaden?: () => void;
  onAskAssistant?: () => void;
}) {
  return (
    <div className={PANEL_SOLID}>
      <div
        aria-hidden
        className="mx-auto mb-4.5 flex h-10 w-10 items-center justify-center rounded-panel border border-line"
      >
        <span className="h-0.5 w-4.5 rounded-xs bg-muted" />
      </div>
      <div className={`${HEADING} text-h3`}>Not enough history for a reliable read</div>
      <p className={`${BLURB} max-w-[420px]`}>
        {UNAVAILABLE_MESSAGE} Rather than show you a number we don&apos;t trust, we&apos;d rather say so. Try a broader
        scope, like the sector or market-wide view.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {onBroaden && (
          <button type="button" onClick={onBroaden} className={PRIMARY_BUTTON}>
            Try a broader scope
          </button>
        )}
        {onAskAssistant && (
          <button type="button" onClick={onAskAssistant} className={SECONDARY_BUTTON}>
            Ask the assistant instead
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Monthly quota exhausted. Identical whether the run was triggered from the
 * Research page or from chat - chat does not get a cheaper way past this.
 */
export function QuotaReachedPanel({
  used,
  limit,
  planLabel,
  resetLabel,
  onBrowseLibrary,
}: {
  used: number;
  limit: number;
  planLabel: string;
  resetLabel: string;
  onBrowseLibrary?: () => void;
}) {
  const isFreePlan = planLabel !== TIER_LIMITS.premium.label;
  return (
    <div className="rounded-card border border-[rgba(217,164,65,0.35)] bg-canvas px-6.5 py-11 text-center">
      <div className="mb-4.5 inline-flex items-center gap-2 rounded-full border border-[rgba(217,164,65,0.35)] bg-[rgba(217,164,65,0.1)] px-3 py-1">
        <span className="font-mono text-eyebrow text-warning uppercase">
          {planLabel} plan · {used} of {limit} used
        </span>
      </div>
      <div className={`${HEADING} text-h2`}>You&apos;ve used this month&apos;s analyses</div>
      <p className={`${BLURB} max-w-[400px]`}>
        Your {planLabel}-plan runs reset on {resetLabel}. Everything you&apos;ve already generated stays readable in the
        library - nothing is locked away.
        {isFreePlan && ` Premium raises the monthly cap to ${TIER_LIMITS.premium.monthlyAiAnalyses} and adds full methodology detail.`}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {isFreePlan && (
          <a href="/billing" className={PRIMARY_BUTTON}>
            Upgrade to Premium
          </a>
        )}
        {onBrowseLibrary && (
          <button type="button" onClick={onBrowseLibrary} className={SECONDARY_BUTTON}>
            Browse the library
          </button>
        )}
      </div>
    </div>
  );
}
