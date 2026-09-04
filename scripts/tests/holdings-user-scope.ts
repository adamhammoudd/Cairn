// Audit 2026-09-04 (high-priority, by area): a holdings read on the ticker page
// relied on Postgres RLS alone, unlike every comparable query elsewhere which
// also filters explicitly by user_id as a second line of defence. Not a live
// leak, but the one place a future RLS misconfiguration wouldn't be caught by a
// second guard. The same shape was also in getIntradayPortfolioSeries.
//
// Structural regression lock: every `.from("holdings")` in a read/write path
// must be scoped by user_id (or be on the explicit allowlist below, with a
// reason).
//
// Run: npx tsx --conditions=react-server scripts/tests/holdings-user-scope.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// key: "relpath:approxLine snippet", value: why it's exempt.
const ALLOWLIST: Record<string, string> = {
  // insert() sets user_id in the payload; update()/delete() below filter by it.
  'src/lib/actions/holdings.ts insert': "user_id is in the insert payload, not a filter",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !full.includes("scripts")) out.push(full);
  }
  return out;
}

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
  // Each `.from("holdings")` and the ~240 chars of chained calls after it.
  const re = /\.from\(\s*["']holdings["']\s*\)([\s\S]{0,260})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tail = m[1];
    const isInsert = /^\s*\.insert\(/.test(tail);
    const scoped = /\.eq\(\s*["']user_id["']/.test(tail) || /user_id:\s*\w+\.id/.test(tail);
    const allowKey = isInsert ? "src/lib/actions/holdings.ts insert" : "";
    if (scoped || ALLOWLIST[allowKey]) {
      pass++;
      console.log(`pass  ${rel}: holdings query is user-scoped${isInsert ? " (insert payload)" : ""}`);
    } else {
      fail++;
      console.log(`FAIL  ${rel}: .from("holdings") with no .eq("user_id", ...) - RLS is the backstop, not the only guard`);
    }
  }
}

check("at least one holdings query was checked", pass + fail > 5, `${pass + fail} found`);

console.log(`\n${pass}/${pass + fail} holdings-scope checks passed`);
process.exit(fail === 0 ? 0 : 1);
