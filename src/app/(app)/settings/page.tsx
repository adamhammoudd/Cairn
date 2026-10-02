import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { SettingsHero } from "@/components/settings/settings-hero";
import { TIER_LIMITS } from "@/lib/billing";
import { getBillingDetail } from "@/lib/actions/billing";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { listSectorMapSectors } from "@/lib/actions/sector-map";
import { isMarketDataProviderConfigured } from "@/lib/market-data/provider";
import { isSettingsTabId, type SettingsTabId } from "@/lib/settings-categories";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings - Cairn" };

// `?tab=billing` opens straight on a category, so a link from elsewhere in the
// app (the Alerts page, a quota panel) can land on the row it means.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { tab } = await searchParams;
  const initialTab: SettingsTabId = isSettingsTabId(tab) ? tab : "display";

  const [{ data: profile }, { data: settings }, billing, prefs, sectorOptions, { data: watchlistRows }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
      getBillingDetail(),
      getDisplayPrefs(),
      listSectorMapSectors(),
      supabase.from("watchlists").select("id, name").eq("user_id", user.id).order("sort_order", { ascending: true }),
    ]);

  if (!settings) {
    throw new Error("No user_settings row found - the on_auth_user_created trigger may not be installed.");
  }

  return (
    // Bottom padding leaves room for the sticky unsaved-changes bar.
    <div className="animate-page-in mx-auto max-w-[1180px] px-6 pt-5 pb-26">
      <div className="mb-3.5">
        {/* Every chip states something already resolved on the server: the plan
            from the billing read, two-factor from the stored preference (no
            second factor exists to be "on"), and the one channel alerts can
            actually be delivered on today. */}
        <SettingsHero
          chips={[
            { label: "Plan", value: TIER_LIMITS[billing.usage.tier].label, tone: "accent" },
            settings.two_factor_status === "requested"
              ? { label: "Two-factor", value: "On the list", tone: "info" }
              : { label: "Two-factor", value: "Not available yet", tone: "warning" },
            { label: "Alerts", value: "In-app", tone: "info" },
          ]}
        />
      </div>

      {/* Keyed on the tab so /settings?tab=X from the account menu switches tab
          even when you're already on /settings (useState ignores new initial
          values after mount). */}
      <SettingsTabs
        key={initialTab}
        settings={settings}
        displayName={profile?.display_name || "Account"}
        email={user.email ?? ""}
        emailVerified={!!user.email_confirmed_at}
        billing={billing}
        sectorOptions={sectorOptions}
        watchlists={watchlistRows ?? []}
        fx={{ effectiveCurrency: prefs.effectiveCurrency, unavailable: prefs.fxUnavailable, asOf: prefs.fxAsOf }}
        intradayAvailable={isMarketDataProviderConfigured()}
        initialTab={initialTab}
      />
    </div>
  );
}
