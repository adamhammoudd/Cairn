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
    <div className="grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[232px_1fr]">
      <nav className="flex flex-col gap-1 rounded-card border border-line bg-panel p-1.75">
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px] whitespace-nowrap transition-colors duration-fast ease-standard ${
                active ? "bg-active text-primary" : "text-muted hover:bg-active/60 hover:text-primary"
              }`}
            >
              <span
                className={`h-3.5 w-[3px] shrink-0 rounded-full transition-colors duration-base ease-standard ${
                  active ? "bg-accent" : "bg-transparent"
                }`}
              />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="rounded-card border border-line bg-panel">
        <div className="border-b border-line px-6 py-4 font-serif text-lg text-primary">{activeLabel}</div>
        <div className="p-6">
          <div className={activeTab === "account" ? "flex flex-col gap-5" : "hidden"}>
            <div className="flex items-center gap-4">
              <div className="h-13 w-13 shrink-0 rounded-full bg-gradient-to-br from-accent-light to-accent-dark" />
              <div>
                <div className="text-[15px] text-primary">{displayName}</div>
                <div className="text-[13px] text-muted">{email}</div>
              </div>
            </div>
            <ChangePasswordForm />
            <div className="border-t border-line pt-5">
              <DangerZone />
            </div>
          </div>

          <SettingsForm settings={settings} activeTab={activeTab} />

          <div className={activeTab === "billing" ? "flex flex-col gap-4" : "hidden"}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-primary capitalize">{billing.tier} plan</div>
                <div className="mt-0.5 text-[12.5px] text-muted">
                  {billing.used}/{billing.limit} AI analyses used this {billing.periodLabel}
                </div>
              </div>
              <Link
                href="/billing"
                className="shrink-0 rounded-lg border border-line px-4 py-2 text-[13px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
              >
                Manage billing
              </Link>
            </div>
          </div>

          <div className={activeTab === "assistant" ? "flex flex-col gap-3" : "hidden"}>
            <div className="text-sm text-primary">Analysis depth</div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              {assistantCopy.freeLabel} includes {assistantCopy.freeAnalyses} AI analyses/month at top-line depth.{" "}
              {assistantCopy.premiumLabel} includes {assistantCopy.premiumAnalyses}/month with full methodology
              depth — extended historical analogs and granular confidence. Every output, on either plan, always
              shows its sources, historical analogs, and confidence level — depth differs, transparency doesn&apos;t.
            </p>
            {billing.tier === "free" && (
              <Link href="/billing" className="text-[12.5px] text-accent hover:underline">
                Upgrade for full depth →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
