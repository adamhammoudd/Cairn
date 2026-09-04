import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { getUserPlan } from "@/lib/actions/billing";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // getAuthUser() is request-memoised, so the getUserPlan() and
  // getDisplayPrefs() calls below reuse this validation instead of each making
  // their own round-trip to the Auth server.
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // Display preferences are resolved here rather than per page so the FX rate
  // behind the currency setting is fetched once per navigation, and so every
  // page gets the same answer - a currency that reached Holdings but not
  // Markets would be worse than one that reached neither.
  const [{ data: profile }, plan, displayPrefs] = await Promise.all([
    supabase.from("profiles").select("display_name, role").eq("user_id", user.id).single(),
    getUserPlan(),
    getDisplayPrefs(),
  ]);

  const displayName = profile?.display_name || user.email || "Account";

  return (
    <AppShell
      displayName={displayName}
      plan={plan}
      isAdmin={profile?.role === "admin"}
      displayPrefs={displayPrefs}
    >
      {children}
    </AppShell>
  );
}
