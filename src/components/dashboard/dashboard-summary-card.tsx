import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Which module a card is, expressed as a colour.
 *
 * This is identity, not data: "markets" is blue on every surface that shows a
 * markets card, the way a section in a newspaper keeps its colour. It never
 * encodes a value, a direction or a state - those stay with the gain/loss
 * rules, which is why `accent` is reserved here for the assistant band rather
 * than being handed out to whichever card is up.
 */
export type ModuleTint = "accent" | "info" | "violet" | "warning";

// The design marks a module's identity with a 1px hairline that fades out
// across the top of the card, not a 2px border. A full-weight coloured edge
// reads as a state (selected, erroring); a hairline that dissolves reads as a
// label, which is what this is.
const TINT_CLASSES: Record<ModuleTint, { label: string; hairline: string }> = {
  accent: { label: "text-accent", hairline: "#2fc685" },
  info: { label: "text-info", hairline: "#5b8def" },
  violet: { label: "text-violet", hairline: "#9b8ce0" },
  warning: { label: "text-warning", hairline: "#d9a441" },
};

interface DashboardSummaryCardProps {
  title: string;
  href: string;
  ctaLabel: string;
  value?: string;
  valueTone?: "primary" | "positive" | "negative";
  detail?: string;
  delay?: number;
  /** Module identity colour. Omit for a card with no section colour. */
  tint?: ModuleTint;
  className?: string;
  children?: ReactNode;
}

const VALUE_TONE_CLASSES: Record<NonNullable<DashboardSummaryCardProps["valueTone"]>, string> = {
  primary: "text-primary",
  positive: "text-accent",
  negative: "text-negative",
};

export function DashboardSummaryCard({
  title,
  href,
  ctaLabel,
  value,
  valueTone = "primary",
  detail,
  delay = 0,
  tint,
  className = "",
  children,
}: DashboardSummaryCardProps) {
  const tintClasses = tint ? TINT_CLASSES[tint] : null;
  return (
    <div
      className={`animate-rise-in group relative self-start overflow-hidden rounded-2xl border border-[#232323] bg-panel px-[22px] py-5 transition-[border-color,transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {tintClasses && (
        <span
          aria-hidden
          className="absolute top-0 right-0 left-0 h-px"
          style={{ background: `linear-gradient(90deg,${tintClasses.hairline},transparent)` }}
        />
      )}
      {/* An earlier pass stripped a coloured rule from this header, because at
          the time four tints were sprinkled across five cards with no rule
          behind them - green included, which is the gain colour. The tint is
          back, but bound: it is a fixed per-module identity set in one map,
          carried on the card's top edge and its label together, and green
          belongs to the assistant band alone. It still encodes no value, so a
          reader never has to ask what a colour here is worth - the one place
          on this page where a coloured rule *is* semantic (a news item's, which
          says whether you hold the symbol) keeps its own legend. */}
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-eyebrow uppercase ${tintClasses ? tintClasses.label : "text-muted"}`}>
            {title}
          </span>
        </div>
        <Link
          href={href}
          className="text-caption text-dim transition-colors duration-fast ease-standard hover:text-accent"
        >
          {ctaLabel} →
        </Link>
      </div>

      {children ?? (
        <>
          <div className={`font-serif text-h2 leading-none ${VALUE_TONE_CLASSES[valueTone]}`}>{value}</div>
          <div className="mt-2.5 text-caption text-muted">{detail}</div>
        </>
      )}
    </div>
  );
}
