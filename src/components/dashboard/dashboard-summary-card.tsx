interface DashboardSummaryCardProps {
  title: string;
  subtitle: string;
  value: string;
  detail: string;
  tone?: "primary" | "positive" | "negative" | "info";
}

const TONE_CLASSES: Record<NonNullable<DashboardSummaryCardProps["tone"]>, string> = {
  primary: "text-primary",
  positive: "text-accent",
  negative: "text-negative",
  info: "text-info",
};

export function DashboardSummaryCard({ title, subtitle, value, detail, tone = "primary" }: DashboardSummaryCardProps) {
  return (
    <div className="rounded-card border border-line bg-panel p-5 transition-colors duration-fast ease-standard hover:border-accent/40 hover:bg-active">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] tracking-[0.12em] text-muted uppercase">{title}</div>
          <div className="mt-1 text-sm text-muted">{subtitle}</div>
        </div>
        <div className={`rounded-full px-2 py-1 text-[11px] font-semibold ${TONE_CLASSES[tone]} bg-white/5`}>{tone}</div>
      </div>
      <div className={`font-serif text-3xl ${TONE_CLASSES[tone]}`}>{value}</div>
      <div className="mt-3 text-[13px] text-muted">{detail}</div>
    </div>
  );
}
