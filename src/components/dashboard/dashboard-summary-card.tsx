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
  wide?: boolean;
  children?: ReactNode;
  arranging?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggleWide?: () => void;
  onHide?: () => void;
}

const ARRANGE_BTN =
  "flex h-6 w-6 items-center justify-center rounded-control border border-line text-micro text-muted transition-colors duration-fast ease-standard hover:border-accent hover:text-primary";

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
  wide = false,
  children,
  arranging = false,
  onMoveUp,
  onMoveDown,
  onToggleWide,
  onHide,
}: DashboardSummaryCardProps) {
  return (
    <div
      className={`animate-rise-in group relative self-start rounded-card border border-line bg-panel p-4.5 transition-[border-color,transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${
        wide ? "md:col-span-2" : ""
      }`}
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
          <div className="flex items-center gap-1">
            <button type="button" onClick={onMoveUp} className={ARRANGE_BTN}>
              ↑
            </button>
            <button type="button" onClick={onMoveDown} className={ARRANGE_BTN}>
              ↓
            </button>
            <button type="button" onClick={onToggleWide} className={ARRANGE_BTN}>
              ⇔
            </button>
            <button
              type="button"
              onClick={onHide}
              className="flex h-6 w-6 items-center justify-center rounded-control border border-line text-caption text-muted transition-colors duration-fast ease-standard hover:border-negative hover:text-negative"
            >
              ×
            </button>
          </div>
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
