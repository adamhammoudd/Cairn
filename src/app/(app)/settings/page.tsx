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
    <div className="animate-page-in">
      <div className="mb-5.5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Account · Settings</div>
        <h1 className="font-serif text-[30px] leading-[1.1] font-normal text-primary">Settings</h1>
        <p className="mt-1.75 max-w-[560px] text-[13.5px] text-muted text-pretty">
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
