import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { getBillingDetail } from "@/lib/actions/billing";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { listSectorMapSectors } from "@/lib/actions/sector-map";
import { isMarketDataProviderConfigured } from "@/lib/market-data/provider";
import { isSettingsTabId, type SettingsTabId } from "@/lib/settings-categories";

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
    <div className="animate-page-in mx-auto max-w-[1156px] px-5.5 pt-6.5 pb-15">
      {/* The mockup's intro block. The app header/top-nav above it is left
          as-is per the task - this pass excludes it. */}
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Account</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Settings</h1>
        <p className="mt-1.75 max-w-[560px] text-[13.5px] text-muted text-pretty">
          Grouped by what they affect. Changes save as you make them.
        </p>
      </div>

      <SettingsTabs
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
