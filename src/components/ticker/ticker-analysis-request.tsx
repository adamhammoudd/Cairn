"use client";

import { useActionState } from "react";
import { requestAnalysis } from "@/lib/actions/analysis";
import { SubmitButton } from "@/components/auth/submit-button";

export function TickerAnalysisRequest({ symbol }: { symbol: string }) {
  const [result, formAction] = useActionState(requestAnalysis, null);

  return (
    <form action={formAction}>
      <input type="hidden" name="scope_type" value="ticker" />
      <input type="hidden" name="scope_value" value={symbol} />
      <p>Generate a new probability-weighted analysis for {symbol}.</p>
      <SubmitButton>Generate</SubmitButton>
      {result && result !== "saved" && <p>{result}</p>}
    </form>
  );
}
