// Audit 2026-09-04, finding #7: two Settings actions trusted the session alone.
//
//  - changePassword() required only an active session, not the current
//    password - a hijacked cookie / unattended device / XSS could set a new
//    password and lock the owner out.
//  - deleteAccount() enforced the "type DELETE" confirmation client-side only;
//    the server action is a plain callable endpoint.
//
// The decision logic is in lib/settings-guards.ts (pure); the re-auth and the
// admin delete stay in the action. This tests the gate and the client wiring.
//
// Run: npx tsx --conditions=react-server scripts/tests/settings-auth.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { passwordChangeError, deleteConfirmationError } from "../../src/lib/settings-guards";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- password change: current-password confirmation ------------------
check("no current password is rejected", passwordChangeError("", "brand-new-passphrase") === "Enter your current password.");
check("new password under 8 chars is rejected", passwordChangeError("old-one", "short")?.includes("8 characters") === true);
check("new === current is rejected", passwordChangeError("samesame12", "samesame12")?.includes("different") === true);
check("a valid change passes the gate (re-auth happens next)", passwordChangeError("old-one", "a-fresh-passphrase") === null);

// --- account deletion: server-side confirmation --------------------
check("no confirmation is refused", deleteConfirmationError(undefined) === "Type DELETE to confirm account deletion.");
check("lowercase 'delete' is refused", deleteConfirmationError("delete") !== null);
check("'DELETE ' with trailing space is refused", deleteConfirmationError("DELETE ") !== null);
check("exactly 'DELETE' is accepted", deleteConfirmationError("DELETE") === null);

// --- the action actually uses the guards, and the client wires them --
const ROOT = join(import.meta.dirname, "..", "..");
const action = readFileSync(join(ROOT, "src/lib/actions/settings.ts"), "utf8");
check("changePassword calls passwordChangeError", /passwordChangeError\(/.test(action));
check("changePassword re-authenticates with signInWithPassword", /signInWithPassword\(/.test(action));
check("deleteAccount calls deleteConfirmationError", /deleteConfirmationError\(/.test(action));
check("deleteAccount takes a confirmation argument", /deleteAccount\(confirmation/.test(action));

const form = readFileSync(join(ROOT, "src/components/settings/change-password-form.tsx"), "utf8");
check('change-password-form renders name="current_password"', /name="current_password"/.test(form));

const danger = readFileSync(join(ROOT, "src/components/settings/danger-zone.tsx"), "utf8");
check("danger-zone passes the typed word to deleteAccount()", /deleteAccount\(word\)/.test(danger));

console.log(`\n${pass}/${pass + fail} settings-auth cases passed`);
process.exit(fail === 0 ? 0 : 1);
