"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
import { SubmitButton } from "@/components/auth/submit-button";
import type { AlertChannelName, AssetFilter, ChartView, Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];
export type SettingsTabId = "display" | "account" | "notifications" | "billing" | "assistant";

const CHART_VIEWS: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD"];
// 15s is the floor useLiveRefresh() enforces; offering 10 here meant the
// setting said one thing and the timer did another.
const REFRESH_RATES = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

// Mirrors ASSET_TYPE_LABEL in lib/screener so the Settings wording and the
// Markets filter pills cannot drift apart.
const ASSET_FILTERS: { value: AssetFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "equity", label: "Equities" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  // `index` is a real asset type since migration 0027; this used to say
  // Indices while storing `future`.
  { value: "index", label: "Indices" },
];

const ALERT_CHANNELS: { value: AlertChannelName; label: string; hint?: string }[] = [
  { value: "in_app", label: "In-app" },
  { value: "push", label: "Push", hint: "Needs a push provider" },
  { value: "email", label: "Email", hint: "Needs an email provider" },
];

const SELECT_CLASS =
  "rounded-md border border-line bg-transparent px-3.5 py-1.5 text-[12.5px] text-primary outline-none";
const PILL_CLASS =
  "cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary";

interface SettingsFormProps {
  settings: Settings;
  activeTab: SettingsTabId;
}

export function SettingsForm({ settings, activeTab }: SettingsFormProps) {
  const [result, formAction] = useActionState(updateSettings, null);
  const notificationThreshold = (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;
  // Every tab renders its inputs into this one form, and hidden inputs still
  // submit, so a save from any tab persists the whole preference set. The Save
  // row only shows on the tabs that actually own editable preferences.
  const showSave = activeTab === "display" || activeTab === "notifications" || activeTab === "assistant";
  const channels = settings.default_alert_channels ?? ["in_app"];

  return (
    <form action={formAction}>
      <div className={activeTab === "display" ? "block" : "hidden"}>
        <Row label="Default chart timeframe" hint="Applied when opening a ticker">
          <div className="flex flex-wrap gap-1.5">
            {CHART_VIEWS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="default_chart_view"
                  value={v}
                  defaultChecked={settings.default_chart_view === v}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{v}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Default Markets category" hint="Which asset-type filter the Markets page opens on">
          <select
            name="default_asset_filter"
            defaultValue={settings.default_asset_filter ?? "all"}
            className={SELECT_CLASS}
          >
            {ASSET_FILTERS.map((f) => (
              <option key={f.value} value={f.value} className="bg-panel">
                {f.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Default comparison timeframe" hint="Which timeframe the Compare page opens on">
          <div className="flex flex-wrap gap-1.5">
            {CHART_VIEWS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="default_comparison_timeframe"
                  value={v}
                  defaultChecked={(settings.default_comparison_timeframe ?? "3M") === v}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{v}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Currency">
          <select name="currency" defaultValue={settings.currency} className={SELECT_CLASS}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c} className="bg-panel">
                {c}
              </option>
            ))}
          </select>
        </Row>

        {/* The claim this control makes has to match what the code does. It
            re-runs Base Camp's queries on a timer while the market is open and
            the tab is focused - it does not make prices live, because no
            live-quote provider is configured; every price in Cairn is the last
            daily close. Saying "how often live prices update" (the previous
            copy) was a promise nothing in the codebase kept. */}
        <Row
          label="Refresh rate"
          hint="How often Base Camp re-runs its queries, while the market is open and this tab is in the foreground. Prices are last-close figures, not a live feed, so this refetches the same daily closes - it does not make them live."
        >
          <select name="refresh_rate_seconds" defaultValue={settings.refresh_rate_seconds} className={SELECT_CLASS}>
            {REFRESH_RATES.map((r) => (
              <option key={r.value} value={r.value} className="bg-panel">
                {r.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Density" hint="Compact reduces row height across tables">
          <div className="flex gap-1.5">
            {(["comfortable", "compact"] as const).map((d) => (
              <label key={d}>
                <input
                  type="radio"
                  name="compact_mode"
                  value={d === "compact" ? "on" : "off"}
                  defaultChecked={settings.compact_mode === (d === "compact")}
                  className="peer sr-only"
                />
                <span className={`${PILL_CLASS} capitalize`}>{d}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Show percent vs. dollar change">
          <div className="flex gap-1.5">
            {(
              [
                { value: "percent", label: "Percent" },
                { value: "absolute", label: "Dollar" },
              ] as const
            ).map((m) => (
              <label key={m.value}>
                <input
                  type="radio"
                  name="metric_style"
                  value={m.value}
                  defaultChecked={settings.metric_style === m.value}
                  className="peer sr-only"
                />
                <span className={PILL_CLASS}>{m.label}</span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Extended hours" hint="Show pre-market and after-hours pricing">
          <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
        </Row>
      </div>

      <div className={activeTab === "notifications" ? "block" : "hidden"}>
        <Row label="Price move alert" hint="Minimum % move before a price alert can fire">
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="price_move_threshold"
              defaultValue={notificationThreshold}
              min={0.1}
              step={0.1}
              className="w-20 rounded-md border border-line bg-transparent px-3 py-1.5 text-right text-[12.5px] text-primary outline-none"
            />
            <span className="text-[12.5px] text-muted">%</span>
          </div>
        </Row>

        <Row
          label="Default alert delivery"
          hint="Pre-checked on the New alert form. Push and email are recorded but not delivered until a provider is wired."
        >
          <div className="flex flex-wrap gap-3.5">
            {ALERT_CHANNELS.map((c) => (
              <label
                key={c.value}
                title={c.hint}
                className={`flex items-center gap-2 text-[12.5px] ${
                  c.value === "in_app" ? "text-primary" : "text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  name="default_alert_channels"
                  value={c.value}
                  defaultChecked={channels.includes(c.value)}
                  className="accent-accent"
                />
                {c.label}
              </label>
            ))}
          </div>
        </Row>
      </div>

      <div className={activeTab === "assistant" ? "block" : "hidden"}>
        <Row
          label="Show methodology by default"
          hint="Expand sources and historical analogs on every answer without a click."
        >
          <Toggle name="assistant_expand_methodology" defaultChecked={settings.assistant_expand_methodology ?? true} />
        </Row>

        <Row
          label="Portfolio context"
          hint="Let the assistant read your holdings and watchlists when deciding what is relevant. Answers stay market/sector/ticker-level either way — Cairn never analyses your position or resolves to buy, hold, or sell."
        >
          <Toggle
            name="assistant_use_portfolio_context"
            defaultChecked={settings.assistant_use_portfolio_context ?? true}
          />
        </Row>
      </div>

      <div className={showSave ? "flex items-center gap-3 border-t border-line px-4.5 py-4" : "hidden"}>
        <SubmitButton>Save changes</SubmitButton>
        {result === "saved" && <span className="text-[13px] text-accent">Saved.</span>}
        {result && result !== "saved" && <span className="text-[13px] text-negative">{result}</span>}
      </div>
    </form>
  );
}

// Full-bleed rows on a hairline divider, matching every other list card in the
// app (Markets, Alerts, Watchlists). The previous build nested them inside a
// p-6 box, so the dividers stopped short of the card edge and Settings was the
// only page whose rows did not line up with its own border.
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0 max-sm:w-full">
        <div className="text-[13px] text-primary">{label}</div>
        {hint && <div className="mt-1 max-w-[440px] text-[11.5px] leading-relaxed text-muted text-pretty">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
