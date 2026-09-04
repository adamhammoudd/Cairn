// Tests for src/lib/input-limits.ts.
//
// clampRate added for audit 2026-09-04 (medium): the growth-projector's rate
// inputs (annual return, inflation, fee, withdrawal) had no bounds, so a "700"
// typo instead of "7" compounded the projection into a meaningless number.
//
// Run: npx tsx --conditions=react-server scripts/tests/input-limits.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clampAmount, clampRate, MAX_AMOUNT_INPUT, MAX_RATE_INPUT, MIN_RATE_INPUT } from "../../src/lib/input-limits";
import { project } from "../../src/lib/projection";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- clampAmount (unchanged, pinned) --------------------------------
check("clampAmount floors at 0", clampAmount(-5) === 0);
check("clampAmount caps at MAX_AMOUNT_INPUT", clampAmount(MAX_AMOUNT_INPUT * 10) === MAX_AMOUNT_INPUT);
check("clampAmount passes a normal value", clampAmount(25000) === 25000);
check("clampAmount handles NaN", clampAmount(NaN) === 0);

// --- clampRate -----------------------------------------------------
check("a fat-fingered 700 clamps to the max", clampRate(700) === MAX_RATE_INPUT);
check("a normal 7 passes through", clampRate(7) === 7);
check("negative return is allowed when allowNegative", clampRate(-30, { allowNegative: true }) === -30);
check("negative return clamps to the floor when allowNegative", clampRate(-999, { allowNegative: true }) === MIN_RATE_INPUT);
check("negative is floored to 0 by default (fee / inflation / withdrawal)", clampRate(-4) === 0);
check("NaN -> 0", clampRate(NaN) === 0);

// --- the point of it: a typo can't blow up the projection ----------
{
  const sane = project({ startingBalance: 25000, monthlyContribution: 750, annualReturnPct: clampRate(7, { allowNegative: true }), inflationPct: 2.5, annualFeePct: 0.2, years: 25 });
  const typo = project({ startingBalance: 25000, monthlyContribution: 750, annualReturnPct: clampRate(700, { allowNegative: true }), inflationPct: 2.5, annualFeePct: 0.2, years: 25 });
  const unclamped = project({ startingBalance: 25000, monthlyContribution: 750, annualReturnPct: 700, inflationPct: 2.5, annualFeePct: 0.2, years: 25 });
  check("clamped 700 keeps the projection finite", Number.isFinite(typo.finalBalance), `${typo.finalBalance}`);
  check("clamping cuts an unclamped 700%/yr result down by orders of magnitude", typo.finalBalance < unclamped.finalBalance / 1e6, `${typo.finalBalance} vs ${unclamped.finalBalance}`);
  check("clamped 700 (=100%) still produces a bigger number than 7%", typo.finalBalance > sane.finalBalance);
}

// --- the projector wires clampRate into every rate field ----------
const gp = readFileSync(join(import.meta.dirname, "..", "..", "src/components/calculators/growth-projector.tsx"), "utf8");
for (const setter of ["setReturn", "setFee", "setInflation", "setWithdrawal"]) {
  check(`growth-projector: ${setter} goes through clampRate`, new RegExp(`num\\(${setter},\\s*\\{\\s*rate:\\s*true`).test(gp));
}
check("only the return field allows a negative rate", /num\(setReturn,\s*\{\s*rate:\s*true,\s*allowNegative:\s*true/.test(gp));

console.log(`\n${pass}/${pass + fail} input-limits cases passed`);
process.exit(fail === 0 ? 0 : 1);
