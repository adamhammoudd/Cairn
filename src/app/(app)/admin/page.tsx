import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSnapshot } from "@/lib/actions/admin";
import { listOpenReports } from "@/lib/actions/discussion";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin - Cairn" };

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const snapshot = await getAdminSnapshot();
  // 404 rather than 403: a non-admin should not be able to learn that an admin
  // route exists here at all, and the nav never offers it to them.
  if (!snapshot) notFound();

  const reports = await listOpenReports();
  return <AdminDashboard snapshot={snapshot} reports={reports} />;
}
