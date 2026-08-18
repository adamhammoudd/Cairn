"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
import { SubmitButton } from "@/components/auth/submit-button";
import type { Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];
export type SettingsTabId = "display" | "account" | "notifications" | "billing" | "assistant";

const CHART_VIEWS = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD"];
const REFRESH_RATES = [
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

interface SettingsFormProps {
  settings: Settings;
  activeTab: SettingsTabId;
}

export function SettingsForm({ settings, activeTab }: SettingsFormProps) {
  const [result, formAction] = useActionState(updateSettings, null);
  const notificationThreshold =
    (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;
  const showSave = activeTab === "display" || activeTab === "notifications";

  return (
    <form action={formAction}>
      <div>
        <Row label="Default chart timeframe" hint="Applied when opening a ticker">
          <div>
            {CHART_VIEWS.map((v) => (
              <label key={v}>
                <input
                  type="radio"
                  name="default_chart_view"
                  value={v}
                  defaultChecked={settings.default_chart_view === v}

 />
                <span>
                  {v}
                </span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Currency">
          <select
            name="currency"
            defaultValue={settings.currency}

 >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Refresh rate" hint="How often live prices update">
          <select
            name="refresh_rate_seconds"
            defaultValue={settings.refresh_rate_seconds}

 >
            {REFRESH_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Density" hint="Compact reduces row height across tables">
          <div>
            {(["comfortable", "compact"] as const).map((d) => (
              <label key={d}>
                <input
                  type="radio"
                  name="compact_mode"
                  value={d === "compact" ? "on" : "off"}
                  defaultChecked={settings.compact_mode === (d === "compact")}

 />
                <span>
                  {d}
                </span>
              </label>
            ))}
          </div>
        </Row>

        <Row label="Show percent vs. dollar change">
          <div>
            <label>
              <input
                type="radio"
                name="metric_style"
                value="percent"
                defaultChecked={settings.metric_style === "percent"}

 />
              <span>
                Percent
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="metric_style"
                value="absolute"
                defaultChecked={settings.metric_style === "absolute"}

 />
              <span>
                Dollar
              </span>
            </label>
          </div>
        </Row>

        <Row label="Extended hours" hint="Show pre-market and after-hours pricing">
          <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
        </Row>
      </div>

      <div>
        <Row label="Price move alert" hint="Minimum % move before a price alert can fire">
          <div>
            <input
              type="number"
              name="price_move_threshold"
              defaultValue={notificationThreshold}
              min={0.1}
              step={0.1}

 />
            <span>%</span>
          </div>
        </Row>
      </div>

      <div>
        <SubmitButton>Save changes</SubmitButton>
        {result === "saved" && <span>Saved.</span>}
        {result && result !== "saved" && <span>{result}</span>}
      </div>
    </form>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div>
        <div>{label}</div>
        {hint && <div>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
