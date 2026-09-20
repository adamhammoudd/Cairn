// Tests for src/lib/input-limits.ts.
//
// Run: npx tsx --conditions=react-server scripts/tests/input-limits.ts

import { clampAmount, MAX_AMOUNT_INPUT } from "../../src/lib/input-limits";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- clampAmount ----------------------------------------------------
check("clampAmount floors at 0", clampAmount(-5) === 0);
check("clampAmount caps at MAX_AMOUNT_INPUT", clampAmount(MAX_AMOUNT_INPUT * 10) === MAX_AMOUNT_INPUT);
check("clampAmount passes a normal value", clampAmount(25000) === 25000);
check("clampAmount handles NaN", clampAmount(NaN) === 0);

console.log(`\n${pass}/${pass + fail} input-limits cases passed`);
process.exit(fail === 0 ? 0 : 1);
