// The name field on sign-up (src/lib/display-name.ts, signUp in lib/actions/auth.ts).
//
// Pure rules are run directly; the server action needs Supabase, so its
// ordering and its no-half-created-account guarantee are checked two ways: the
// real claim code against an in-memory store with a createAccount that fails the
// way a failed name save would, and source assertions on the action itself.
// Nothing here touches a database, sends mail, or creates an account.
//
// Run: npx tsx --conditions=react-server scripts/tests/signup-name.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { initialsOf, isNameError, NAME_MAX_LENGTH, NAME_REQUIRED, validateDisplayName } from "@/lib/display-name";
import { claimInviteAndCreateAccount } from "@/lib/beta-invites/claim";
import { runInviteJob } from "@/lib/beta-invites/job";
import { renderChildEnv } from "./render-helper";
import { codeFrom, createFakeStore, createMockMailer } from "./beta-invite-fakes";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

// react-dom/server will not load under the react-server condition, so a REAL component is rendered in a child process.
function render(modulePath: string, exportName: string, props: object): string {
  return execFileSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(ROOT, "scripts/tests/render-component.ts"), modulePath, exportName, JSON.stringify(props)], { cwd: ROOT, encoding: "utf8", env: renderChildEnv() });
}

export async function runSignupNameSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });
  const valid = (raw: unknown) => {
    const r = validateDisplayName(raw);
    return r.ok ? r.value : null;
  };

  // ---------------- validation ----------------
  check("a valid name is accepted and trimmed", valid("  Alex Martin ") === "Alex Martin", String(valid("  Alex Martin ")));
  check("accents are accepted (Élodie Dupont)", valid("Élodie Dupont") === "Élodie Dupont", "accents");
  check("an apostrophe is accepted (D'Angelo) and a hyphen (Anne-Marie)", valid("D'Angelo") === "D'Angelo" && valid("Anne-Marie O’Neil") === "Anne-Marie O’Neil", "punctuation");
  check("non-Latin scripts are accepted", valid("李小龍") === "李小龍" && valid("Åsa Ödman") === "Åsa Ödman" && valid("محمد") === "محمد", "scripts");
  check(`exactly ${NAME_MAX_LENGTH} characters is accepted`, valid("a".repeat(NAME_MAX_LENGTH)) !== null, "80");
  const long = validateDisplayName("a".repeat(NAME_MAX_LENGTH + 1));
  check(`${NAME_MAX_LENGTH + 1} characters is rejected with a name-field message`, !long.ok && isNameError(long.error), long.ok ? "accepted" : long.error);
  check("length counts characters, not UTF-16 units (80 astral letters pass)", valid("𠮷".repeat(NAME_MAX_LENGTH)) !== null, "astral");
  const empty = validateDisplayName("   ");
  check(
    `empty / blank follows the decision (NAME_REQUIRED=${NAME_REQUIRED}): ${NAME_REQUIRED ? "rejected" : "accepted as no name"}`,
    NAME_REQUIRED ? !empty.ok && isNameError(empty.error) : empty.ok && empty.value === "",
    JSON.stringify(empty),
  );
  check("a missing / non-string value is treated as blank, never throws", validateDisplayName(null).ok === !NAME_REQUIRED && validateDisplayName(undefined).ok === !NAME_REQUIRED && validateDisplayName(42).ok === !NAME_REQUIRED, "types");
  check("emoji are rejected", !validateDisplayName("Alex 😀").ok && !validateDisplayName("🚀").ok, "emoji");
  check("control characters are rejected (newline, tab, NUL, DEL)", ["Alex\nMartin", "Alex\tMartin", "Alex\u0000", "Alex\u007f"].every((n) => !validateDisplayName(n).ok), "controls");
  check("bidi override characters are rejected", !validateDisplayName("Alex‮nitraM").ok && !validateDisplayName("⁦Alex").ok, "bidi");

  // ---------------- hostile text ----------------
  const script = "<script>alert(1)</script>";
  check("<script> text passes validation as plain text (stored harmlessly, never executed)", valid(script) === script, "stored as-is");
  const inField = render("src/components/auth/field.tsx", "Field", { id: "name", label: "Your name", name: "name", defaultValue: script, error: "Bad <b>name</b>" });
  check("rendered through a React field it is escaped: no live <script> or <b> tag", !/<script>/.test(inField) && !/<b>/.test(inField) && inField.includes("&lt;script&gt;"), "escaped");
  const inBadge = render("src/components/auth/field.tsx", "Field", { id: "x", label: script });
  check("a hostile label or value is escaped too", !/<script>/.test(inBadge) && inBadge.includes("&lt;script&gt;"), "escaped");
  const rendering = ["src/components/layout/top-nav.tsx", "src/app/(app)/layout.tsx", "src/app/(auth)/signup/signup-form.tsx", "src/components/auth/field.tsx", "src/components/settings/profile-form.tsx"].map(read).join("\n");
  check("no name-rendering file uses dangerouslySetInnerHTML", !/dangerouslySetInnerHTML/.test(rendering), "source");
  const emailSrc = ["src/lib/beta-invites/email.ts", "src/lib/waitlist.ts"].map(read).join("\n");
  check("no email template renders a user's name today (nothing to escape; revisit before one does)", !/display_name|displayName|\bname\b\s*[}$]/.test(emailSrc), "source");

  // ---------------- initials badge ----------------
  const initials: [string, string][] = [
    ["Adam", "AD"], ["Adam Hammoud", "AH"], ["Élodie Dupont", "ÉD"], ["élodie", "ÉL"], ["Élodie", "ÉL"],
    ["Åsa Ödman", "ÅÖ"], ["Anne Marie Smith", "AM"], ["  Alex   Martin  ", "AM"], ["D'Angelo", "D'"], ["李小龍", "李小"], ["", "?"], ["   ", "?"],
    ["Élodie".normalize("NFD"), "ÉL"], ["𠮷野 家", "𠮷家"],
  ];
  const badInitials = initials.filter(([n, want]) => initialsOf(n) !== want).map(([n, want]) => `${JSON.stringify(n)}→${initialsOf(n)} (want ${want})`);
  check(`initials: one-word, two-word, accented, decomposed, astral and empty names (${initials.length})`, badInitials.length === 0, badInitials.join("; ") || "ok");
  check("an email-shaped fallback still gives two letters", initialsOf("adam@example.com") === "AD", initialsOf("adam@example.com"));

  // ---------------- account is never half-created ----------------
  {
    const clock = { now: new Date("2026-10-01T15:00:00Z") };
    const fake = createFakeStore(clock);
    const mail = createMockMailer();
    fake.join("alex@example.com");
    await runInviteJob({ store: fake.store, mailer: mail.mailer, origin: "https://cairn.example", premiumUntil: "31 December 2026", now: () => clock.now, config: { enabled: true, maxActiveUsers: 50, invitesPerRun: 5, sendingAllowed: true } });
    const code = codeFrom(mail.sent[0])!;
    const accounts: { email: string; name: string }[] = [];
    // The name rides in createUser's metadata and the handle_new_user trigger
    // writes the profile in the same transaction, so a failed name save is a
    // failed createUser: no auth user, no profile.
    const failing = await claimInviteAndCreateAccount(fake.store, { code, email: "alex@example.com", now: clock.now }, async () => ({ ok: false, message: "Could not create the account." }));
    check("name save fails -> sign-up fails with a clear message and no account exists", !failing.ok && failing.message === "Could not create the account." && accounts.length === 0, JSON.stringify(failing));
    const retry = await claimInviteAndCreateAccount(fake.store, { code, email: "alex@example.com", now: clock.now }, async (email) => {
      accounts.push({ email, name: "Alex Martin" });
      return { ok: true, userId: "u-1" };
    });
    check("the same invite link still works afterwards (the failed attempt released it)", retry.ok && accounts.length === 1 && accounts[0].name === "Alex Martin", JSON.stringify(retry));
    const throwing = await claimInviteAndCreateAccount(fake.store, { code, email: "alex@example.com", now: clock.now }, async () => ({ ok: true, userId: "u-2" })).catch(() => null);
    check("and is then spent: a second sign-up on it creates nothing", throwing !== null && !throwing.ok && accounts.length === 1, JSON.stringify(throwing));
  }

  // ---------------- the action ----------------
  const auth = read("src/lib/actions/auth.ts");
  const signUp = auth.slice(auth.indexOf("export async function signUp"), auth.indexOf("async function recordConsent"));
  const personal = auth.slice(auth.indexOf("async function signUpWithPersonalInvite"), auth.indexOf("export async function forgotPassword"));
  check("signUp validates the name server-side before anything is claimed or created", /validateDisplayName\(formData\.get\("name"\)\)/.test(signUp) && signUp.indexOf("validateDisplayName") < signUp.indexOf("signUpWithPersonalInvite(") && signUp.indexOf("validateDisplayName") < signUp.indexOf("auth.signUp("), "order");
  check("personal-invite path saves the name in the createUser call (display_name metadata)", /createUser\(\{[\s\S]*user_metadata: \{[\s\S]*display_name: input\.name/.test(personal), "source");
  check("open path still saves it as display_name metadata", /supabase\.auth\.signUp\([\s\S]*display_name: name/.test(signUp), "source");
  check("no second write for the name (it goes into profiles via the existing trigger only)", !/from\("profiles"\)/.test(auth) && /new\.raw_user_meta_data->>'display_name'/.test(read("supabase/schema.sql")), "source");
  check("a blank optional name stores nothing rather than an empty string", /\.\.\.\(name \? \{ display_name: name \} : \{\}\)/.test(signUp) && /\.\.\.\(input\.name \? \{ display_name: input\.name \} : \{\}\)/.test(personal), "source");
  check("the invite invariants are untouched (locked email, same redirects)", /redirect\("\/\?welcome=beta"\)/.test(personal) && /redirect\("\/login\?message=account-created"\)/.test(personal) && /email: invitedEmail,/.test(personal), "source");

  // ---------------- the form ----------------
  const form = read("src/app/(auth)/signup/signup-form.tsx");
  const nameAt = form.indexOf('id="name"');
  const emailAt = form.indexOf('id="email"');
  check("the name field comes above the email field", nameAt > 0 && nameAt < emailAt, `${nameAt} < ${emailAt}`);
  check("name input: autocomplete=name, real label (via Field), placeholder, words capitalisation", /autoComplete="name"/.test(form) && /placeholder="e\.g\. Alex Martin"/.test(form) && /autoCapitalize="words"/.test(form) && /<label htmlFor=\{id\}/.test(read("src/components/auth/field.tsx")), "source");
  check("label wording follows the decision", NAME_REQUIRED ? /"Your name"/.test(form) : /Your name \(optional\)/.test(form), `required=${NAME_REQUIRED}`);
  const fieldSrc = read("src/components/auth/field.tsx");
  check("the error sits next to the field, is announced (role=alert) and the input is aria-invalid + described by it", /role="alert"/.test(fieldSrc) && /aria-invalid/.test(fieldSrc) && /aria-describedby/.test(fieldSrc), "source");
  check("the error is words, not colour alone, and does not use the loss red", /\{error\}/.test(fieldSrc) && !/text-(loss|red|negative|danger)/.test(fieldSrc), "source");
  check("the name keeps what was typed after a rejected sign-up (controlled)", /value=\{name\}/.test(form), "source");

  return { suiteName: "Sign-up name (validation, initials, escaping, no half-created account)", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runSignupNameSuite().then((suite) => {
    writeReport([suite]);
    for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
    const failed = suite.cases.filter((c) => c.status === "fail").length;
    console.log(`\n${suite.cases.length - failed}/${suite.cases.length} passed`);
    if (failed) process.exit(1);
  });
}
