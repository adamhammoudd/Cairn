"use client";

import { useState } from "react";
import { getFinancialStatements } from "@/lib/actions/reference";
import { useLazyPanel } from "@/components/ticker/use-lazy-panel";
import type { StatementKind, PeriodType } from "@/lib/market-data/reference";
import { ScrollX } from "@/components/scroll-x";

const STATEMENTS: { id: StatementKind; label: string }[] = [
  { id: "income", label: "Income" },
  { id: "balance", label: "Balance sheet" },
  { id: "cash_flow", label: "Cash flow" },
];

// Reported figures only. A line the filing did not contain is omitted from the
// table rather than rendered as a dash beside real numbers - a blank cell in a
// financial statement reads as "reported zero", which is a different claim.
function compact(value: number | undefined, currency: string | null): string {
  if (value === undefined) return "";
  const abs = Math.abs(value);
  const unit = abs >= 1e12 ? ["T", 1e12] : abs >= 1e9 ? ["B", 1e9] : abs >= 1e6 ? ["M", 1e6] : abs >= 1e3 ? ["K", 1e3] : ["", 1];
  const scaled = value / (unit[1] as number);
  const sign = value < 0 ? "-" : "";
  // No currency on the row means it isn't known: show the number with no
  // symbol (the header says "currency unknown") rather than guess a "$".
  const symbol = currency === "USD" ? "$" : currency === null ? "" : `${currency} `;
  return `${sign}${symbol}${Math.abs(scaled).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit[0]}`;
}

export function StatementsPanel({ symbol }: { symbol: string }) {
  const [statement, setStatement] = useState<StatementKind>("income");
  const [periodType, setPeriodType] = useState<PeriodType>("annual");
  const { data: table, loading } = useLazyPanel(`${symbol}|${statement}|${periodType}`, () =>
    getFinancialStatements(symbol, statement, periodType),
  );

  const currency = table?.periods[0]?.currency ?? null;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex gap-1 rounded-panel border border-line p-1">
          {STATEMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatement(s.id)}
              className={`rounded-control px-3 py-1.5 font-mono text-micro transition-colors duration-base ease-standard ${
                statement === s.id ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-panel border border-line p-1">
          {(["annual", "quarterly"] as PeriodType[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriodType(p)}
              className={`rounded-control px-3 py-1.5 font-mono text-micro capitalize transition-colors duration-base ease-standard ${
                periodType === p ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="px-4 py-10 text-center text-lead text-muted">Checking for filed statements on {symbol}…</p>
      ) : !table || table.periods.length === 0 ? (
        <p className="mx-auto max-w-[52ch] px-4 py-10 text-center text-body text-muted text-pretty">{table?.detail}</p>
      ) : (
        <ScrollX label={`${symbol} ${statement} statement`} hintClassName="sm:hidden">
          <table className="w-full min-w-[560px] border-collapse text-body">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-3 text-left font-mono text-eyebrow text-dim uppercase">
                  {currency ? `Line item · ${currency}` : table && table.periods.length > 0 ? "Line item · currency unknown" : "Line item"}
                </th>
                {table.periods.map((p) => (
                  <th key={p.period_end} className="px-4 py-3 text-right font-mono text-eyebrow text-dim uppercase">
                    {p.period_end}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.lines.map((line) => (
                <tr key={line.key} className="border-b border-line-soft last:border-b-0 hover:bg-active">
                  <td className={`px-4 py-2.5 ${line.emphasis ? "text-primary" : "text-muted"}`}>{line.label}</td>
                  {table.periods.map((p) => (
                    <td
                      key={p.period_end}
                      className={`px-4 py-2.5 text-right tabular-nums ${line.emphasis ? "text-primary" : "text-muted"}`}
                    >
                      {compact(p.line_items[line.key], p.currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-caption text-dim">
            As filed with the market-data provider. Only lines the filing reported are listed - an omitted line is left
            out rather than shown as zero. Figures are not restated, adjusted, or estimated by Cairn.
          </p>
        </ScrollX>
      )}
    </div>
  );
}
