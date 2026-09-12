interface StatCardProps {
  label: string;
  value: string;
  /** Full-precision value shown on hover when `value` is compacted. */
  exact?: string;
  sub?: string;
  tone?: "primary" | "positive" | "negative";
  delayMs?: number;
}

export function StatCard({ label, value, exact, sub, tone = "primary", delayMs = 0 }: StatCardProps) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";

  return (
    <div
      className="animate-rise-in rounded-card border border-line bg-panel px-4.5 py-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="font-mono text-label text-muted uppercase">{label}</div>
      <div
        className={`mt-2 truncate font-serif text-[26px] leading-none tabular-nums ${color}`}
        title={exact && exact !== value ? exact : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-sub text-faint">{sub}</div>}
    </div>
  );
}
