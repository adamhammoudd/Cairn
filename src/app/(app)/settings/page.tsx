import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DangerZone } from "@/components/settings/danger-zone";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
  ]);

  if (!settings) {
    throw new Error("No user_settings row found — the on_auth_user_created trigger may not be installed.");
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <div className="rounded-card border border-line bg-panel p-6">
        <div className="mb-4 text-xs tracking-[0.08em] text-muted uppercase">Account</div>
        <div className="mb-5 flex items-center gap-4">
          <div
            className="h-[52px] w-[52px] shrink-0 rounded-full"
            style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
          />
          <div>
            <div className="text-[15px] text-primary">{profile?.display_name || "Account"}</div>
            <div className="text-[13px] text-muted">{user.email}</div>
          </div>
        </div>
        <ChangePasswordForm />
      </div>

      <SettingsForm settings={settings} />

      <DangerZone />
    </div>
  );
}
