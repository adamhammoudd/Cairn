import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
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

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runInviteJob({ ...productionInviteDeps(), config: readInviteJobConfig() });
  // Counts and an outcome only - never an address or a code.
  return NextResponse.json(result, { status: result.outcome === "error" ? 500 : 200 });
}
