interface StatCardProps {
  label: string;
  value: string;
  /** Full-precision value shown on hover when `value` is compacted. */
  exact?: string;
  sub?: string;
  tone?: "primary" | "positive" | "negative";
  delayMs?: number;
  /** Hairline colour across the card's top edge. Defaults to the tone's own. */
  accent?: string;
  /** Extra lines under the sub-label (e.g. where a gain comes from). */
  children?: React.ReactNode;
}

export function StatCard({ label, value, exact, sub, tone = "primary", delayMs = 0, accent, children }: StatCardProps) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";
  const hairline =
    accent ??
    (tone === "positive"
      ? "var(--color-accent)"
      : tone === "negative"
        ? "var(--color-negative)"
        : "var(--color-accent)");

  return (
    <div
      className="animate-rise-in relative flex flex-col gap-1.5 overflow-hidden rounded-[15px] border border-line-soft bg-panel px-5 py-4.5"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span
        aria-hidden
        className="absolute top-0 right-0 left-0 h-px"
        style={{ background: `linear-gradient(90deg,${hairline},transparent)` }}
      />
      <div className="font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">{label}</div>
      <div
        className={`truncate font-serif text-[34px] leading-[1.05] font-normal tabular-nums ${color}`}
        title={exact && exact !== value ? exact : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-caption text-muted">{sub}</div>}
      {children}
    </div>
  );
}
