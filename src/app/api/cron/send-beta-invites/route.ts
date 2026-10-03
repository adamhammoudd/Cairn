import { NextResponse, type NextRequest } from "next/server";
import { checkCronAuth, cronRejection } from "@/lib/cron-auth";
import { readInviteJobConfig } from "@/lib/beta-invites/config";
import { runInviteJob } from "@/lib/beta-invites/job";
import { productionInviteDeps } from "@/lib/beta-invites/server";

// send-beta-invites: Vercel Cron (schedule in vercel.json) calls this with
// `Authorization: Bearer $CRON_SECRET` - Vercel adds that header itself when a
// CRON_SECRET env var exists on the project. Anything else gets a 401.
//
// Why a Vercel cron route and not the pg_cron + Edge Function pattern the
// ingestion jobs use: this job sends mail through src/lib/waitlist.ts (Resend,
// then the nodemailer Gmail bridge) and builds links from the Next app's own
// NEXT_PUBLIC_SITE_URL. Porting that mailer to Deno would mean two copies of
// the email path. A route ships with the app on every deploy, and Vercel only
// runs crons on the production deployment - a second guard on top of the
// VERCEL_ENV check inside the job.
//
// The job does nothing unless BETA_INVITES_ENABLED=1, and refuses to send
// unless VERCEL_ENV=production (or BETA_INVITES_ALLOW_NON_PROD=1).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // A missing CRON_SECRET is reported (503 + a log line), not hidden behind a
  // bare 401: Vercel sends no Authorization header at all without it, so the
  // job never runs and the admin page says "Last run: never".
  const rejected = cronRejection("send-beta-invites", checkCronAuth(request.headers.get("authorization"), process.env.CRON_SECRET));
  if (rejected) return NextResponse.json({ error: rejected.error }, { status: rejected.status });

  const result = await runInviteJob({ ...productionInviteDeps(), config: readInviteJobConfig() });
  // Counts and an outcome only - never an address or a code.
  return NextResponse.json(result, { status: result.outcome === "error" ? 500 : 200 });
}
