"use client";

// Quarterly company figures from SEC filings, in the Full breakdown's
// "Company numbers" row (feat/analysis-summary-layout). Shown in US dollars,
// the currency the figures were FILED in, like the Financials tab: converting
// past quarters at today's exchange rate would print numbers no filing contains.

import type { CompanyNumbersRow } from "@/lib/analysis-summary";
import { perShare } from "@/lib/fundamentals";
import { ScrollX } from "@/components/scroll-x";

const usdCompact = (v: number | null) =>
  v === null ? "-" : v.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export function CompanyNumbersTable({ rows, status }: { rows: CompanyNumbersRow[]; status: "available" | "not_applicable" | "unavailable" }) {
  if (status === "not_applicable") return <p className="m-0 text-body text-muted">Company figures don&apos;t apply: there are no company filings behind this asset.</p>;
  if (rows.length === 0) return <p className="m-0 text-body text-muted">No US company filings are stored for this symbol yet.</p>;
  const cols: [string, (r: CompanyNumbersRow) => string][] = [
    ["Sales", (r) => usdCompact(r.revenue)],
    ["Net profit", (r) => usdCompact(r.netIncome)],
    ["EBITDA", (r) => usdCompact(r.ebitda)],
    ["Free cash flow", (r) => usdCompact(r.freeCashFlow)],
    ["Cash", (r) => usdCompact(r.cash)],
    ["Debt", (r) => usdCompact(r.debt)],
    ["Profit per share", (r) => (r.eps === null ? "-" : perShare(r.eps))],
  ];
  return (
    <div className="flex flex-col gap-3">
      <ScrollX label="Quarterly company figures" hintClassName="lg:hidden">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px] tabular-nums">
          <caption className="sr-only">Quarterly company figures from SEC filings, in US dollars</caption>
          <thead>
            <tr className="border-b border-line-soft font-mono text-eyebrow uppercase text-dim">
              <th scope="col" className="py-2 pr-3 font-normal">
                Quarter
              </th>
              {cols.map(([h]) => (
                <th key={h} scope="col" className="py-2 pr-3 text-right font-normal">
                  {h}
                </th>
              ))}
              <th scope="col" className="py-2 font-normal">
                Filing
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.periodEnd} className="border-b border-line-soft last:border-b-0">
                <th scope="row" className="py-2.5 pr-3 font-normal text-primary">
                  {r.label}
                  {r.derived && <span className="text-muted"> *</span>}
                  <div className="text-micro text-dim">{r.periodEnd}</div>
                </th>
                {cols.map(([h, f]) => (
                  <td key={h} className="py-2.5 pr-3 text-right text-primary/85">
                    {f(r)}
                  </td>
                ))}
                <td className="py-2.5 text-micro">
                  {r.filingUrl ? (
                    <a href={r.filingUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      {r.filingLabel}
                    </a>
                  ) : (
                    <span className="text-dim">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollX>
      <p className="m-0 text-caption leading-[1.55] text-dim">
        Reported in US dollars, as filed with the SEC. EBITDA (profit before interest, tax and write-downs) = operating profit + depreciation
        and amortization. Free cash flow = cash from operations − capital spending. * Some figures in this quarter are derived from the
        filings: a fourth quarter as the full year minus the first three, or a cash-flow quarter as the difference of two year-to-date totals.
      </p>
    </div>
  );
}

