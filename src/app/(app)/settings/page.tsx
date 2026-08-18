import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getBillingSummary } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: settings }, billing] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
    getBillingSummary(),
  ]);

  if (!settings) {
    throw new Error("No user_settings row found — the on_auth_user_created trigger may not be installed.");
  }

  return (
    <div>
      <div>
        <div>Preferences</div>
        <h1>Settings</h1>
        <p>
          Account, display, notifications, billing, and AI assistant preferences.
        </p>
      </div>

      <SettingsTabs
        settings={settings}
        displayName={profile?.display_name || "Account"}
        email={user.email ?? ""}
        billing={{
          tier: billing.tier,
          used: billing.used,
          limit: billing.limit,
          periodLabel: billing.periodLabel,
        }}
        assistantCopy={{
          freeLabel: TIER_LIMITS.free.label,
          freeAnalyses: TIER_LIMITS.free.monthlyAiAnalyses,
          premiumLabel: TIER_LIMITS.premium.label,
          premiumAnalyses: TIER_LIMITS.premium.monthlyAiAnalyses,
        }}
 />
    </div>
  );
}
