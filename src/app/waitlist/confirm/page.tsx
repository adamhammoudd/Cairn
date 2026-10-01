import type { Metadata } from "next";
import { CenteredCard, FrontDoorShell } from "@/components/front-door/shell";
import { ConfirmView, type Outcome } from "./confirm-view";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Confirm your waitlist spot · Cairn",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolve(token: string | undefined): Promise<Outcome> {
  if (!token || !UUID_RE.test(token)) return { kind: "invalid" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("confirm_waitlist", { p_token: token });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row || row.outcome === "invalid") return { kind: "invalid" };
    return {
      kind: row.outcome === "already" ? "already" : "confirmed",
      position: row.list_position,
      founding: row.founding_member,
      limit: row.founding_limit,
    };
  } catch {
    return { kind: "invalid" };
  }
}

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = await resolve(token);

  return (
    <FrontDoorShell>
      <CenteredCard>
        <ConfirmView outcome={outcome} />
      </CenteredCard>
    </FrontDoorShell>
  );
}
