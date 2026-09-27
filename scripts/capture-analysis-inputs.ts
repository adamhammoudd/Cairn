// Capture the real TextInputs for some tickers into a test fixture, so the
// analysis-title suite runs against real data offline. Read-only.
//
// Run: npx tsx --conditions=react-server scripts/capture-analysis-inputs.ts NVDA MSFT@2026-09-26T22:57:58Z ... > fixture.json
// SYM@<ISO time> captures the inputs as they were at that moment (the news
// published by then), for replaying a draft written at that time.
import "./tests/env";
import { inputsAsOf } from "./replay-analysis-drafts";

async function main() {
  const symbols = process.argv.slice(2);
  const at = new Date().toISOString();
  const out: Record<string, unknown> = {};
  for (const arg of symbols) {
    const [s, when] = arg.split("@");
    out[arg] = await inputsAsOf(s, when ?? at);
  }
  process.stdout.write(JSON.stringify({ capturedAt: at, inputs: out }, null, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
