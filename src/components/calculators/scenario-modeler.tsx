"use client";

import { useMemo, useState } from "react";
import { computeScenario, type ScenarioHolding } from "@/lib/planning";
import { CALC_INPUT, CalcCard, CalcField, CalcStat } from "@/components/calculators/calc-primitives";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney } from "@/lib/display-prefs";

const COLS = "grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_0.9fr]";



export function ScenarioModeler({ holdings }: { holdings: ScenarioHolding[] }) {
  // Every figure here derives from real holdings at real market prices, so it
  // converts with the currency setting (formatMoney), unlike the calculators
  // whose inputs the reader types.
  const prefs = useDisplayPrefs();
  const fmtCurrency = (n: number | null) => formatMoney(n, prefs);
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
      <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
        <div className="font-serif text-[20px] text-primary">Nothing to model against</div>
        <p className="mx-auto mt-2 max-w-[380px] text-[13px] text-muted text-pretty">
          Add holdings on the Portfolio page and you can shock them here to see what it does to total value.
        </p>
      </div>
    );
  }

  return (
    <CalcCard
      title="Scenario modeling"
      blurb="Applies a hypothetical price move to today's holdings. A what-if on current value, not a forecast of what will happen."
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xs flex-1">
          <CalcField label="Global price move (%)">
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={Number(globalShockPct) || 0}
              onChange={(e) => setGlobalShockPct(e.target.value)}
              className="w-full accent-accent"
            />
          </CalcField>
        </div>
        <div
          className={`font-serif text-[20px] tabular-nums ${
            (Number(globalShockPct) || 0) > 0
              ? "text-accent"
              : (Number(globalShockPct) || 0) < 0
                ? "text-negative"
                : "text-primary"
          }`}
        >
          {(Number(globalShockPct) || 0) > 0 ? "+" : ""}
          {globalShockPct || 0}%
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div
              className={`grid ${COLS} gap-3 border-b border-line px-4 py-2.5 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase`}
            >
              <div>Symbol</div>
              <div>Current price</div>
              <div>Override %</div>
              <div>Hypothetical</div>
              <div>Current value</div>
              <div>Hypothetical value</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.symbol}
                className={`grid ${COLS} items-center gap-3 border-b border-line px-4 py-2.75 text-[12.5px] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active`}
              >
                <div className="text-primary">{r.symbol}</div>
                <div className="tabular-nums text-muted">{fmtCurrency(r.currentPrice)}</div>
                <input
                  value={overrides[r.symbol] ?? ""}
                  onChange={(e) => setOverride(r.symbol, e.target.value)}
                  placeholder={globalShockPct}
                  aria-label={`${r.symbol} price move override, percent`}
                  className="w-20 rounded-md border border-line bg-canvas px-2 py-1 text-[12px] tabular-nums text-primary outline-none transition-colors duration-base ease-standard focus:border-accent"
                />
                <div className="tabular-nums text-muted">{fmtCurrency(r.hypotheticalPrice)}</div>
                <div className="tabular-nums text-primary">{fmtCurrency(r.currentValue)}</div>
                <div
                  className={`tabular-nums ${
                    r.valueDelta === null ? "text-primary" : r.valueDelta >= 0 ? "text-accent" : "text-negative"
                  }`}
                >
                  {fmtCurrency(r.hypotheticalValue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4.5 sm:grid-cols-3">
        <CalcStat label="Current total" value={fmtCurrency(currentTotal)} />
        <CalcStat label="Hypothetical total" value={fmtCurrency(hypotheticalTotal)} />
        <CalcStat
          label="Change"
          value={`${totalDelta >= 0 ? "+" : ""}${fmtCurrency(totalDelta)}`}
          tone={totalDelta >= 0 ? "positive" : "negative"}
        />
      </div>
    </CalcCard>
  );
}
