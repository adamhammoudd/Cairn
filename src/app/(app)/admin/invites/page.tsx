import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBetaInviteAdminView } from "@/lib/actions/beta-invites";
import { BetaInvitesPanel } from "@/components/admin/beta-invites-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Beta invites - Cairn" };

export const dynamic = "force-dynamic";

export default async function AdminInvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Same posture as /admin: 404, not 403, for anyone without the admin role.
  const view = await getBetaInviteAdminView();
  if (!view) notFound();

  return <BetaInvitesPanel view={view} />;
}
