"use client";

import { useActionState, useState, useTransition } from "react";
import { createAlert, deleteAlert, toggleAlert, type DeliveryWithAlert } from "@/lib/actions/alerts";
import {
  ALERT_TYPE_LABELS,
  COOLDOWN_OPTIONS,
  describeCondition,
  type Alert,
  type AlertType,
} from "@/lib/alerts";

const TYPES = Object.keys(ALERT_TYPE_LABELS) as AlertType[];

const inputClass =
  "w-full rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none";

interface AlertPanelProps {
  alerts: Alert[];
  deliveries: DeliveryWithAlert[];
}

export function AlertPanel({ alerts, deliveries }: AlertPanelProps) {
  const [error, formAction] = useActionState(createAlert, null);
  const [alertType, setAlertType] = useState<AlertType>("price");
  const [, startMutate] = useTransition();

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <div className="flex flex-col gap-6">
        <form action={formAction} className="rounded-card border border-line bg-panel p-5">
          <div className="mb-4 text-[11.5px] tracking-[0.06em] text-muted uppercase">New alert</div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] text-muted">Type</span>
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
              <span className="mb-1.5 block text-[12.5px] text-muted">
                {alertType === "ai_confidence" ? "Ticker or sector" : "Ticker"}
              </span>
              <input name="scope_value" placeholder="NVDA" required className={`${inputClass} uppercase`} />
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {(alertType === "price" || alertType === "pct_change") && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-muted">Direction</span>
                  <select name="comparator" className={inputClass}>
                    <option value="above" className="bg-panel">Above</option>
                    <option value="below" className="bg-panel">Below</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-muted">
                    {alertType === "price" ? "Price ($)" : "Day change (%)"}
                  </span>
                  <input name="value" type="number" step="any" required className={inputClass} />
                </label>
              </>
            )}

            {alertType === "volume_spike" && (
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] text-muted">Multiple of 30-day avg volume</span>
                <input name="multiplier" type="number" step="0.1" defaultValue={2} required className={inputClass} />
              </label>
            )}

            {alertType === "technical_crossover" && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-muted">Fast SMA (days)</span>
                  <input name="fastDays" type="number" defaultValue={50} required className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-muted">Slow SMA (days)</span>
                  <input name="slowDays" type="number" defaultValue={200} required className={inputClass} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-muted">Cross direction</span>
                  <select name="direction" className={inputClass}>
                    <option value="above" className="bg-panel">Fast crosses above slow</option>
                    <option value="below" className="bg-panel">Fast crosses below slow</option>
                  </select>
                </label>
              </>
            )}

            {alertType === "ai_confidence" && (
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] text-muted">Notify at confidence</span>
                <select name="minLevel" defaultValue="medium" className={inputClass}>
                  <option value="low" className="bg-panel">Low or higher</option>
                  <option value="medium" className="bg-panel">Medium or higher</option>
                  <option value="high" className="bg-panel">High only</option>
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-[12.5px] text-muted">Cooldown</span>
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
            <span className="mb-2 block text-[12.5px] text-muted">Deliver via</span>
            <div className="flex gap-4">
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
              Push and email are recorded but not delivered — no provider is wired yet, so those
              rows are logged as <span className="text-muted">unconfigured</span> rather than
              silently dropped.
            </p>
          </div>

          {error && error !== "saved" && <p className="mt-3 text-[13px] text-negative">{error}</p>}

          <button
            type="submit"
            className="mt-4 rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-[13.5px] font-semibold text-canvas"
          >
            Create alert
          </button>
        </form>

        {alerts.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
            No alerts yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-line bg-panel">
            <div className="grid grid-cols-[0.9fr_1fr_1.5fr_0.8fr_0.7fr_70px] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
              <div>Symbol</div>
              <div>Type</div>
              <div>Condition</div>
              <div>Cooldown</div>
              <div>Status</div>
              <div />
            </div>
            {alerts.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[0.9fr_1fr_1.5fr_0.8fr_0.7fr_70px] items-center border-b border-line px-5 py-3.5 last:border-b-0"
              >
                <div className="text-sm text-primary">{a.scope_value}</div>
                <div className="text-[12.5px] text-muted">{ALERT_TYPE_LABELS[a.alert_type]}</div>
                <div className="text-[12.5px] text-muted">{describeCondition(a.alert_type, a.condition)}</div>
                <div className="text-[12.5px] text-muted">
                  {COOLDOWN_OPTIONS.find((o) => o.value === a.cooldown_seconds)?.label ??
                    `${a.cooldown_seconds}s`}
                </div>
                <button
                  type="button"
                  onClick={() => startMutate(() => toggleAlert(a.id, !a.enabled))}
                  className={`flex items-center gap-1.5 text-[12.5px] ${a.enabled ? "text-accent" : "text-muted"}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${a.enabled ? "bg-accent" : "bg-muted"}`} />
                  {a.enabled ? "Active" : "Paused"}
                </button>
                <button
                  type="button"
                  onClick={() => startMutate(() => deleteAlert(a.id))}
                  className="text-[12.5px] text-muted hover:text-negative"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="rounded-card border border-line bg-panel p-5">
        <div className="mb-3 text-[11.5px] tracking-[0.06em] text-muted uppercase">Recent notifications</div>
        {deliveries.length === 0 ? (
          <p className="text-[12.5px] text-dim">Nothing yet — alerts appear here when they fire.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {deliveries.map((d) => (
              <div key={d.id} className="border-b border-line pb-3 last:border-b-0 last:pb-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12.5px] text-primary">{d.scope_value}</span>
                  <span className="text-[11px] text-dim">
                    {new Date(d.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">{d.message ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
