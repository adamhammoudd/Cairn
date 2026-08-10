import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTier } from "@/lib/actions/billing";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, plan] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).single(),
    getTier(),
  ]);

  const displayName = profile?.display_name || user.email || "Account";

  return (
    <AppShell displayName={displayName} plan={plan}>
      {children}
    </AppShell>
  );
}
