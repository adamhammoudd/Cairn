"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
import { SubmitButton } from "@/components/auth/submit-button";
import type { Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

const CHART_VIEWS = ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD"];
const REFRESH_RATES = [
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
];

export function SettingsForm({ settings }: { settings: Settings }) {
  const [result, formAction] = useActionState(updateSettings, null);
  const notificationThreshold =
    (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <section id="display" className="flex flex-col gap-4">
        <h2 className="text-xs tracking-[0.08em] text-muted uppercase">Display</h2>
        <div className="rounded-card border border-line bg-panel p-6">

        <div className="flex flex-col gap-5">
          <Row label="Default chart timeframe" hint="Applied when opening a ticker">
            <div className="flex gap-1.5">
              {CHART_VIEWS.map((v) => (
                <label key={v}>
                  <input
                    type="radio"
                    name="default_chart_view"
                    value={v}
                    defaultChecked={settings.default_chart_view === v}
                    className="peer sr-only"
                  />
                  <span className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary">
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
              className="rounded-md border border-line bg-transparent px-3.5 py-1.5 text-[12.5px] text-primary outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-panel">
                  {c}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Refresh rate" hint="How often live prices update">
            <select
              name="refresh_rate_seconds"
              defaultValue={settings.refresh_rate_seconds}
              className="rounded-md border border-line bg-transparent px-3.5 py-1.5 text-[12.5px] text-primary outline-none"
            >
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
                  <span className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted capitalize peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary">
                    {d}
                  </span>
                </label>
              ))}
            </div>
          </Row>

          <Row label="Show percent vs. dollar change">
            <div className="flex gap-1.5">
              <label>
                <input
                  type="radio"
                  name="metric_style"
                  value="percent"
                  defaultChecked={settings.metric_style === "percent"}
                  className="peer sr-only"
                />
                <span className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary">
                  Percent
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="metric_style"
                  value="absolute"
                  defaultChecked={settings.metric_style === "absolute"}
                  className="peer sr-only"
                />
                <span className="cursor-pointer rounded-md border border-line px-3 py-1.5 text-[12.5px] text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary">
                  Dollar
                </span>
              </label>
            </div>
          </Row>

          <Row label="Extended hours" hint="Show pre-market and after-hours pricing">
            <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
          </Row>
        </div>
        </div>
      </section>

      <section id="notifications" className="flex flex-col gap-4">
        <h2 className="text-xs tracking-[0.08em] text-muted uppercase">Notifications</h2>
        <div className="rounded-card border border-line bg-panel p-6">
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
        </div>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton>Save changes</SubmitButton>
        {result === "saved" && <span className="text-[13px] text-accent">Saved.</span>}
        {result && result !== "saved" && <span className="text-[13px] text-negative">{result}</span>}
      </div>
    </form>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="mb-0.5 text-sm text-primary">{label}</div>
        {hint && <div className="text-[12.5px] text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
