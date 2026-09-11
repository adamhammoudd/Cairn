"use client";

import { useMemo, useState } from "react";
import { computePositionSize } from "@/lib/planning";
import { CALC_INPUT, CalcCard, CalcField, CalcStat } from "@/components/calculators/calc-primitives";
import { clampAmount, MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatAmount, formatCompactNumber, currencySymbol } from "@/lib/display-prefs";

export function PositionSizingCalculator({ defaultAccountValue }: { defaultAccountValue: number }) {
  // The seeded account value is a real portfolio figure, so it is converted
  // once on the way in. Everything after that is arithmetic on numbers the
  // reader typed, which is why the outputs are labelled in the display
  // currency (formatAmount) rather than converted a second time.
  const prefs = useDisplayPrefs();
  const fmtCurrency = (n: number) =>
    Math.abs(n) >= 1e7 ? formatAmount(n, prefs, { notation: "compact", maximumFractionDigits: 2 }) : formatAmount(n, prefs);
  const [accountValue, setAccountValue] = useState(
    defaultAccountValue > 0 ? (defaultAccountValue * prefs.fxRate).toFixed(2) : "",
  );
  const [riskPct, setRiskPct] = useState("1");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  const result = useMemo(
    () =>
      computePositionSize({
        accountValue: clampAmount(Number(accountValue) || 0),
        riskPct: Math.min(Math.max(Number(riskPct) || 0, 0), 100),
        entryPrice: clampAmount(Number(entryPrice) || 0),
        stopPrice: clampAmount(Number(stopPrice) || 0),
      }),
    [accountValue, riskPct, entryPrice, stopPrice],
  );

  const hasInputs = Number(entryPrice) > 0 && Number(stopPrice) > 0 && Number(accountValue) > 0;

  return (
    <CalcCard
      title="Position sizing"
      blurb="Fixed-fractional sizing: risks a set % of your account on the distance between entry and stop. A calculator, not a recommendation to enter any position."
    >
      <div className="grid grid-cols-2 gap-3">
        <CalcField label={`Account value (${currencySymbol(prefs)})`}>
          <input
            type="number"
            min={0}
            max={MAX_AMOUNT_INPUT}
            value={accountValue}
            onChange={(e) => setAccountValue(e.target.value)}
            placeholder="e.g. 50000"
            className={CALC_INPUT}
          />
        </CalcField>
        <CalcField label="Risk per trade (%)">
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            placeholder="e.g. 1"
            className={CALC_INPUT}
          />
        </CalcField>
        <CalcField label={`Entry price (${currencySymbol(prefs)})`}>
          <input
            type="number"
            min={0}
            max={MAX_AMOUNT_INPUT}
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="e.g. 182.50"
            className={CALC_INPUT}
          />
        </CalcField>
        <CalcField label={`Stop price (${currencySymbol(prefs)})`}>
          <input
            type="number"
            min={0}
            max={MAX_AMOUNT_INPUT}
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            placeholder="e.g. 175.00"
            className={CALC_INPUT}
          />
        </CalcField>
      </div>

      {hasInputs && (
        <div className="mt-4 rounded-panel border border-line bg-canvas p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-caption text-muted">Share quantity</span>
            <span
              className="font-serif text-h1 tabular-nums text-primary"
              title={result.shareQty.toLocaleString()}
            >
              {formatCompactNumber(result.shareQty)}
            </span>
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
