"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_TOOLTIP, CHART_AXIS_TICK, CHART_GRID } from "@/lib/chart-theme";
import { CALC_INPUT, CalcCard, CalcField, CalcStat } from "@/components/calculators/calc-primitives";
import { clampAmount, clampRate, MAX_AMOUNT_INPUT, MAX_RATE_INPUT, MIN_RATE_INPUT } from "@/lib/input-limits";
import { project, requiredMonthlyContribution } from "@/lib/projection";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatAmount } from "@/lib/display-prefs";

// Retirement / long-horizon growth projection. Standalone by design: it reads
// nothing from the user's portfolio and stores nothing unless they save a goal
// elsewhere, matching the roadmap's "standalone, no persistence unless saved".



export function GrowthProjector() {
  // Amounts here are typed in by the reader, so they are labelled in the
  // display currency but never converted - see formatAmount().
  const prefs = useDisplayPrefs();
  const money = (n: number) =>
    Math.abs(n) >= 1e7
      ? formatAmount(n, prefs, { notation: "compact", maximumFractionDigits: 2 })
      : formatAmount(n, prefs, { maximumFractionDigits: 0 });
  const [startingBalance, setStarting] = useState(25000);
  const [monthlyContribution, setMonthly] = useState(750);
  const [annualReturnPct, setReturn] = useState(7);
  const [inflationPct, setInflation] = useState(2.5);
  const [annualFeePct, setFee] = useState(0.2);
  const [years, setYears] = useState(25);
  const [withdrawalRate, setWithdrawal] = useState(4);
  const [target, setTarget] = useState(1000000);

  const result = useMemo(
    () => project({ startingBalance, monthlyContribution, annualReturnPct, inflationPct, annualFeePct, years }),
    [startingBalance, monthlyContribution, annualReturnPct, inflationPct, annualFeePct, years],
  );

  const needed = useMemo(
    () => requiredMonthlyContribution({ startingBalance, annualReturnPct, inflationPct, annualFeePct, years }, target),
    [startingBalance, annualReturnPct, inflationPct, annualFeePct, years, target],
  );

  // Amounts clamp to [0, MAX_AMOUNT_INPUT]; percentage rates clamp to
  // [MIN_RATE_INPUT, MAX_RATE_INPUT] (return may be negative, fee/inflation/
  // withdrawal may not) so a "700" typo can't compound the projection into
  // nonsense; only the year count passes through (its own min/max on the input).
  const num =
    (setter: (n: number) => void, opts: { amount?: boolean; rate?: boolean; allowNegative?: boolean } = {}) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value);
      if (!Number.isFinite(v)) return setter(0);
      if (opts.amount) return setter(clampAmount(v));
      if (opts.rate) return setter(clampRate(v, { allowNegative: opts.allowNegative ?? false }));
      setter(v);
    };

  return (
    <CalcCard
      title="Growth & retirement projection"
      blurb="Compounds a balance forward at a rate you choose, month by month, with contributions applied before each month's growth. It is arithmetic on your assumptions - not a forecast of any market, and not advice about any position you hold."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <CalcField label="Starting balance">
          <input type="number" min={0} max={MAX_AMOUNT_INPUT} value={startingBalance} onChange={num(setStarting, { amount: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Monthly contribution">
          <input type="number" min={0} max={MAX_AMOUNT_INPUT} value={monthlyContribution} onChange={num(setMonthly, { amount: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Years">
          <input type="number" min={1} max={80} value={years} onChange={num(setYears)} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Annual return %">
          <input type="number" step={0.1} min={MIN_RATE_INPUT} max={MAX_RATE_INPUT} value={annualReturnPct} onChange={num(setReturn, { rate: true, allowNegative: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Annual fees %">
          <input type="number" step={0.05} min={0} max={MAX_RATE_INPUT} value={annualFeePct} onChange={num(setFee, { rate: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Inflation %">
          <input type="number" step={0.1} min={0} max={MAX_RATE_INPUT} value={inflationPct} onChange={num(setInflation, { rate: true })} className={CALC_INPUT} />
        </CalcField>
      </div>

      <div className="mt-4.5 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 border-t border-line-soft pt-4">
        <CalcStat label={`Balance in ${years}y`} value={money(result.finalBalance)} sub="nominal" />
        <CalcStat
          label="In today's money"
          value={money(result.finalRealBalance)}
          sub={`deflated at ${inflationPct}% a year`}
        />
        <CalcStat label="You contribute" value={money(result.totalContributed)} sub="starting balance + deposits" />
        <CalcStat
          label="Growth"
          value={money(result.totalGrowth)}
          tone={result.totalGrowth >= 0 ? "positive" : "negative"}
          sub={`net of ${annualFeePct}% fees`}
        />
      </div>

      <div className="mt-4 h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={result.rows} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="projectionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="year" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis
              width={54}
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (Number(v) >= 1e6 ? `${(Number(v) / 1e6).toFixed(1)}M` : `${Math.round(Number(v) / 1000)}K`)}
            />
            <Tooltip
              formatter={(value, name) => [money(Number(value)), String(name)] as [string, string]}
              labelFormatter={(l) => `Year ${l}`}
              {...CHART_TOOLTIP}
            />
            <Area type="monotone" dataKey="balance" name="Balance" stroke="var(--color-accent)" strokeWidth={2} fill="url(#projectionFill)" isAnimationActive={false} />
            {/* Contributions drawn against the balance, so the gap between the
                two lines is exactly the growth - the figure the stat above
                reports, rather than a separate calculation. */}
            <Line type="monotone" dataKey="contributed" name="Contributed" stroke="var(--color-muted)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 border-t border-line-soft pt-4">
        <CalcField label="Target balance">
          <input type="number" min={0} max={MAX_AMOUNT_INPUT} value={target} onChange={num(setTarget, { amount: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcField label="Withdrawal rate %">
          <input type="number" step={0.1} min={0} max={MAX_RATE_INPUT} value={withdrawalRate} onChange={num(setWithdrawal, { rate: true })} className={CALC_INPUT} />
        </CalcField>
        <CalcStat
          label="To hit the target"
          value={needed === null ? "Out of reach" : `${money(needed)}/mo`}
          sub={
            needed === null
              ? `Not reachable in ${years} years at ${annualReturnPct}% - lengthen the horizon or lower the target`
              : needed === 0
                ? "Already met with no further contributions"
                : "required monthly contribution"
          }
        />
        <CalcStat
          label={`${withdrawalRate}% of the final balance`}
          value={money(result.withdrawalAtRate(withdrawalRate))}
          sub="per year, before tax"
        />
      </div>

      <p className="mt-3.5 text-caption leading-relaxed text-dim text-pretty">
        A constant annual return is a modelling assumption, not something markets do - real sequences vary, and a poor
        run of years early in a withdrawal phase produces a materially different outcome from the same average return
        arriving later. Fees are applied as a drag on the return rather than a year-end charge. Nothing here accounts
        for tax, and nothing here is advice.
      </p>
    </CalcCard>
  );
}
