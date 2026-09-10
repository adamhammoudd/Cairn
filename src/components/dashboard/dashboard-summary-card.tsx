import Link from "next/link";
import type { ReactNode } from "react";

interface DashboardSummaryCardProps {
  title: string;
  href: string;
  ctaLabel: string;
  value?: string;
  valueTone?: "primary" | "positive" | "negative";
  detail?: string;
  delay?: number;
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
  children,
  arranging = false,
  onMoveUp,
  onMoveDown,
  onHide,
}: DashboardSummaryCardProps) {
  return (
    <div
      className="animate-rise-in group relative self-start rounded-card border border-line bg-panel p-4.5 transition-[border-color,transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* The card header used to carry a small coloured rule before the label -
          four tints across five cards, green on two of them. It encoded
          nothing: no legend, no meaning, and green is the gain colour.
          The same idiom one card down *is* semantic (a news item's rule says
          whether you hold the symbol, watch it, or neither), so the decorative
          copy was teaching readers that the shape means nothing. Removed, so
          the rule has exactly one meaning on this screen. The mono eyebrow
          alone also now matches every other page header in the product. */}
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-eyebrow text-muted uppercase">{title}</span>
        </div>
        {arranging ? (
          <ArrangeControls onMoveUp={onMoveUp} onMoveDown={onMoveDown} onHide={onHide} />
        ) : (
          <Link
            href={href}
            className="text-caption text-dim transition-colors duration-fast ease-standard hover:text-accent"
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
