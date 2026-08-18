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

 >
      <div>{label}</div>
      <div>{value}</div>
      {sub && <div>{sub}</div>}
    </div>
  );
}
