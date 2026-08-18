import Link from "next/link";
import type { ReactNode } from "react";

interface DashboardSummaryCardProps {
  title: string;
  href: string;
  ctaLabel: string;
  tint?: "accent" | "info" | "violet" | "warning";
  value: string;
  valueTone?: "primary" | "positive" | "negative";
  detail: string;
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
  "flex h-6 w-6 items-center justify-center rounded-md border border-line text-[11px] text-muted transition-colors duration-fast ease-standard hover:border-accent hover:text-primary";

const TINT_CLASSES: Record<NonNullable<DashboardSummaryCardProps["tint"]>, string> = {
  accent: "bg-accent",
  info: "bg-info",
  violet: "bg-violet",
  warning: "bg-warning",
};

const VALUE_TONE_CLASSES: Record<NonNullable<DashboardSummaryCardProps["valueTone"]>, string> = {
  primary: "text-primary",
  positive: "text-accent",
  negative: "text-negative",
};

export function DashboardSummaryCard({
  title,
  href,
  ctaLabel,
  tint = "accent",
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
      className={`animate-rise-in group relative rounded-card border border-line bg-panel p-4.5 transition-[border-color,transform,box-shadow] duration-base ease-standard hover:-translate-y-0.5 hover:border-[#3A3A3A] hover:shadow-[0_12px_30px_rgba(0,0,0,0.45)] ${
        wide ? "sm:col-span-2" : ""
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.25">
          <span className={`h-3.5 w-1.25 rounded-sm ${TINT_CLASSES[tint]}`} />
          <span className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">{title}</span>
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
              className="flex h-6 w-6 items-center justify-center rounded-md border border-line text-[12px] text-muted transition-colors duration-fast ease-standard hover:border-negative hover:text-negative"
            >
              ×
            </button>
          </div>
        ) : (
          <Link
            href={href}
            className="text-[11.5px] text-dim transition-colors duration-fast ease-standard hover:text-accent"
          >
            {ctaLabel} →
          </Link>
        )}
      </div>

      {children ?? (
        <>
          <div className={`font-serif text-[26px] leading-none ${VALUE_TONE_CLASSES[valueTone]}`}>{value}</div>
          <div className="mt-2.5 text-[12px] text-muted">{detail}</div>
        </>
      )}
    </div>
  );
}
