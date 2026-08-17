import type { ReactNode } from "react";

// Shared field/readout chrome for the three planning calculators, so their
// inputs and computed stats read as one system rather than three.
export const CALC_INPUT =
  "rounded-lg border border-line bg-canvas px-3.25 py-2.5 text-[12.5px] text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

export const CALC_LABEL = "font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";

export function CalcField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.75">
      <span className={CALC_LABEL}>{label}</span>
      {children}
    </label>
  );
}

export function CalcStat({
  label,
  value,
  sub,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "primary" | "positive" | "negative";
}) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";
  return (
    <div>
      <div className={CALC_LABEL}>{label}</div>
      <div className={`mt-1.75 font-serif text-[22px] leading-none tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1.25 text-[11.5px] text-dim">{sub}</div>}
    </div>
  );
}

export function CalcCard({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-panel p-4.5">
      <div className="font-serif text-[17px] text-primary">{title}</div>
      <p className="mt-1.5 mb-4 max-w-[620px] text-[12.5px] leading-relaxed text-dim text-pretty">{blurb}</p>
      {children}
    </div>
  );
}
