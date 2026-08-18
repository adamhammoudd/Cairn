"use client";

import { useActionState } from "react";
import { requestAnalysis } from "@/lib/actions/analysis";
import { SubmitButton } from "@/components/auth/submit-button";

export function RequestForm() {
  const [result, formAction] = useActionState(requestAnalysis, null);

  return (
    <form action={formAction}>
      <div>Request an analysis</div>
      <div>
        <label>
          <span>Scope</span>
          <select
            name="scope_type"
            defaultValue="ticker"

 >
            <option value="market">
              Market
            </option>
            <option value="sector">
              Sector
            </option>
            <option value="ticker">
              Ticker
            </option>
          </select>
        </label>
        <label>
          <span>Value</span>
          <input
            name="scope_value"
            placeholder="e.g. AAPL, semiconductors, broad_market"
            required

 />
        </label>
        <SubmitButton>Generate</SubmitButton>
      </div>
      {result && result !== "saved" && <p>{result}</p>}
    </form>
  );
}
