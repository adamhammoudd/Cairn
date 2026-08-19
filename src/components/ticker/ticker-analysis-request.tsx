"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestAnalysis } from "@/lib/actions/analysis";

export function TickerAnalysisRequest({ symbol }: { symbol: string }) {
  const [result, formAction] = useActionState(requestAnalysis, null);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-panel px-4.5 py-3.5"
    >
      <input type="hidden" name="scope_type" value="ticker" />
      <input type="hidden" name="scope_value" value={symbol} />
      <div className="min-w-0">
        <div className="font-mono text-[9.5px] tracking-[0.14em] text-accent uppercase">Cairn analysis</div>
        <p className="mt-1.5 text-[13px] text-muted">
          Probability-weighted read on {symbol}, with sources, historical analogs, and confidence.
        </p>
      </div>
      <GenerateButton />
      {result && result !== "saved" && <p className="w-full text-[13px] text-negative">{result}</p>}
    </form>
  );
}

// The shared auth SubmitButton is full-width by design, which swallowed this
// row; this card needs a button sized to its own label.
function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark px-4.25 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)] disabled:opacity-60"
    >
      {pending ? "Generating…" : "Generate"}
    </button>
  );
}
