import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/settings/settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DangerZone } from "@/components/settings/danger-zone";
import { getBillingSummary } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";

const CATEGORIES = [
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
  { id: "notifications", label: "Notifications" },
  { id: "billing", label: "Billing" },
  { id: "assistant", label: "AI Assistant" },
];

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
    <div className="flex max-w-[760px] flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl text-primary">Settings</h1>
        <p className="mt-1 text-[13px] text-muted">Account, display, notifications, billing, and AI assistant preferences.</p>
        <nav className="mt-4 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-lg px-3 py-1.5 text-[12.5px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
            >
              {c.label}
            </a>
          ))}
        </nav>
      </div>

      <section id="account" className="flex flex-col gap-4">
        <h2 className="text-xs tracking-[0.08em] text-muted uppercase">Account</h2>
        <div className="rounded-card border border-line bg-panel p-6">
          <div className="mb-5 flex items-center gap-4">
            <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-gradient-to-br from-accent-light to-accent-dark" />
            <div>
              <div className="text-[15px] text-primary">{profile?.display_name || "Account"}</div>
              <div className="text-[13px] text-muted">{user.email}</div>
            </div>
          </div>
          <ChangePasswordForm />
        </div>
        <DangerZone />
      </section>

      <SettingsForm settings={settings} />

      <section id="billing" className="flex flex-col gap-4">
        <h2 className="text-xs tracking-[0.08em] text-muted uppercase">Billing</h2>
        <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-panel p-6">
          <div>
            <div className="text-sm text-primary capitalize">{billing.tier} plan</div>
            <div className="text-[12.5px] text-muted">
              {billing.used}/{billing.limit} AI analyses used this {billing.periodLabel}
            </div>
          </div>
          <Link
            href="/billing"
            className="rounded-lg border border-line px-4 py-2 text-[13px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
          >
            Manage billing
          </Link>
        </div>
      </section>

      <section id="assistant" className="flex flex-col gap-4">
        <h2 className="text-xs tracking-[0.08em] text-muted uppercase">AI Assistant</h2>
        <div className="rounded-card border border-line bg-panel p-6">
          <div className="mb-3 text-sm text-primary">Analysis depth</div>
          <p className="text-[12.5px] leading-relaxed text-muted">
            {TIER_LIMITS.free.label} includes {TIER_LIMITS.free.monthlyAiAnalyses} AI analyses/month at top-line
            depth. {TIER_LIMITS.premium.label} includes {TIER_LIMITS.premium.monthlyAiAnalyses}/month with full
            methodology depth — extended historical analogs and granular confidence. Every output, on either plan,
            always shows its sources, historical analogs, and confidence level — depth differs, transparency doesn&apos;t.
          </p>
          {billing.tier === "free" && (
            <Link href="/billing" className="mt-3 inline-block text-[12.5px] text-accent hover:underline">
              Upgrade for full depth →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
