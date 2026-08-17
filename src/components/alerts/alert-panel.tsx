"use client";

import { useActionState, useState, useTransition } from "react";
import { createAlert, deleteAlert, toggleAlert, type DeliveryWithAlert } from "@/lib/actions/alerts";
import { Switch } from "@/components/switch";
import {
  ALERT_TYPE_LABELS,
  COOLDOWN_OPTIONS,
  describeCondition,
  type Alert,
  type AlertChannel,
  type AlertType,
} from "@/lib/alerts";

const TYPES = Object.keys(ALERT_TYPE_LABELS) as AlertType[];

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  in_app: "In-app",
  push: "Push",
  email: "Email",
};

const LABEL = "mb-1.75 block text-[12px] text-muted";
const inputClass =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2.25 text-[12.5px] text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

interface AlertPanelProps {
  alerts: Alert[];
  deliveries: DeliveryWithAlert[];
}

export function AlertPanel({ alerts, deliveries }: AlertPanelProps) {
  const [error, formAction] = useActionState(createAlert, null);
  const [alertType, setAlertType] = useState<AlertType>("price");
  const [formOpen, setFormOpen] = useState(false);
  const [, startMutate] = useTransition();

  const activeCount = alerts.filter((a) => a.enabled).length;

  function cooldownLabel(seconds: number) {
    return COOLDOWN_OPTIONS.find((o) => o.value === seconds)?.label ?? `${seconds}s`;
  }

  return (
    <div className="animate-page-in flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Portfolio · Alerts</div>
          <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">Alerts</h1>
          <p className="mt-1.5 max-w-[560px] text-[13.5px] text-muted text-pretty">
            {activeCount} active. Each fires once per cooldown window, then goes quiet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((prev) => !prev)}
          className="rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
        >
          {formOpen ? "Close" : "+ New alert"}
        </button>
      </div>

      {formOpen && (
        <form action={formAction} className="animate-menu-in rounded-card border border-line bg-panel p-4.5">
          <div className="mb-3.5 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">New alert</div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL}>Type</span>
              <select
                name="alert_type"
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as AlertType)}
                className={inputClass}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t} className="bg-panel">
                    {ALERT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={LABEL}>{alertType === "ai_confidence" ? "Ticker or sector" : "Ticker"}</span>
              <input name="scope_value" placeholder="NVDA" required className={`${inputClass} uppercase`} />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(alertType === "price" || alertType === "pct_change") && (
              <>
                <label className="block">
                  <span className={LABEL}>Direction</span>
                  <select name="comparator" className={inputClass}>
                    <option value="above" className="bg-panel">
                      Above
                    </option>
                    <option value="below" className="bg-panel">
                      Below
                    </option>
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>{alertType === "price" ? "Price ($)" : "Day change (%)"}</span>
                  <input name="value" type="number" step="any" required className={inputClass} />
                </label>
              </>
            )}

            {alertType === "volume_spike" && (
              <label className="block">
                <span className={LABEL}>Multiple of 30-day avg volume</span>
                <input name="multiplier" type="number" step="0.1" defaultValue={2} required className={inputClass} />
              </label>
            )}

            {alertType === "technical_crossover" && (
              <>
                <label className="block">
                  <span className={LABEL}>Fast SMA (days)</span>
                  <input name="fastDays" type="number" defaultValue={50} required className={inputClass} />
                </label>
                <label className="block">
                  <span className={LABEL}>Slow SMA (days)</span>
                  <input name="slowDays" type="number" defaultValue={200} required className={inputClass} />
                </label>
                <label className="block">
                  <span className={LABEL}>Cross direction</span>
                  <select name="direction" className={inputClass}>
                    <option value="above" className="bg-panel">
                      Fast crosses above slow
                    </option>
                    <option value="below" className="bg-panel">
                      Fast crosses below slow
                    </option>
                  </select>
                </label>
              </>
            )}

            {alertType === "ai_confidence" && (
              <label className="block">
                <span className={LABEL}>Notify at confidence</span>
                <select name="minLevel" defaultValue="medium" className={inputClass}>
                  <option value="low" className="bg-panel">
                    Low or higher
                  </option>
                  <option value="medium" className="bg-panel">
                    Medium or higher
                  </option>
                  <option value="high" className="bg-panel">
                    High only
                  </option>
                </select>
              </label>
            )}

            <label className="block">
              <span className={LABEL}>Cooldown</span>
              <select name="cooldown_seconds" defaultValue={3600} className={inputClass}>
                {COOLDOWN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-panel">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-[12px] text-muted">Deliver via</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[13px] text-primary">
                <input type="checkbox" name="channels" value="in_app" defaultChecked className="accent-accent" />
                In-app
              </label>
              <label className="flex items-center gap-2 text-[13px] text-muted" title="Needs a push provider">
                <input type="checkbox" name="channels" value="push" className="accent-accent" />
                Push
              </label>
              <label className="flex items-center gap-2 text-[13px] text-muted" title="Needs an email provider">
                <input type="checkbox" name="channels" value="email" className="accent-accent" />
                Email
              </label>
            </div>
            <p className="mt-2 text-[11.5px] text-dim">
              Push and email are recorded but not delivered — no provider is wired yet, so those rows are logged as{" "}
              <span className="text-muted">unconfigured</span> rather than silently dropped.
            </p>
          </div>

          {error && error !== "saved" && <p className="mt-3 text-[13px] text-negative">{error}</p>}

          <button
            type="submit"
            className="mt-4 rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
          >
            Create alert
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-2.5">
          {alerts.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
              <div className="font-serif text-[20px] text-primary">No markers set</div>
              <p className="mx-auto mt-2 max-w-[380px] text-[13px] text-muted text-pretty">
                Create an alert and Cairn watches for the condition, then goes quiet for the cooldown window.
              </p>
            </div>
          ) : (
            alerts.map((a, index) => (
              <div
                key={a.id}
                className={`animate-rise-in flex flex-wrap items-center gap-4 rounded-xl border bg-panel p-4.5 transition-colors duration-base ease-standard ${
                  a.enabled ? "border-line" : "border-[#1C1C1C]"
                }`}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`text-[14px] transition-colors duration-base ease-standard ${
                        a.enabled ? "text-primary" : "text-dim"
                      }`}
                    >
                      {a.scope_value}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.75 font-mono text-[9.5px] tracking-[0.1em] text-muted uppercase">
                      {ALERT_TYPE_LABELS[a.alert_type]}
                    </span>
                  </div>

                  <div className="mt-1.75 text-[12.5px] text-muted">
                    {describeCondition(a.alert_type, a.condition)}
                  </div>

                  <div className="mt-2.25 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] tracking-[0.1em] text-dim uppercase">
                      Cooldown {cooldownLabel(a.cooldown_seconds)}
                    </span>
                    {a.channels.map((ch) => (
                      <span key={ch} className="rounded-full border border-line px-2 py-0.75 text-[10.5px] text-muted">
                        {CHANNEL_LABELS[ch] ?? ch}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className={`min-w-[130px] text-[11.5px] ${a.last_triggered_at ? "text-accent" : "text-dim"}`}
                  suppressHydrationWarning
                >
                  {a.last_triggered_at
                    ? `Triggered ${new Date(a.last_triggered_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : "Not yet triggered"}
                </div>

                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={a.enabled}
                    label={`${a.enabled ? "Pause" : "Enable"} ${a.scope_value} alert`}
                    onToggle={() => startMutate(() => toggleAlert(a.id, !a.enabled))}
                  />
                  <button
                    type="button"
                    onClick={() => startMutate(() => deleteAlert(a.id))}
                    aria-label={`Delete ${a.scope_value} alert`}
                    title="Delete"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-negative transition-colors duration-fast ease-standard hover:bg-negative/12"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <aside className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="border-b border-line px-4 py-3.25 font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
            Recent deliveries
          </div>
          {deliveries.length === 0 ? (
            <p className="px-4 py-5 text-[12.5px] text-dim">Nothing yet — alerts appear here when they fire.</p>
          ) : (
            deliveries.map((d) => (
              <div key={d.id} className="flex gap-2.75 border-b border-line px-4 py-3.5 last:border-b-0">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <div className="text-[12.5px] leading-relaxed text-primary text-pretty">
                    {d.message ?? `${d.scope_value} alert fired.`}
                  </div>
                  <div className="mt-1.25 text-[11px] text-dim" suppressHydrationWarning>
                    {CHANNEL_LABELS[d.channel] ?? d.channel} ·{" "}
                    {new Date(d.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
