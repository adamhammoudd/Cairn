interface StatCardProps {
  label: string;
  value: string;
  tone?: "primary" | "positive" | "negative";
}

export function StatCard({ label, value, tone = "primary" }: StatCardProps) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";

  return (
    <div className="rounded-card border border-line bg-panel p-5">
      <div className="mb-2 text-[11.5px] tracking-[0.08em] text-muted uppercase">{label}</div>
      <div className={`font-serif text-2xl ${color}`}>{value}</div>
    </div>
  );
}
