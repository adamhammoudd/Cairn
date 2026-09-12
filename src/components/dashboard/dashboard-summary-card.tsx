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

const TINT_CLASSES: Record<ModuleTint, { label: string; edge: string }> = {
  accent: { label: "text-accent", edge: "border-t-accent" },
  info: { label: "text-info", edge: "border-t-info" },
  violet: { label: "text-violet", edge: "border-t-violet" },
  warning: { label: "text-warning", edge: "border-t-warning" },
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
  arranging?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onHide?: () => void;
}

const ARRANGE_BTN =
  "flex h-6 w-6 items-center justify-center rounded-control border border-line text-micro text-muted transition-colors duration-fast ease-standard hover:border-accent hover:text-primary";

export interface ArrangeHandlers {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onHide?: () => void;
}

/**
 * Reorder/hide controls, shared by the two full-width bands on Base Camp and
 * by the supporting tiles, so arrange mode looks and behaves the same wherever
 * it appears.
 *
 * The old "widen" toggle is gone: width is now decided by what a module is,
 * not by a per-card preference, so the control had nothing left to change.
 */
export function ArrangeControls({ onMoveUp, onMoveDown, onHide }: ArrangeHandlers) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onMoveUp} aria-label="Move up" className={ARRANGE_BTN}>
        ↑
      </button>
      <button type="button" onClick={onMoveDown} aria-label="Move down" className={ARRANGE_BTN}>
        ↓
      </button>
      <button
        type="button"
        onClick={onHide}
        aria-label="Hide"
        className="flex h-6 w-6 items-center justify-center rounded-control border border-line text-caption text-muted transition-colors duration-fast ease-standard hover:border-negative hover:text-negative"
      >
        ×
      </button>
    </div>
  );
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
  arranging = false,
  onMoveUp,
  onMoveDown,
  onHide,
}: DashboardSummaryCardProps) {
  const tintClasses = tint ? TINT_CLASSES[tint] : null;
  return (
    <div
      className={`animate-rise-in group relative self-start rounded-card border border-line bg-panel p-4.5 transition-[border-color,transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${
        tintClasses ? `border-t-2 ${tintClasses.edge}` : ""
      } ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
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
        {arranging ? (
          <ArrangeControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onHide={onHide} />
        ) : (
          <Link
            href={href}
            className="text-sub text-faint transition-colors duration-fast ease-standard hover:text-accent"
          >
            {ctaLabel} →
          </Link>
        )}
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
