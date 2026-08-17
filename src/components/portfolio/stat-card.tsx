interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "positive" | "negative";
  delayMs?: number;
}

export function StatCard({ label, value, sub, tone = "primary", delayMs = 0 }: StatCardProps) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";

  return (
    <div
      className="animate-rise-in rounded-card border border-line bg-panel px-4.5 py-4"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">{label}</div>
      <div className={`mt-2.25 font-serif text-[26px] leading-none tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1.5 text-[11.5px] text-dim">{sub}</div>}
    </div>
  );
}
