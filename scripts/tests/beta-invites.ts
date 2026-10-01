// Personal beta invites (migration 0064, src/lib/beta-invites).
//
// Drives the real job, claim and admin code against an in-memory store that
// mirrors the SQL (beta-invite-fakes.ts) and a mock mailer. Nothing here
// touches a database, sends mail, or creates an account.
//
// Run: npx tsx --conditions=react-server scripts/tests/beta-invites.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  generateInviteCode,
  hashInviteCode,
  inviteHashesMatch,
  isWellFormedInviteCode,
  INVITE_INVALID_MESSAGE,
  INVITE_WRONG_EMAIL_MESSAGE,
} from "@/lib/beta-invites/codes";
import { newInviteSlots, readInviteJobConfig, type InviteJobConfig } from "@/lib/beta-invites/config";
import { buildInviteEmail, INVITE_SUBJECT, NOT_ADVICE_LINE } from "@/lib/beta-invites/email";
import { runInviteJob, type DeliverDeps } from "@/lib/beta-invites/job";
import { checkInvite, claimInviteAndCreateAccount } from "@/lib/beta-invites/claim";
import { adminResend, adminRevoke, adminSendNow } from "@/lib/beta-invites/admin-actions";
import { inviteAllowed, isInviteLinkRequest, isInvitedSignup, isPublicPath } from "@/lib/public-paths";
import { codeFrom, createFakeStore, createMockMailer } from "./beta-invite-fakes";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), "utf8");
const DAY = 86_400_000;

function setup(overrides: Partial<InviteJobConfig> = {}, origin = "https://cairn.example") {
  const clock = { now: new Date("2026-10-01T15:00:00Z") };
  const fake = createFakeStore(clock);
  const mail = createMockMailer();
  const config: InviteJobConfig = { enabled: true, maxActiveUsers: 50, invitesPerRun: 5, sendingAllowed: true, ...overrides };
  const deps: DeliverDeps = { store: fake.store, mailer: mail.mailer, origin, premiumUntil: "31 December 2026", now: () => clock.now };
  const job = () => runInviteJob({ ...deps, config });
  const advance = (days: number) => (clock.now = new Date(clock.now.getTime() + days * DAY));
  return { clock, fake, mail, config, deps, job, advance };
}

/** A createAccount stub that records calls and is slow enough for two requests to overlap. */
function accountFactory() {
  const created: string[] = [];
  const createAccount = async (email: string) => {
    await new Promise((r) => setTimeout(r, 5));
    created.push(email);
    return { ok: true as const, userId: `user-${created.length}` };
  };
  return { created, createAccount };
}

