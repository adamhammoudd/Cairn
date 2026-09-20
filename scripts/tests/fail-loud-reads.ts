// Audit 2026-09-04, finding #5: "fail loudly instead of silently returning
// empty/$0".
//
// lib/supabase/read.ts exists so a failed database read throws a named
// DataReadError instead of resolving to `[]` / `$0` - a wrong reading, not a
// degraded one, on a financial surface. runScreen adopted it; Watchlists and
// Comparison did not - they kept `data ?? []`.
//
// This is a structural regression lock, in the style of settings-wiring.ts:
// for each of the server-action modules, every price/holdings/list read
// must go through unwrap/unwrapRows, and none of the specific swallows that
// were removed may come back.
//
// Run: npx tsx --conditions=react-server scripts/tests/fail-loud-reads.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

interface Target {
  file: string;
  /** Minimum number of reads that must be routed through the helper. */
  minUnwraps: number;
  /** Swallows that were removed and must not reappear (checked against raw source). */
  bannedSwallows: string[];
}

const TARGETS: Target[] = [
  {
    file: "src/lib/actions/watchlists.ts",
    minUnwraps: 6,
    bannedSwallows: ["items ?? []", "(items ?? [])", "prices ?? []", "coinRows ?? []", "ownedIds ?? []", "!lists ||"],
  },
  {
    file: "src/lib/actions/comparison.ts",
    minUnwraps: 5,
    bannedSwallows: ["(data ?? [])", "barRows ?? []", "fundamentals ?? []", "directory ?? []", "coins ?? []"],
  },
];

for (const t of TARGETS) {
  const raw = readFileSync(join(ROOT, t.file), "utf8");
  const code = stripComments(raw);
  const name = t.file.replace("src/lib/actions/", "");

  check(`${name}: imports the fail-loud read helper`, /from "@\/lib\/supabase\/read"/.test(code), "");

  const unwraps = (code.match(/\bunwrap(?:Rows)?\(/g) ?? []).length;
  check(`${name}: routes every read through unwrap/unwrapRows (>= ${t.minUnwraps})`, unwraps >= t.minUnwraps, `found ${unwraps}`);

  // No table/rpc read whose error is dropped by destructuring `data` off the
  // await. `{ data: { user } }` (auth) and `.maybeSingle()` guards that return
  // a user-visible message are the only allowed `data:` destructures.
  const dataDestructures = [...code.matchAll(/\{\s*data:\s*(\w+)\s*\}\s*=\s*await\s+supabase\s*\.?\s*\n?\s*\.(from|rpc)\(/g)];
  const rowSwallows = dataDestructures.filter((m) => !["owned", "tracked"].includes(m[1]));
  check(
    `${name}: no read destructures { data } off a list/rpc query`,
    rowSwallows.length === 0,
    rowSwallows.length ? rowSwallows.map((m) => `{ data: ${m[1]} }`).join(", ") : "clean",
  );

  for (const swallow of t.bannedSwallows) {
    const gone = !code.includes(swallow);
    check(`${name}: swallow "${swallow}" stays removed`, gone, gone ? "" : "REINTRODUCED");
  }
}

console.log(`\n${pass}/${pass + fail} fail-loud-read cases passed`);
process.exit(fail === 0 ? 0 : 1);
