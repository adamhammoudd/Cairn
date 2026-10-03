import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readInbound, removeByEmail, type RemovalStore } from "@/lib/waitlist-removal";

// "Reply STOP and we won't email you again" - the receiving end.
//
// An email provider (or a mail-forwarding rule) POSTs each reply here as JSON.
// The route is authenticated with a shared secret in `Authorization: Bearer
// $INBOUND_EMAIL_SECRET`; anything else gets a 401, and with no secret
// configured it refuses everything (503) rather than accepting anonymous
// requests that could remove people from the list.
//
// A reply is acted on only when it IS a stop request (see isStopReply): a longer
// message that merely contains the word is left for a human. The response never
// says whether the sender was on the list.
//
// UNVERIFIED END TO END: this needs an inbound-mail provider (Resend inbound, or
// a forwarding rule) pointed at this URL. The personal removal link in every
// email works without it.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SECRET_MIN = 16;

function authorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < SECRET_MIN || !header) return false;
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

function supabaseStore(): RemovalStore {
  const admin = createAdminClient();
  return {
    async deleteByToken(token) {
      const { data } = await admin.from("waitlist").delete().eq("removal_token", token).select("id");
      return data?.length ?? 0;
    },
    async deleteByEmail(email) {
      const { data } = await admin.from("waitlist").delete().eq("email_normalized", email).select("id");
      return data?.length ?? 0;
    },
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret || secret.length < SECRET_MIN) {
    console.error("[cairn] inbound email: INBOUND_EMAIL_SECRET is not set (or too short); refusing every request");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const msg = readInbound(payload);
  if (!msg.from || !msg.isStop) return NextResponse.json({ handled: false });

  const result = await removeByEmail(supabaseStore(), msg.from);
  // Counts only - never the address.
  console.log(`[cairn] inbound email: stop request ${result}`);
  return NextResponse.json({ handled: true });
}
