"use client";

import { useMemo, useState } from "react";
import { computePositionSize } from "@/lib/planning";

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
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="mb-1 text-[15px] font-semibold text-primary">Position sizing</div>
      <p className="mb-5 text-[12.5px] text-dim">
        Fixed-fractional sizing: risks a set % of your account on the distance between entry and stop. A
        calculator, not a recommendation to enter any position.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
          Account value ($)
          <input
            value={accountValue}
            onChange={(e) => setAccountValue(e.target.value)}
            placeholder="e.g. 50000"
            className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
          Risk per trade (%)
          <input
            value={riskPct}
            onChange={(e) => setRiskPct(e.target.value)}
            placeholder="e.g. 1"
            className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
          Entry price ($)
          <input
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="e.g. 182.50"
            className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] text-muted">
          Stop price ($)
          <input
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            placeholder="e.g. 175.00"
            className="rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          />
        </label>
      </div>

      {hasInputs && (
        <div className="mt-6 grid grid-cols-4 gap-4 border-t border-line pt-5">
          <Stat label="Risk amount" value={fmtCurrency(result.riskAmount)} />
          <Stat label="Risk / share" value={fmtCurrency(result.riskPerShare)} />
          <Stat label="Share quantity" value={result.shareQty.toLocaleString()} />
          <Stat label="Position value" value={`${fmtCurrency(result.positionValue)} (${result.positionPctOfAccount.toFixed(1)}% of account)`} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] tracking-[0.06em] text-muted uppercase">{label}</div>
      <div className="text-[14px] text-primary">{value}</div>
    </div>
  );
}
