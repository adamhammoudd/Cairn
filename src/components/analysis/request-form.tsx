"use client";

import { useActionState } from "react";
import { requestAnalysis } from "@/lib/actions/analysis";
import { SubmitButton } from "@/components/auth/submit-button";
import { FIELD_LABEL } from "@/components/field-label";

export function RequestForm() {
  const [result, formAction] = useActionState(requestAnalysis, null);

  return (
    <form action={formAction} className="rounded-card border border-line bg-panel p-6">
      <div className="mb-4 text-xs tracking-[0.08em] text-muted uppercase">Request an analysis</div>
      <div className="flex items-end gap-3">
        <label className="w-40">
          <span className={FIELD_LABEL}>Scope</span>
          <select
            name="scope_type"
            defaultValue="ticker"
            className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
          >
            <option value="market" className="bg-panel">
              Market
            </option>
            <option value="sector" className="bg-panel">
              Sector
            </option>
            <option value="ticker" className="bg-panel">
              Ticker
            </option>
          </select>
        </label>
        <label className="flex-1">
          <span className={FIELD_LABEL}>Value</span>
          <input
            name="scope_value"
            placeholder="e.g. AAPL, semiconductors, broad_market"
            required
            className="w-full rounded-lg border border-line bg-active px-3 py-2 text-sm text-primary outline-none"
          />
        </label>
        <SubmitButton>Generate</SubmitButton>
      </div>
      {result && result !== "saved" && <p className="mt-3 text-[13px] text-negative">{result}</p>}
    </form>
  );
}
