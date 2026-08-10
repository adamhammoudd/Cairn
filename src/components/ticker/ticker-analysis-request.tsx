"use client";

import { useActionState } from "react";
import { requestAnalysis } from "@/lib/actions/analysis";
import { SubmitButton } from "@/components/auth/submit-button";

export function TickerAnalysisRequest({ symbol }: { symbol: string }) {
  const [result, formAction] = useActionState(requestAnalysis, null);

  return (
    <form action={formAction} className="flex items-center gap-3 rounded-card border border-line bg-panel p-4">
      <input type="hidden" name="scope_type" value="ticker" />
      <input type="hidden" name="scope_value" value={symbol} />
      <p className="flex-1 text-[13px] text-muted">Generate a new probability-weighted analysis for {symbol}.</p>
      <SubmitButton>Generate</SubmitButton>
      {result && result !== "saved" && <p className="text-[13px] text-negative">{result}</p>}
    </form>
  );
}
