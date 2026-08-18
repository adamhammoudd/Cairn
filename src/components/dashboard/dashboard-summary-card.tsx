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

 >
      <div>
        <div>
          <span />
          <span>{title}</span>
        </div>
        {arranging ? (
          <div>
            <button type="button" onClick={onMoveUp}>
              ↑
            </button>
            <button type="button" onClick={onMoveDown}>
              ↓
            </button>
            <button type="button" onClick={onToggleWide}>
              ⇔
            </button>
            <button
              type="button"
              onClick={onHide}

 >
              ×
            </button>
          </div>
        ) : (
          <Link
            href={href}

 >
            {ctaLabel} →
          </Link>
        )}
      </div>

      {children ?? (
        <>
          <div>{value}</div>
          <div>{detail}</div>
        </>
      )}
    </div>
  );
}