export async function runBetaInvitesSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // Every console.error in this suite is captured: no code may ever be logged.
  const logged: string[] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
  const issuedCodes: string[] = [];

  try {
    // ---------------- codes ----------------
    const codes = Array.from({ length: 2000 }, generateInviteCode);
    check("codes are 32 URL-safe characters (24 CSPRNG bytes)", codes.every((c) => /^[A-Za-z0-9_-]{32}$/.test(c)), codes[0].replace(/./g, "x"));
    check("2000 generated codes are all distinct", new Set(codes).size === 2000, String(new Set(codes).size));
    const h = hashInviteCode(codes[0]);
    check("the stored form is a 64-char SHA-256 hex digest, not the code", /^[0-9a-f]{64}$/.test(h) && !h.includes(codes[0]), "sha256");
    check("hashing is deterministic", hashInviteCode(codes[0]) === h, "same input, same hash");
    check("constant-time compare: equal hashes match", inviteHashesMatch(h, hashInviteCode(codes[0])), "match");
    check("constant-time compare: different hashes don't", !inviteHashesMatch(h, hashInviteCode(codes[1])), "no match");
    check("constant-time compare rejects malformed input instead of throwing", !inviteHashesMatch(h, "abc") && !inviteHashesMatch("", ""), "malformed");
    check("well-formed check: real codes pass, short / odd / huge values fail",
      isWellFormedInviteCode(codes[0]) && !isWellFormedInviteCode("short") && !isWellFormedInviteCode(`${codes[0]}!`) && !isWellFormedInviteCode("a".repeat(500)) && !isWellFormedInviteCode(null),
      "shape");
    const codesSrc = read("src/lib/beta-invites/codes.ts");
    check("codes come from crypto.randomBytes (CSPRNG), not Math.random", /randomBytes\(INVITE_CODE_BYTES\)/.test(codesSrc) && !/Math\.random/.test(codesSrc), "source");
    const storeSrc = read("src/lib/beta-invites/supabase-store.ts");
    check("the store never writes a plain code column - only token_hash", !/\bcode:/.test(storeSrc) && /token_hash: tokenHash/.test(storeSrc), "source");
    const migration = read("supabase/migrations/0064_beta_invites.sql");
    check("migration: RLS on for all three tables, no policies", (migration.match(/enable row level security/g) ?? []).length === 3 && !/create policy/i.test(migration), "0064");
    check("migration: every function revoked from anon/authenticated", (migration.match(/create or replace function/g) ?? []).length === (migration.match(/revoke all on function .* from public, anon, authenticated/g) ?? []).length, "0064");
    check("migration: one invite per waitlist row (unique waitlist_id)", /waitlist_id\s+bigint not null unique references waitlist/.test(migration), "0064");
    check("migration: expires_at defaults to 14 days", /expires_at\s+timestamptz not null default now\(\) \+ interval '14 days'/.test(migration), "0064");

    // ---------------- config ----------------
    const c0 = readInviteJobConfig({});
    check("defaults: off, cap 50, 5 per run, sending refused outside production", !c0.enabled && c0.maxActiveUsers === 50 && c0.invitesPerRun === 5 && !c0.sendingAllowed, JSON.stringify(c0));
    check("BETA_INVITES_ENABLED=1 is the only value that turns it on", readInviteJobConfig({ BETA_INVITES_ENABLED: "1" }).enabled && !readInviteJobConfig({ BETA_INVITES_ENABLED: "true" }).enabled, "kill switch");
    check("VERCEL_ENV=production allows sending; preview does not", readInviteJobConfig({ VERCEL_ENV: "production" }).sendingAllowed && !readInviteJobConfig({ VERCEL_ENV: "preview" }).sendingAllowed, "env");
    check("BETA_INVITES_ALLOW_NON_PROD=1 is the explicit override", readInviteJobConfig({ VERCEL_ENV: "preview", BETA_INVITES_ALLOW_NON_PROD: "1" }).sendingAllowed, "override");
    check("a typo in the cap falls back to the default, never unlimited", readInviteJobConfig({ BETA_MAX_ACTIVE_USERS: "lots" }).maxActiveUsers === 50 && readInviteJobConfig({ BETA_MAX_ACTIVE_USERS: "-3" }).maxActiveUsers === 50, "typo");
    check("cap math: min(batch, cap - active - outstanding)", newInviteSlots({ maxActiveUsers: 50, invitesPerRun: 5, activeUsers: 40, outstandingInvites: 7, retriesThisRun: 0 }) === 3, "50-40-7=3 < 5");
    check("cap math: batch limits when there is room", newInviteSlots({ maxActiveUsers: 50, invitesPerRun: 5, activeUsers: 0, outstandingInvites: 0, retriesThisRun: 0 }) === 5, "5");
    check("cap math: never negative when over the cap", newInviteSlots({ maxActiveUsers: 10, invitesPerRun: 5, activeUsers: 12, outstandingInvites: 3, retriesThisRun: 0 }) === 0, "0");
    check("cap math: retries use up the batch", newInviteSlots({ maxActiveUsers: 50, invitesPerRun: 5, activeUsers: 0, outstandingInvites: 2, retriesThisRun: 2 }) === 3, "3");

    // ---------------- job: picking order, cap, batch ----------------
    {
      const t = setup({ invitesPerRun: 3 });
      const unconfirmed = t.fake.join("pending@example.com", false);
      const people = Array.from({ length: 6 }, (_, i) => t.fake.join(`p${i + 1}@example.com`));
      const r = await t.job();
      check("job: outcome ok", r.outcome === "ok", JSON.stringify(r.detail));
      check("job: batch size respected (3 sent of 6 waiting)", t.mail.sent.length === 3, String(t.mail.sent.length));
      check("job: picks in waitlist_position order", t.mail.sent.map((m) => m.to).join(",") === "p1@example.com,p2@example.com,p3@example.com", t.mail.sent.map((m) => m.to).join(","));
      check("job: never emails an unconfirmed waitlist row", !t.mail.sent.some((m) => m.to === unconfirmed.email), "pending skipped");
      check("job: emailed_at set only on sent invites", t.fake.invites.length === 3 && t.fake.invites.every((i) => i.emailedAt), String(t.fake.invites.length));
      check("job: expiry is 14 days out", t.fake.invites.every((i) => new Date(i.expiresAt).getTime() - t.clock.now.getTime() === 14 * DAY), t.fake.invites[0].expiresAt);
      void people;
    }
    {
      const t = setup();
      // A non-founding row that confirmed with a lower id but is position-ordered after founding ones.
      const late = t.fake.join("late@example.com");
      late.position = 51;
      late.founding = false;
      const f = t.fake.join("founder@example.com");
      f.position = 2;
      f.founding = true;
      const r = await t.job();
      check("job: founding members go first", t.mail.sent[0]?.to === "founder@example.com", t.mail.sent.map((m) => m.to).join(","));
      void r;
    }
    {
      const t = setup({ maxActiveUsers: 4, invitesPerRun: 5 });
      for (let i = 0; i < 10; i++) t.fake.join(`c${i}@example.com`);
      t.fake.signIns.set("existing-user-1", new Date(t.clock.now.getTime() - 2 * DAY));
      t.fake.signIns.set("dormant-user", new Date(t.clock.now.getTime() - 45 * DAY));
      await t.job();
      check("job: cap counts users signed in within 30 days (1) and stops at cap 4 -> 3 invites", t.mail.sent.length === 3, String(t.mail.sent.length));
      await t.job();
      check("job: open invites hold their place - a second run under a full cap sends nothing", t.mail.sent.length === 3, String(t.mail.sent.length));
      // Raising the cap lets the next batch out.
      const raised = await runInviteJob({ ...t.deps, config: { ...t.config, maxActiveUsers: 6 } });
      check("job: raising BETA_MAX_ACTIVE_USERS lets the next batch out", t.mail.sent.length === 5 && raised.outcome === "ok", String(t.mail.sent.length));
      // Expired invites free their place, and the person is not re-invited automatically.
      t.advance(15);
      await runInviteJob({ ...t.deps, config: { ...t.config, maxActiveUsers: 6 } });
      const expiredPeople = t.fake.invites.slice(0, 5).map((i) => i.waitlistId);
      const reInvited = t.mail.sent.slice(5).filter((m) => t.fake.waitlist.find((w) => w.email === m.to && expiredPeople.includes(w.id)));
      check("job: expired invites free the cap (next people invited)", t.mail.sent.length > 5, String(t.mail.sent.length));
      check("job: an expired invitee is not re-invited by the job", reInvited.length === 0, String(reInvited.length));
    }

    // ---------------- idempotency, kill switch, non-prod ----------------
    {
      const t = setup();
      for (let i = 0; i < 3; i++) t.fake.join(`i${i}@example.com`);
      await t.job();
      await t.job();
      check("idempotent: two runs in a row send each person exactly one email", t.mail.sent.length === 3 && new Set(t.mail.sent.map((m) => m.to)).size === 3, String(t.mail.sent.length));
      // A new person gives the first run real (awaited) work, so the runs truly overlap.
      t.fake.join("i3@example.com");
      const [a, b] = await Promise.all([t.job(), t.job()]);
      check("idempotent: two overlapping runs - one takes the lock, the other exits", [a.outcome, b.outcome].sort().join("/") === "locked/ok" && t.mail.sent.length === 4 && t.mail.sent.filter((m) => m.to === "i3@example.com").length === 1, `${a.outcome}/${b.outcome}, ${t.mail.sent.length} sent`);
    }
    {
      const t = setup({ enabled: false });
      t.fake.join("x@example.com");
      const r = await t.job();
      check("kill switch off: nothing created, nothing sent, run recorded as disabled", r.outcome === "disabled" && t.mail.state.attempts === 0 && t.fake.invites.length === 0 && t.fake.runs.at(-1)?.outcome === "disabled", r.outcome);
    }
    {
      const t = setup({ sendingAllowed: false });
      t.fake.join("x@example.com");
      const r = await t.job();
      check("non-production: refuses to send, creates nothing", r.outcome === "refused-non-production" && t.mail.state.attempts === 0 && t.fake.invites.length === 0, r.outcome);
    }
    {
      const t = setup({}, "");
      t.fake.join("x@example.com");
      const r = await t.job();
      check("no NEXT_PUBLIC_SITE_URL: refuses rather than mail a localhost link", r.outcome === "misconfigured" && t.mail.state.attempts === 0, r.outcome);
    }

    // ---------------- send failure is retryable ----------------
    {
      const t = setup();
      t.fake.join("flaky@example.com");
      t.mail.state.failNext = 1;
      const r1 = await t.job();
      const inv = t.fake.invites[0];
      check("send failure: invite row kept, emailed_at stays null", t.fake.invites.length === 1 && inv.emailedAt === null && inv.emailsSent === 0, JSON.stringify(r1.detail));
      check("send failure: logged (invite id + reason)", logged.some((l) => l.includes(`invite ${inv.id}`) && l.includes("provider-503")), "log");
      const r2 = await t.job();
      check("send failure: the next run retries and marks it sent", t.mail.sent.length === 1 && t.fake.invites[0].emailedAt !== null && r2.detail.retriedSent === 1, JSON.stringify(r2.detail));
      check("send failure: still one invite for that person", t.fake.invites.length === 1, String(t.fake.invites.length));
      const code = codeFrom(t.mail.sent[0])!;
      issuedCodes.push(code);
      check("send failure: the retried link works", (await checkInvite(t.fake.store, code, t.clock.now)).status === "valid", "valid");
    }

    // ---------------- reminders ----------------
    {
      const t = setup();
      t.fake.join("slow@example.com");
      await t.job();
      const first = codeFrom(t.mail.sent[0])!;
      issuedCodes.push(first);
      t.advance(6);
      await t.job();
      check("reminder: none before 7 days", t.mail.sent.length === 1, String(t.mail.sent.length));
      t.advance(2);
      await t.job();
      check("reminder: one sent after 7 days", t.mail.sent.length === 2 && t.mail.sent[1].subject.startsWith("Reminder"), t.mail.sent.map((m) => m.subject).join(" | "));
      const second = codeFrom(t.mail.sent[1])!;
      issuedCodes.push(second);
      check("reminder: carries a fresh working link; the first link stops working", (await checkInvite(t.fake.store, second, t.clock.now)).status === "valid" && (await checkInvite(t.fake.store, first, t.clock.now)).status === "invalid", "rotated");
      check("reminder: keeps the original 14-day expiry", new Date(t.fake.invites[0].expiresAt).getTime() === new Date("2026-10-15T15:00:00Z").getTime(), t.fake.invites[0].expiresAt);
      t.advance(1);
      await t.job();
      await t.job();
      t.advance(4);
      await t.job();
      check("reminder: only ever one - nobody gets more than two emails", t.mail.sent.length === 2, String(t.mail.sent.length));
      t.advance(2);
      await t.job();
      check("reminder: after 14 days the invite is expired and the link is invalid", (await checkInvite(t.fake.store, second, t.clock.now)).status === "invalid", "expired");
    }
    {
      const t = setup();
      t.fake.join("remfail@example.com");
      await t.job();
      const first = codeFrom(t.mail.sent[0])!;
      t.advance(8);
      t.mail.state.failNext = 1;
      await t.job();
      check("reminder send failure: the first link still works (old hash restored)", (await checkInvite(t.fake.store, first, t.clock.now)).status === "valid", "restored");
      check("reminder send failure: not marked reminded, retried next run", t.fake.invites[0].remindedAt === null, "unreminded");
      await t.job();
      check("reminder send failure: next run sends it", t.mail.sent.length === 2, String(t.mail.sent.length));
    }
    {
      const t = setup();
      t.fake.join("claimer@example.com");
      await t.job();
      const code = codeFrom(t.mail.sent[0])!;
      const acct = accountFactory();
      await claimInviteAndCreateAccount(t.fake.store, { code, email: "claimer@example.com", now: t.clock.now }, acct.createAccount);
      t.advance(8);
      await t.job();
      check("reminder: never sent once the invite is claimed", t.mail.sent.length === 1, String(t.mail.sent.length));
    }

    // ---------------- the email ----------------
    {
      const code = generateInviteCode();
      const link = `https://cairn.example/signup?invite=${code}`;
      const msg = buildInviteEmail({ kind: "invite", link, expiresAt: new Date("2026-10-15T15:00:00Z"), premiumUntil: "31 December 2026", origin: "https://cairn.example" });
      check("email: subject", msg.subject === INVITE_SUBJECT && INVITE_SUBJECT === "You're in: your Cairn beta invite", msg.subject);
      check("email: one button, 'Create your account'", (msg.html.match(/Create your account/g) ?? []).length === 1 && (msg.html.match(/<a href="https:\/\/cairn\.example\/signup/g) ?? []).length === 1, "button");
      check("email: shows the expiry date", msg.text.includes("15 October 2026") && msg.html.includes("15 October 2026"), "15 October 2026");
      check("email: Premium date comes from the input (BETA_PREMIUM_UNTIL)", msg.text.includes("full Premium until 31 December 2026"), "premium");
      const noPremium = buildInviteEmail({ kind: "invite", link, expiresAt: new Date(), premiumUntil: null, origin: "https://cairn.example" });
      check("email: no Premium line when BETA_PREMIUM_UNTIL is unset", !/Premium/.test(noPremium.text), "omitted");
      check("email: not-advice line in both parts", msg.text.includes(NOT_ADVICE_LINE) && msg.html.includes(NOT_ADVICE_LINE), NOT_ADVICE_LINE);
      check("email: who to reply to for help", /Reply to this email/.test(msg.text), "reply");
      check("email: privacy line + link", msg.text.includes("https://cairn.example/privacy") && msg.html.includes("Privacy Policy"), "privacy");
      check("email: the code appears only inside the link (once per part)", msg.text.split(code).length === 2 && msg.html.split(code).length === 2 && !msg.subject.includes(code), "1 + 1");
      check("email: no hype words", !/guarantee|exclusive|act now|don't miss|!/i.test(`${msg.subject} ${msg.text}`), "tone");
      check("email: plain-text part present", msg.text.length > 100 && !/<[a-z]/i.test(msg.text), `${msg.text.length} chars`);
    }

    // ---------------- sign-up: valid / invalid paths ----------------
    {
      const t = setup();
      t.fake.join("Valid.Person@Example.com");
      await t.job();
      const code = codeFrom(t.mail.sent[0])!;
      issuedCodes.push(code);
      const v = await checkInvite(t.fake.store, code, t.clock.now);
      check("valid invite resolves to its (normalised) address", v.status === "valid" && v.email === "valid.person@example.com", JSON.stringify(v));
      check("unknown code is invalid", (await checkInvite(t.fake.store, generateInviteCode(), t.clock.now)).status === "invalid", "unknown");

      const acct = accountFactory();
      const wrong = await claimInviteAndCreateAccount(t.fake.store, { code, email: "someone.else@example.com", now: t.clock.now }, acct.createAccount);
      check("wrong email is rejected and creates nothing", !wrong.ok && wrong.message === INVITE_WRONG_EMAIL_MESSAGE && acct.created.length === 0, JSON.stringify(wrong));
      check("wrong email does not consume the invite", (await checkInvite(t.fake.store, code, t.clock.now)).status === "valid", "still valid");

      const ok = await claimInviteAndCreateAccount(t.fake.store, { code, email: " VALID.person@example.com ", now: t.clock.now }, acct.createAccount);
      check("the invited email (any case/spacing) creates the account", ok.ok && acct.created.length === 1, JSON.stringify(ok));
      check("the invite is marked claimed by that account in the same step", t.fake.invites[0].claimedAt !== null && t.fake.invites[0].claimedBy === "user-1", String(t.fake.invites[0].claimedBy));
      const again = await claimInviteAndCreateAccount(t.fake.store, { code, email: "valid.person@example.com", now: t.clock.now }, acct.createAccount);
      check("claimed: second use rejected with the plain message", !again.ok && again.message === INVITE_INVALID_MESSAGE && acct.created.length === 1, JSON.stringify(again));
    }
    {
      const t = setup();
      t.fake.join("exp@example.com");
      t.fake.join("rev@example.com");
      await t.job();
      const [expCode, revCode] = t.mail.sent.map((m) => codeFrom(m)!);
      issuedCodes.push(expCode, revCode);
      await adminRevoke({ store: t.fake.store, now: () => t.clock.now }, "admin-1", t.fake.invites[1].id);
      t.advance(15);
      const acct = accountFactory();
      const exp = await claimInviteAndCreateAccount(t.fake.store, { code: expCode, email: "exp@example.com", now: t.clock.now }, acct.createAccount);
      const rev = await claimInviteAndCreateAccount(t.fake.store, { code: revCode, email: "rev@example.com", now: t.clock.now }, acct.createAccount);
      const unk = await claimInviteAndCreateAccount(t.fake.store, { code: generateInviteCode(), email: "exp@example.com", now: t.clock.now }, acct.createAccount);
      const bad = await claimInviteAndCreateAccount(t.fake.store, { code: "not-a-code", email: "exp@example.com", now: t.clock.now }, acct.createAccount);
      check("expired, revoked, unknown and malformed all get the same one message", [exp, rev, unk, bad].every((r) => !r.ok && r.message === INVITE_INVALID_MESSAGE) && acct.created.length === 0, [exp, rev, unk, bad].map((r) => (r.ok ? "ok" : "x")).join(""));
      check("the message is the agreed copy", INVITE_INVALID_MESSAGE === "This invite has expired or was already used. Reply to our email and we'll send a new one.", INVITE_INVALID_MESSAGE);
    }
    {
      const t = setup();
      t.fake.join("fails@example.com");
      await t.job();
      const code = codeFrom(t.mail.sent[0])!;
      const r = await claimInviteAndCreateAccount(t.fake.store, { code, email: "fails@example.com", now: t.clock.now }, async () => ({ ok: false, message: "Password is too weak." }));
      const retry = await claimInviteAndCreateAccount(t.fake.store, { code, email: "fails@example.com", now: t.clock.now }, accountFactory().createAccount);
      check("account creation failure releases the reservation; the same link works on retry", !r.ok && r.message === "Password is too weak." && retry.ok, JSON.stringify([r, retry]));
    }

    // ---------------- the race ----------------
    {
      const t = setup();
      t.fake.join("race@example.com");
      await t.job();
      const code = codeFrom(t.mail.sent[0])!;
      issuedCodes.push(code);
      const acct = accountFactory();
      const attempts = await Promise.all(
        Array.from({ length: 10 }, () => claimInviteAndCreateAccount(t.fake.store, { code, email: "race@example.com", now: t.clock.now }, acct.createAccount)),
      );
      const winners = attempts.filter((a) => a.ok);
      check("race: 10 simultaneous sign-ups on one code -> exactly one account", winners.length === 1 && acct.created.length === 1, `${winners.length} ok, ${acct.created.length} created`);
      check("race: every loser gets the plain message", attempts.filter((a) => !a.ok).every((a) => !a.ok && a.message === INVITE_INVALID_MESSAGE), "9 x invalid");
      check("race: invite claimed once, by the winner", t.fake.invites[0].claimedBy === (winners[0] as { userId: string }).userId, String(t.fake.invites[0].claimedBy));
    }

    // ---------------- admin ----------------
    {
      const t = setup();
      const admin = { ...t.deps, sendingAllowed: true };
      const pending = t.fake.join("unconfirmed@example.com", false);
      const r0 = await adminSendNow(admin, "admin-1", pending.id);
      check("admin send-now: refuses an unconfirmed address, audited", !r0.ok && t.mail.state.attempts === 0 && t.fake.audits.at(-1)?.outcome === "refused-not-confirmed", JSON.stringify(t.fake.audits.at(-1)));
      const p = t.fake.join("pick@example.com");
      const r1 = await adminSendNow(admin, "admin-1", p.id);
      check("admin send-now: sends one invite, audited as sent", r1.ok && t.mail.sent.length === 1 && t.fake.audits.at(-1)?.action === "send_now" && t.fake.audits.at(-1)?.outcome === "sent", JSON.stringify(t.fake.audits.at(-1)));
      const firstCode = codeFrom(t.mail.sent[0])!;
      issuedCodes.push(firstCode);
      const r2 = await adminResend(admin, "admin-1", t.fake.invites[0].id);
      const newCode = codeFrom(t.mail.sent[1])!;
      issuedCodes.push(newCode);
      check("admin resend: new working link, old link dead, audited", r2.ok && (await checkInvite(t.fake.store, newCode, t.clock.now)).status === "valid" && (await checkInvite(t.fake.store, firstCode, t.clock.now)).status === "invalid" && t.fake.audits.at(-1)?.action === "resend", JSON.stringify(t.fake.audits.at(-1)));
      const r3 = await adminRevoke(admin, "admin-1", t.fake.invites[0].id);
      check("admin revoke: link dead, audited", r3.ok && (await checkInvite(t.fake.store, newCode, t.clock.now)).status === "invalid" && t.fake.audits.at(-1)?.action === "revoke", JSON.stringify(t.fake.audits.at(-1)));
      const r4 = await adminSendNow(admin, "admin-1", p.id);
      check("admin invite-again after revoke: reissues the same row (still one invite per person)", r4.ok && t.fake.invites.length === 1 && (await checkInvite(t.fake.store, codeFrom(t.mail.sent[2])!, t.clock.now)).status === "valid", String(t.fake.invites.length));
      issuedCodes.push(codeFrom(t.mail.sent[2])!);
      const r5 = await adminSendNow({ ...admin, sendingAllowed: false }, "admin-1", p.id);
      check("admin actions refuse to send off production, still audited", !r5.ok && t.mail.sent.length === 3 && t.fake.audits.at(-1)?.outcome === "refused-not-production", r5.message);
      check("every admin action wrote an audit row", t.fake.audits.length === 6, String(t.fake.audits.length));
      const adminSrc = read("src/lib/actions/beta-invites.ts");
      check("admin server actions re-check the admin role on every call", (adminSrc.match(/return run\(/g) ?? []).length === 3 && /isAdminUser\(/.test(adminSrc), "source");
      check("admin module offers no delete or export action", !/export async function (delete|export|bulk)/i.test(adminSrc), "source");
    }

    // ---------------- gate + legacy shared codes ----------------
    const legacy = "cairn-beta-7Hq2, second-code-xyz9";
    check("manual override: a BETA_INVITE_CODES code still works", inviteAllowed("cairn-beta-7Hq2", legacy) && isInvitedSignup("/signup", "second-code-xyz9", legacy), "legacy");
    check("manual override: wrong / short / unset still refused", !inviteAllowed("wrong-code-123", legacy) && !inviteAllowed("short", "short") && !inviteAllowed("cairn-beta-7Hq2", undefined), "legacy");
    const auth = read("src/lib/actions/auth.ts");
    check("signUp checks the shared code first and keeps its original path", /const shared = inviteAllowed\(invite, process\.env\.BETA_INVITE_CODES\)/.test(auth) && /if \(!shared\) return signUpWithPersonalInvite/.test(auth) && /supabase\.auth\.signUp\(/.test(auth), "source");
    check("public-paths marks the shared codes as a manual override", /MANUAL OVERRIDE/.test(read("src/lib/public-paths.ts")), "comment");
    check("proxy: /signup with an invite value reaches the page (it shows form or message)", isInviteLinkRequest("/signup", "anything") && isInviteLinkRequest("/signup", generateInviteCode()), "pass");
    check("proxy: /signup without an invite stays gated", !isInviteLinkRequest("/signup", null) && !isInviteLinkRequest("/signup", "   ") && !isPublicPath("/signup"), "gated");
    check("proxy: an invite opens /signup only", !isInviteLinkRequest("/portfolio", generateInviteCode()) && !isInviteLinkRequest("/signup/x", "abc"), "scope");
    check("proxy uses the invite-link check, no database call", /isInviteLinkRequest\(/.test(read("src/proxy.ts")), "source");
    const page = read("src/app/(auth)/signup/page.tsx");
    check("signup page: invalid invite renders the message and a waitlist link, never a redirect", /resolveSignupInvite/.test(page) && /<InviteInvalid \/>/.test(page) && !/redirect\(/.test(page) && /href="\/waitlist"/.test(read("src/app/(auth)/signup/invite-invalid.tsx")), "source");
    const form = read("src/app/(auth)/signup/signup-form.tsx");
    const branchAt = form.indexOf("{personal ? (");
    const personalBranch = branchAt < 0 ? "" : form.slice(branchAt, form.indexOf(") : (", branchAt));
    check("signup form: personal invite shows the email as a locked, read-only value",
      /name="email"/.test(personalBranch) && /value=\{invitedEmail\}/.test(personalBranch) && /\breadOnly\b/.test(personalBranch) && /aria-readonly="true"/.test(personalBranch) && !/onChange/.test(personalBranch), "source");

    // ---------------- route + wiring ----------------
    const route = read("src/app/api/cron/send-beta-invites/route.ts");
    check("cron route: requires Bearer CRON_SECRET, compared in constant time", /process\.env\.CRON_SECRET/.test(route) && /timingSafeEqual/.test(route) && /status: 401/.test(route), "source");
    check("cron route: scheduled in vercel.json", JSON.parse(read("vercel.json")).crons?.some((c: { path: string }) => c.path === "/api/cron/send-beta-invites"), "vercel.json");
    const waitlistSrc = read("src/lib/waitlist.ts");
    const sendEmailFn = waitlistSrc.slice(waitlistSrc.indexOf("export async function sendEmail"), waitlistSrc.indexOf("export function buildConfirmationEmail"));
    check("shared mailer: the no-provider path logs nothing (an invite link carries a code)", !/console\./.test(sendEmailFn), "source");
    check("invites go through the existing mailer (Resend, then the Gmail bridge)", /sendEmail\(to, message\)/.test(read("src/lib/beta-invites/server.ts")), "source");
    const confirmPage = read("src/app/waitlist/confirm/confirm-view.tsx");
    check("waitlist confirmation page says what happens next", /We invite people in batches, in the order they joined\./.test(confirmPage) && /email with your personal link/.test(confirmPage), "copy");
    check("waitlist confirmation email says what happens next", waitlistSrc.includes("We invite people in batches, in the order they joined."), "copy");

    // ---------------- no code ever logged ----------------
    const leaked = issuedCodes.filter((code) => logged.some((l) => l.includes(code)));
    check(`no invite code appears in any log line (${issuedCodes.length} codes, ${logged.length} lines checked)`, issuedCodes.length > 5 && leaked.length === 0, `${leaked.length} leaked`);
  } finally {
    console.error = origError;
  }

  return { suiteName: "Beta invites (personal single-use codes, send job, claim race)", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runBetaInvitesSuite().then((suite) => {
    writeReport([suite]);
    for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
    const failed = suite.cases.filter((c) => c.status === "fail").length;
    console.log(`\n${suite.cases.length - failed}/${suite.cases.length} passed`);
    if (failed) process.exit(1);
  });
}
