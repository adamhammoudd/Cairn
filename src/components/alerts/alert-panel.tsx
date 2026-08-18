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
    <div>
      <div>
        <div>
          <div>Portfolio · Alerts</div>
          <h1>Alerts</h1>
          <p>
            {activeCount} active. Each fires once per cooldown window, then goes quiet.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((prev) => !prev)}

 >
          {formOpen ? "Close" : "+ New alert"}
        </button>
      </div>

      {formOpen && (
        <form action={formAction}>
          <div>New alert</div>

          <div>
            <label>
              <span>Type</span>
              <select
                name="alert_type"
                value={alertType}
                onChange={(e) => setAlertType(e.target.value as AlertType)}

 >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ALERT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{alertType === "ai_confidence" ? "Ticker or sector" : "Ticker"}</span>
              <input name="scope_value" placeholder="NVDA" required />
            </label>
          </div>

          <div>
            {(alertType === "price" || alertType === "pct_change") && (
              <>
                <label>
                  <span>Direction</span>
                  <select name="comparator">
                    <option value="above">
                      Above
                    </option>
                    <option value="below">
                      Below
                    </option>
                  </select>
                </label>
                <label>
                  <span>{alertType === "price" ? "Price ($)" : "Day change (%)"}</span>
                  <input name="value" type="number" step="any" required />
                </label>
              </>
            )}

            {alertType === "volume_spike" && (
              <label>
                <span>Multiple of 30-day avg volume</span>
                <input name="multiplier" type="number" step="0.1" defaultValue={2} required />
              </label>
            )}

            {alertType === "technical_crossover" && (
              <>
                <label>
                  <span>Fast SMA (days)</span>
                  <input name="fastDays" type="number" defaultValue={50} required />
                </label>
                <label>
                  <span>Slow SMA (days)</span>
                  <input name="slowDays" type="number" defaultValue={200} required />
                </label>
                <label>
                  <span>Cross direction</span>
                  <select name="direction">
                    <option value="above">
                      Fast crosses above slow
                    </option>
                    <option value="below">
                      Fast crosses below slow
                    </option>
                  </select>
                </label>
              </>
            )}

            {alertType === "ai_confidence" && (
              <label>
                <span>Notify at confidence</span>
                <select name="minLevel" defaultValue="medium">
                  <option value="low">
                    Low or higher
                  </option>
                  <option value="medium">
                    Medium or higher
                  </option>
                  <option value="high">
                    High only
                  </option>
                </select>
              </label>
            )}

            <label>
              <span>Cooldown</span>
              <select name="cooldown_seconds" defaultValue={3600}>
                {COOLDOWN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span>Deliver via</span>
            <div>
              <label>
                <input type="checkbox" name="channels" value="in_app" defaultChecked />
                In-app
              </label>
              <label title="Needs a push provider">
                <input type="checkbox" name="channels" value="push" />
                Push
              </label>
              <label title="Needs an email provider">
                <input type="checkbox" name="channels" value="email" />
                Email
              </label>
            </div>
            <p>
              Push and email are recorded but not delivered — no provider is wired yet, so those rows are logged as{" "}
              <span>unconfigured</span> rather than silently dropped.
            </p>
          </div>

          {error && error !== "saved" && <p>{error}</p>}

          <button
            type="submit"

 >
            Create alert
          </button>
        </form>
      )}

      <div>
        <aside>
          <div>
            Recent deliveries
          </div>
          {deliveries.length === 0 ? (
            <p>Nothing yet — alerts appear here when they fire.</p>
          ) : (
            deliveries.map((d) => (
              <div key={d.id}>
                <span />
                <div>
                  <div>
                    {d.message ?? `${d.scope_value} alert fired.`}
                  </div>
                  <div suppressHydrationWarning>
                    {CHANNEL_LABELS[d.channel] ?? d.channel} ·{" "}
                    {new Date(d.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>

        <div>
          {alerts.length === 0 ? (
            <div>
              <div>No markers set</div>
              <p>
                Create an alert and Cairn watches for the condition, then goes quiet for the cooldown window.
              </p>
            </div>
          ) : (
            alerts.map((a, index) => (
              <div
                key={a.id}

 >
                <div>
                  <div>
                    <span

 >
                      {a.scope_value}
                    </span>
                    <span>
                      {ALERT_TYPE_LABELS[a.alert_type]}
                    </span>
                  </div>

                  <div>
                    {describeCondition(a.alert_type, a.condition)}
                  </div>

                  <div>
                    <span>
                      Cooldown {cooldownLabel(a.cooldown_seconds)}
                    </span>
                    {a.channels.map((ch) => (
                      <span key={ch}>
                        {CHANNEL_LABELS[ch] ?? ch}
                      </span>
                    ))}
                  </div>
                </div>

                <div

                  suppressHydrationWarning
 >
                  {a.last_triggered_at
                    ? `Triggered ${new Date(a.last_triggered_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : "Not yet triggered"}
                </div>

                <div>
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
      </div>
    </div>
  );
}
