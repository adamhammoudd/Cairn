import type { ReactNode } from "react";

// Shared field/readout chrome for the three planning calculators, so their
// inputs and computed stats read as one system rather than three.
export const CALC_INPUT =
  "rounded-lg border border-line bg-canvas px-3.25 py-2.5 text-[12.5px] text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

export const CALC_LABEL = "font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";

export function CalcField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
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
      <div>{label}</div>
      <div>{value}</div>
      {sub && <div>{sub}</div>}
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
    <div>
      <div>{title}</div>
      <p>{blurb}</p>
      {children}
    </div>
  );
}
