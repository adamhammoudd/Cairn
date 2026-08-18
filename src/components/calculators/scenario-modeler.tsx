"use client";

import { useMemo, useState } from "react";
import { computeScenario, type ScenarioHolding } from "@/lib/planning";
import { CALC_INPUT, CalcCard, CalcField, CalcStat } from "@/components/calculators/calc-primitives";

const COLS = "grid-cols-[0.8fr_0.9fr_0.8fr_0.9fr_0.9fr_0.9fr]";

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
      <div>
        <div>Nothing to model against</div>
        <p>
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
      <div>
        <div>
          <CalcField label="Global price move (%)">
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={Number(globalShockPct) || 0}
              onChange={(e) => setGlobalShockPct(e.target.value)}

 />
          </CalcField>
        </div>
        <div

 >
          {(Number(globalShockPct) || 0) > 0 ? "+" : ""}
          {globalShockPct || 0}%
        </div>
      </div>

      <div>
        <div>
          <div>
            <div

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

 >
                <div>{r.symbol}</div>
                <div>{fmtCurrency(r.currentPrice)}</div>
                <input
                  value={overrides[r.symbol] ?? ""}
                  onChange={(e) => setOverride(r.symbol, e.target.value)}
                  placeholder={globalShockPct}
                  aria-label={`${r.symbol} price move override, percent`}

 />
                <div>{fmtCurrency(r.hypotheticalPrice)}</div>
                <div>{fmtCurrency(r.currentValue)}</div>
                <div

 >
                  {fmtCurrency(r.hypotheticalValue)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
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
