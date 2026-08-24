"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsForm, type WatchlistOption } from "@/components/settings/settings-form";
import { SettingsSubheader } from "@/components/settings/settings-subheader";
import { ProfileForm } from "@/components/settings/profile-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { TwoFactorPanel } from "@/components/settings/two-factor-panel";
import { DangerZone } from "@/components/settings/danger-zone";
import { BillingSettingsPanel } from "@/components/settings/billing-settings-panel";
import { CookiePreferences } from "@/components/settings/cookie-preferences";
import { settingsTabById, type SettingsTabId } from "@/lib/settings-categories";
import type { BillingDetail } from "@/lib/actions/billing";
import type { Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

interface SettingsTabsProps {
  settings: Settings;
  displayName: string;
  email: string;
  billing: BillingDetail;
  sectorOptions: string[];
  watchlists: WatchlistOption[];
  fx: { effectiveCurrency: string; unavailable: boolean; asOf: string | null };
  intradayAvailable: boolean;
  initialTab: SettingsTabId;
}

// Row padding matches SettingsForm's Row so the panels that are not built from
// form fields (Account, Billing, Privacy) sit on the same rhythm and the same
// full-bleed hairline as the ones that are. cn-row so compact density reaches
// them too.
const ROW = "cn-row border-b border-[#171717] px-4.5 py-3.75 last:border-b-0";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy", blurb: "What Cairn stores, for how long, and how to get it back." },
  { href: "/terms", label: "Terms of Service", blurb: "What Cairn is and is not, including the advice disclaimer." },
  {
    href: "/accessibility",
    label: "Accessibility Statement",
    blurb: "What was tested, what conforms, and the known gaps.",
  },
];

export function SettingsTabs({
  settings,
  displayName,
  email,
  billing,
  sectorOptions,
  watchlists,
  fx,
  intradayAvailable,
  initialTab,
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const active = settingsTabById(activeTab);

  return (
    <div>
      {/* Sub-header rather than the sidebar this page used to have: six
          categories, and the same grouped/expandable interaction as the main
          nav, so a reader learns one pattern for the whole app. */}
      <SettingsSubheader active={activeTab} onSelect={setActiveTab} />

      {/* One card per category: title, blurb, then full-bleed rows. The
          previous build wrapped the rows in a p-6 box, so Settings was the only
          page whose dividers stopped short of its own card border. */}
      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="border-b border-line px-4.5 py-3.5">
          <div className="font-serif text-lg text-primary">{active.label}</div>
          <div className="mt-0.75 text-[11.5px] text-muted">{active.blurb}</div>
        </div>

        <div className={activeTab === "account" ? "block" : "hidden"}>
          <div className={ROW}>
            <ProfileForm displayName={displayName} email={email} />
          </div>
          <div className={ROW}>
            <ChangePasswordForm />
          </div>
          <div className={ROW}>
            <TwoFactorPanel status={settings?.two_factor_status ?? "not_enrolled"} />
          </div>
          {/* Destructive actions stay on Account only. The mock pins them to
              the bottom of every category card; a Delete account button on the
              Display tab is a footgun, so this deliberately diverges. */}
          <DangerZone />
        </div>

        <SettingsForm
          settings={settings}
          activeTab={activeTab}
          sectorOptions={sectorOptions}
          watchlists={watchlists}
          fx={fx}
          intradayAvailable={intradayAvailable}
        />

        <div className={activeTab === "billing" ? "block" : "hidden"}>
          <BillingSettingsPanel detail={billing} />
        </div>

        <div className={activeTab === "privacy" ? "block" : "hidden"}>
          {/* The settings-page instance of the AI disclosure that the landing
              page and the privacy policy already carry. Same claim, same
              wording, linking to the fuller version rather than paraphrasing
              it into a fourth variant. */}
          <div className={ROW}>
            <div className="text-[13px] text-primary">Cairn uses AI to generate analysis and chat content</div>
            <p className="mt-1 max-w-[62ch] text-[11.5px] leading-relaxed text-muted text-pretty">
              Research write-ups, methodology explanations and every assistant reply are produced by a language
              model. They are not written or reviewed by a human before you see them, and they can be wrong.
              Probability ranges, confidence levels and sample sizes are computed statistically in code — a Wilson
              score interval over historical analogs — not generated by the model; the model writes only the
              plain-language explanation of figures the code has already computed.
            </p>
            <Link href="/privacy#ai-disclosure" className="mt-2 inline-block text-[12.5px] text-accent hover:underline">
              Read the full AI disclosure →
            </Link>
          </div>

          {LEGAL_LINKS.map((l) => (
            <div key={l.href} className={`flex flex-wrap items-center justify-between gap-4 ${ROW}`}>
              <div className="min-w-0">
                <div className="text-[13px] text-primary">{l.label}</div>
                <div className="mt-1 text-[11.5px] text-muted text-pretty">{l.blurb}</div>
              </div>
              <Link
                href={l.href}
                className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
              >
                Open →
              </Link>
            </div>
          ))}

          <div className={ROW}>
            <CookiePreferences />
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-4 ${ROW}`}>
            <div className="min-w-0">
              <div className="text-[13px] text-primary">Your data</div>
              <div className="mt-1 max-w-[52ch] text-[11.5px] text-muted text-pretty">
                Export everything Cairn holds, or delete your account and all of it, from the Account category. The
                deletion process is the one described in the privacy policy.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
            >
              Go to Account →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
