// Run the "Generate analysis" pipeline (everything after the quota gate) for
// some symbols against production data, read-only, and print what the reader
// would see: the analysis that would have been stored, or the failure message
// and its logged reason.
//
// Run (the tsconfig swaps in the read-only Supabase client and the mock LLM):
//   npx tsx --conditions=react-server --tsconfig scripts/harness/tsconfig.readonly.json scripts/harness/repro-generate.ts MU AMD
import "../tests/env";
import { generateForScope } from "@/lib/ai/analysis-pipeline";
import { interceptedWrites, readOnlyClient, resetOverlay } from "./readonly-supabase";

export function summarise(stored: Record<string, unknown>): string {
  const cond = stored.direction_conditions as { basis?: string; fallback?: unknown } | null;
  return `headline="${stored.headline}" | direction ${stored.direction_higher}/${stored.direction_n} higher, basis=${cond?.basis ?? null}${cond?.fallback ? ` fallback=${JSON.stringify(cond.fallback)}` : ""} | band n=${stored.sample_size} | text=${stored.text_source}`;
}

async function main() {
  for (const raw of process.argv.slice(2)) {
    resetOverlay();
    const out = await generateForScope("ticker", raw, { supabaseClient: readOnlyClient() });
    console.log(`\n=== ${raw}`);
    if (out.ok) console.log(`GENERATED (not stored): ${summarise(out.stored)}`);
    else console.log(`FAILED (${out.kind}): ${out.message}${out.gap ? `  [reasons: ${out.gap.reasons.join(", ")}]` : ""}`);
    const writes = interceptedWrites.reduce<Record<string, number>>((m, w) => ((m[`${w.op} ${w.table}`] = (m[`${w.op} ${w.table}`] ?? 0) + w.rows), m), {});
    console.log(`writes intercepted (never sent): ${JSON.stringify(writes)}`);
  }
}

if (process.argv[1]?.endsWith("repro-generate.ts")) void main();
