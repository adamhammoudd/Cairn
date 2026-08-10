"use client";

import { useMemo, useState } from "react";
import { computeScenario, type ScenarioHolding } from "@/lib/planning";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function ScenarioModeler({ holdings }: { holdings: ScenarioHolding[] }) {
  const [globalShockPct, setGlobalShockPct] = useState("0");
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});

  const rows = useMemo(
    () => computeScenario(holdings, Number(globalShockPct) || 0, overrides),
    [holdings, globalShockPct, overrides],
  );

  const currentTotal = rows.reduce((sum, r) => sum + (r.currentValue ?? 0), 0);
  const hypotheticalTotal = rows.reduce((sum, r) => sum + (r.hypotheticalValue ?? 0), 0);
  const totalDelta = hypotheticalTotal - currentTotal;

  function setOverride(symbol: string, raw: string) {
    setOverrides((prev) => ({ ...prev, [symbol]: raw === "" ? null : Number(raw) }));
  }

  if (holdings.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
        Add holdings on the Portfolio page to model what-if scenarios against them.
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="mb-1 text-[15px] font-semibold text-primary">Scenario modeling</div>
      <p className="mb-5 text-[12.5px] text-dim">
        Applies a hypothetical price move to today&apos;s holdings. A what-if on current value, not a
        forecast of what will happen.
      </p>

      <label className="mb-4 flex max-w-xs flex-col gap-1.5 text-[12.5px] text-muted">
        Global price move (%)
        <input
          value={globalShockPct}
          onChange={(e) => setGlobalShockPct(e.target.value)}
          placeholder="e.g. -10"
          className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
        />
      </label>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[0.8fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr] border-b border-line px-4 py-2.5 text-[11px] tracking-[0.06em] text-muted uppercase">
          <div>Symbol</div>
          <div>Current price</div>
          <div>Override (%)</div>
          <div>Hypothetical price</div>
          <div>Current value</div>
          <div>Hypothetical value</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.symbol}
            className="grid grid-cols-[0.8fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr] items-center border-b border-line px-4 py-2.5 text-[13px] last:border-b-0"
          >
            <div className="text-primary">{r.symbol}</div>
            <div className="text-muted">{fmtCurrency(r.currentPrice)}</div>
            <input
              value={overrides[r.symbol] ?? ""}
              onChange={(e) => setOverride(r.symbol, e.target.value)}
              placeholder={globalShockPct}
              className="w-20 rounded-md border border-line bg-active px-2 py-1 text-[12.5px] text-primary outline-none"
            />
            <div className="text-muted">{fmtCurrency(r.hypotheticalPrice)}</div>
            <div className="text-primary">{fmtCurrency(r.currentValue)}</div>
            <div className={r.valueDelta === null ? "text-primary" : r.valueDelta >= 0 ? "text-accent" : "text-negative"}>
              {fmtCurrency(r.hypotheticalValue)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-5">
        <Stat label="Current total" value={fmtCurrency(currentTotal)} />
        <Stat label="Hypothetical total" value={fmtCurrency(hypotheticalTotal)} />
        <Stat
          label="Change"
          value={`${totalDelta >= 0 ? "+" : ""}${fmtCurrency(totalDelta)}`}
          tone={totalDelta >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "primary" }: { label: string; value: string; tone?: "primary" | "positive" | "negative" }) {
  const color = tone === "positive" ? "text-accent" : tone === "negative" ? "text-negative" : "text-primary";
  return (
    <div>
      <div className="mb-1 text-[11px] tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className={`text-[14px] ${color}`}>{value}</div>
    </div>
  );
}
