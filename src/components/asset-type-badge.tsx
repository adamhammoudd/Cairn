// The one asset-type pill, used identically on Markets, Screener, Portfolio,
// Comparison and the Ticker page.
//
// There were four renderings of this before: Markets/Comparison drew the full
// pill (border + per-type colour), the Screener drew mono uppercase text with
// only the text colour and no border, the Ticker page drew the pill shape but
// hard-coded `text-muted`/`border-line` so crypto never went violet, and the
// Portfolio holdings table printed the raw value with `capitalize` and no pill
// at all - so the same "equity"/"crypto" tag read four different ways
// depending on which screen you were on, and an audit kept finding it drifting
// back to lowercase. Component-level now so it can't.
//
// `ASSET_TYPE_TAG_CLASS` (lib/screener.ts) stays the single source of the
// per-type colour: equity=plain, etf=info, crypto=violet, forex=warning,
// index/future=muted. Uppercase is done in CSS so the stored value is never
// mutated.

import { ASSET_TYPE_TAG_CLASS } from "@/lib/screener";

interface AssetTypeBadgeProps {
  /** The stored asset_type / assetType string, e.g. "equity", "crypto". */
  type: string;
  /**
   * "pill" (default) - bordered pill, for a row or a header beside a name.
   * "text" - colour + uppercase mono only, no border/background, for a dense
   * table cell that already sits in its own column.
   */
  variant?: "pill" | "text";
  className?: string;
}

export function AssetTypeBadge({ type, variant = "pill", className = "" }: AssetTypeBadgeProps) {
  const tag = ASSET_TYPE_TAG_CLASS[type] ?? "text-muted border-line";

  if (variant === "text") {
    return (
      <span
        className={`font-mono text-[9.5px] tracking-[0.1em] uppercase ${tag.split(" ")[0]} ${className}`}
      >
        {type}
      </span>
    );
  }

  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.75 font-mono text-[9.5px] tracking-[0.1em] uppercase ${tag} ${className}`}
    >
      {type}
    </span>
  );
}
