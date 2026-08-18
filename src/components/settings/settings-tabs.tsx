"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsForm, type SettingsTabId } from "@/components/settings/settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DangerZone } from "@/components/settings/danger-zone";
import type { Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: "display", label: "Display" },
  { id: "account", label: "Account" },
  { id: "notifications", label: "Notifications" },
  { id: "billing", label: "Billing" },
  { id: "assistant", label: "AI Assistant" },
];

interface BillingSummary {
  tier: string;
  used: number;
  limit: number;
  periodLabel: string;
}

interface AssistantCopy {
  freeLabel: string;
  freeAnalyses: number;
  premiumLabel: string;
  premiumAnalyses: number;
}

interface SettingsTabsProps {
  settings: Settings;
  displayName: string;
  email: string;
  billing: BillingSummary;
  assistantCopy: AssistantCopy;
}

export function SettingsTabs({ settings, displayName, email, billing, assistantCopy }: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>("display");
  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <div>
      <nav>
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}

 >
              <span

 />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div>
        <div>{activeLabel}</div>
        <div>
          <div>
            <div>
              <div />
              <div>
                <div>{displayName}</div>
                <div>{email}</div>
              </div>
            </div>
            <ChangePasswordForm />
            <div>
              <DangerZone />
            </div>
          </div>

          <SettingsForm settings={settings} activeTab={activeTab} />

          <div>
            <div>
              <div>
                <div>{billing.tier} plan</div>
                <div>
                  {billing.used}/{billing.limit} AI analyses used this {billing.periodLabel}
                </div>
              </div>
              <Link
                href="/billing"

 >
                Manage billing
              </Link>
            </div>
          </div>

          <div>
            <div>Analysis depth</div>
            <p>
              {assistantCopy.freeLabel} includes {assistantCopy.freeAnalyses} AI analyses/month at top-line depth.{" "}
              {assistantCopy.premiumLabel} includes {assistantCopy.premiumAnalyses}/month with full methodology
              depth — extended historical analogs and granular confidence. Every output, on either plan, always
              shows its sources, historical analogs, and confidence level — depth differs, transparency doesn&apos;t.
            </p>
            {billing.tier === "free" && (
              <Link href="/billing">
                Upgrade for full depth →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
