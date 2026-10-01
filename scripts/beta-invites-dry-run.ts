// End-to-end dry run of the beta-invite flow with no database, no mail and no
// accounts: waitlist signup -> confirm -> send-beta-invites job -> captured
// email (code redacted) -> sign-up with the link -> second use rejected.
//
// Real code: the job (runInviteJob), the email builder, code generation and
// hashing, the claim (claimInviteAndCreateAccount), the config parser.
// Stand-ins: the in-memory store from scripts/tests/beta-invite-fakes.ts (it
// mirrors migration 0064), a capturing mock mailer, and an account-creation
// stub. The waitlist rows are created directly in the fake store, not through
// the joinWaitlist server action (which needs Supabase).
//
// Run: npx tsx --conditions=react-server scripts/beta-invites-dry-run.ts

import { readInviteJobConfig } from "@/lib/beta-invites/config";
import { runInviteJob } from "@/lib/beta-invites/job";
import { claimInviteAndCreateAccount } from "@/lib/beta-invites/claim";
import { codeFrom, createFakeStore, createMockMailer } from "./tests/beta-invite-fakes";

const redact = (s: string, code: string) => s.split(code).join("<REDACTED>");

async function main() {
  const clock = { now: new Date("2026-10-01T15:00:00Z") };
  const fake = createFakeStore(clock);
  const mail = createMockMailer();
  const config = readInviteJobConfig({ BETA_INVITES_ENABLED: "1", VERCEL_ENV: "production", BETA_MAX_ACTIVE_USERS: "50", BETA_INVITES_PER_RUN: "5" });
  const deps = { store: fake.store, mailer: mail.mailer, origin: "https://cairn.example", premiumUntil: "31 December 2026", now: () => clock.now };

  console.log("1. Waitlist signup");
  const row = fake.join("jordan@example.com", false);
  console.log(`   waitlist row ${row.id}: status=${row.status}`);

  console.log("2. Confirm email");
  fake.confirm(row);
  console.log(`   status=${row.status}, position=#${row.position}, founding=${row.founding}`);

  console.log(`3. Job run (enabled=${config.enabled}, sendingAllowed=${config.sendingAllowed}, cap=${config.maxActiveUsers}, batch=${config.invitesPerRun})`);
  const run1 = await runInviteJob({ ...deps, config });
  console.log(`   outcome=${run1.outcome} ${JSON.stringify(run1.detail)}`);
  const run2 = await runInviteJob({ ...deps, config });
  console.log(`   second run: outcome=${run2.outcome}, emails captured so far=${mail.sent.length}`);

  const email = mail.sent[0];
  const code = codeFrom(email)!;
  console.log("4. Captured email (code redacted)");
  console.log(`   To: ${email.to}`);
  console.log(`   Subject: ${email.subject}`);
  console.log(redact(email.text, code).replace(/^/gm, "   | "));
  console.log(`   code length=${code.length}; stored token_hash=${fake.invites[0].tokenHash.slice(0, 12)}… (sha256, code not stored)`);

  const created: string[] = [];
  const createAccount = async (e: string) => {
    created.push(e);
    return { ok: true as const, userId: "user-dry-run-1" };
  };

  console.log("5. Sign up with the link");
  const first = await claimInviteAndCreateAccount(fake.store, { code, email: "jordan@example.com", now: clock.now }, createAccount);
  console.log(`   ${JSON.stringify(first)}; invite claimed_at=${fake.invites[0].claimedAt}`);

  console.log("6. Second use of the same link");
  const second = await claimInviteAndCreateAccount(fake.store, { code, email: "jordan@example.com", now: clock.now }, createAccount);
  console.log(`   ${JSON.stringify(second)}`);
  console.log(`   accounts created in total: ${created.length}`);
}

void main();
