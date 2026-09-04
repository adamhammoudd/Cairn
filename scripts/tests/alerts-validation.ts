// Audit 2026-09-04, finding #6: alerts.ts had no server-side format check on
// scope_value (the watchlist symbol field was hardened after "ZZQQ9!!" became a
// permanent dead row) and no bounds check on cooldown_seconds - a negative
// value was stored verbatim and defeated the alert's only anti-spam gate
// (last_triggered_at + cooldown_seconds).
//
// Run: npx tsx --conditions=react-server scripts/tests/alerts-validation.ts

import { validateAlertScope } from "../../src/lib/validation";
import { parseCooldownSeconds, DEFAULT_COOLDOWN_SECONDS, MAX_COOLDOWN_SECONDS } from "../../src/lib/alerts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- scope_value format ------------------------------------------------
check("valid ticker passes and is upper-cased", (() => {
  const r = validateAlertScope("nvda", "price");
  return r.ok && r.value === "NVDA";
})());

check("ticker with class suffix passes", validateAlertScope("BRK.B", "price").ok);

for (const junk of ["ZZQQ9!!", "'; DROP TABLE alerts;--", "a".repeat(40), "  ", "<script>"]) {
  check(`junk scope ${JSON.stringify(junk)} is rejected`, !validateAlertScope(junk, "price").ok);
}

check("a sector is rejected for a price alert", !validateAlertScope("semiconductors", "price").ok);
check("a known sector is accepted for an ai_confidence alert (as its slug)", (() => {
  const r = validateAlertScope("Semiconductors", "ai_confidence");
  return r.ok && r.value === "semiconductors";
})());
// "Shipping" alone is a shape-valid ticker (validateSymbol is shape-only, same
// as the watchlist field) so it is accepted as a symbol; a string that is
// neither a valid symbol shape nor a known sector is rejected.
check(
  "text that is neither a valid symbol nor a known sector is rejected for ai_confidence",
  !validateAlertScope("Shipping & Logistics", "ai_confidence").ok,
);

// --- cooldown bounds -------------------------------------------------
check("blank cooldown falls back to the 1h default", parseCooldownSeconds("") === DEFAULT_COOLDOWN_SECONDS);
check("null cooldown falls back to the default", parseCooldownSeconds(null) === DEFAULT_COOLDOWN_SECONDS);
check("a normal cooldown passes through as an integer", parseCooldownSeconds("21600") === 21600);
check("a fractional cooldown is floored", parseCooldownSeconds("3600.9") === 3600);
check("zero is rejected", typeof parseCooldownSeconds("0") === "string");
check("a negative cooldown is rejected (was stored verbatim)", typeof parseCooldownSeconds("-5") === "string");
check("NaN / non-numeric is rejected", typeof parseCooldownSeconds("soon") === "string");
check("a cooldown past 30 days is rejected", typeof parseCooldownSeconds(String(MAX_COOLDOWN_SECONDS + 1)) === "string");
check("exactly 30 days is allowed", parseCooldownSeconds(String(MAX_COOLDOWN_SECONDS)) === MAX_COOLDOWN_SECONDS);

console.log(`\n${pass}/${pass + fail} alerts-validation cases passed`);
process.exit(fail === 0 ? 0 : 1);
