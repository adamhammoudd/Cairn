"use client";

import { useMemo, useState } from "react";
import { computePositionSize } from "@/lib/planning";
import { CALC_INPUT, CalcCard, CalcField, CalcStat } from "@/components/calculators/calc-primitives";

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function PositionSizingCalculator({ defaultAccountValue }: { defaultAccountValue: number }) {
  const [accountValue, setAccountValue] = useState(defaultAccountValue > 0 ? defaultAccountValue.toFixed(2) : "");
  const [riskPct, setRiskPct] = useState("1");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const result = useMemo(
    () =>
      computePositionSize({
        accountValue: Number(accountValue) || 0,
        riskPct: Number(riskPct) || 0,
        entryPrice: Number(entryPrice) || 0,
        stopPrice: Number(stopPrice) || 0,
      }),
    [accountValue, riskPct, entryPrice, stopPrice],
  );

  const hasInputs = Number(entryPrice) > 0 && Number(stopPrice) > 0 && Number(accountValue) > 0;

  return (
    <CalcCard
      title="Position sizing"
      blurb="Fixed-fractional sizing: risks a set % of your account on the distance between entry and stop. A calculator, not a recommendation to enter any position."
    >
      <div className="grid grid-cols-2 gap-2.75">
        <CalcField label="Account value ($)">
          <input
            value={accountValue}
            onChange={(e) => setAccountValue(e.target.value)}
            placeholder="e.g. 50000"
            className={CALC_INPUT}
          />
        </CalcField>
        <CalcField label="Risk per trade (%)">
          <input value={riskPct} onChange={(e) => setRiskPct(e.target.value)} placeholder="e.g. 1" className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Entry price ($)">
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="e.g. 182.50"
            className={CALC_INPUT}
          />
        </CalcField>
        <CalcField label="Stop price ($)">
          <input
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            placeholder="e.g. 175.00"
            className={CALC_INPUT}
          />
        </CalcField>
      </div>

      {hasInputs && (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-muted">Share quantity</span>
            <span className="font-serif text-[28px] tabular-nums text-primary">{result.shareQty.toLocaleString()}</span>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <CalcStat label="Risk amount" value={fmtCurrency(result.riskAmount)} />
            <CalcStat label="Risk / share" value={fmtCurrency(result.riskPerShare)} />
            <CalcStat label="Position value" value={fmtCurrency(result.positionValue)} />
            <CalcStat label="Weight" value={`${result.positionPctOfAccount.toFixed(1)}%`} />
          </div>
        </div>
      )}
    </CalcCard>
  );
}
