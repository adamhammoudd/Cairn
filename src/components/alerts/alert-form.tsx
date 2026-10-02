"use client";

import { useActionState, useEffect, useState } from "react";
import { alertThresholdCurrency, createAlert, updateAlert } from "@/lib/actions/alerts";
import { MAX_AMOUNT_INPUT } from "@/lib/input-limits";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
import {
  ALERT_TYPE_LABELS,
  alertCurrency,
  COOLDOWN_OPTIONS,
  type Alert,
  type AlertChannel,
  type AlertType,
} from "@/lib/alerts";
import { FIELD_LABEL } from "@/components/field-label";

const TYPES = Object.keys(ALERT_TYPE_LABELS) as AlertType[];

export const CHANNEL_LABELS: Record<AlertChannel, string> = {
  in_app: "In-app",
  push: "Push",
  email: "Email",
};

const CHANNELS: { value: AlertChannel; hint?: string }[] = [
  { value: "in_app" },
  { value: "push", hint: "Needs a push provider" },
  { value: "email", hint: "Needs an email provider" },
];

const LABEL = FIELD_LABEL;
const inputClass =
  "w-full rounded-control border border-line bg-canvas px-3 py-2 text-body text-primary outline-none transition-colors duration-base ease-standard focus:border-accent";

function num(condition: Record<string, unknown>, key: string, fallback: number) {
  const v = Number(condition[key]);
  return Number.isFinite(v) ? v : fallback;
}

function str(condition: Record<string, unknown>, key: string, fallback: string) {
  const v = condition[key];
  return typeof v === "string" ? v : fallback;
}

interface AlertFormProps {
  /** Present = edit an existing alert; absent = create a new one. */
  alert?: Alert;
  /** Pre-checked delivery channels for a new alert (Settings › Notifications). */
  defaultChannels: AlertChannel[];
  onDone: () => void;
  onCancel: () => void;
}

export function AlertForm({ alert, defaultChannels, onDone, onCancel }: AlertFormProps) {
  const editing = Boolean(alert);
  const [error, formAction] = useActionState(editing ? updateAlert : createAlert, null);
  const [alertType, setAlertType] = useState<AlertType>(alert?.alert_type ?? "price");
  const condition = alert?.condition ?? {};
  const channels = alert ? alert.channels : defaultChannels;

  // Controlled condition fields. React 19 resets an uncontrolled form once its
  // action settles, so a validation error (e.g. fast SMA >= slow SMA) used to
  // blank every number the user had entered. Holding them in state preserves
  // them across a failed submit, matching new-watchlist-form.tsx.
  const [cond, setCond] = useState({
    comparator: str(condition, "comparator", "above"),
    // Stored as typed, in the asset's own currency - nothing to convert back.
    value: "value" in condition ? String(num(condition, "value", 0)) : "",
    multiplier: String(num(condition, "multiplier", 2)),
    fastDays: String(num(condition, "fastDays", 50)),
    slowDays: String(num(condition, "slowDays", 200)),
    direction: str(condition, "direction", "above"),
    minLevel: str(condition, "minLevel", "medium"),
    cooldown_seconds: String(alert?.cooldown_seconds ?? 3600),
  });
  const setC = <K extends keyof typeof cond>(key: K, v: string) => setCond((c) => ({ ...c, [key]: v }));

  // The threshold is typed in the ASSET's currency, so the label names it:
  // "Alert when NVDA is above ___ USD". Looked up on the server for the picked
  // symbol (the same resolver the save uses); an existing alert starts from the
  // currency stored on it.
  const [symbol, setSymbol] = useState<string | null>(alert?.scope_value ?? null);
  const [thresholdCurrency, setThresholdCurrency] = useState<string | null | undefined>(
    alert?.alert_type === "price" ? alertCurrency(condition) : undefined,
  );
  useEffect(() => {
    if (!symbol) return;
    let live = true;
    alertThresholdCurrency(symbol).then((c) => {
      if (live) setThresholdCurrency(c);
    });
    return () => {
      live = false;
    };
  }, [symbol]);
  const priceLabel = symbol ? `Alert when ${symbol} is ${cond.comparator === "below" ? "below" : "above"}` : "Price";
  const priceUnit = !symbol ? "pick a ticker" : thresholdCurrency === undefined ? "…" : (thresholdCurrency ?? "currency unknown");

  // The action returns the sentinel "saved" rather than redirecting, so the
  // panel closes the form (and drops back to the list) only once the write
  // actually succeeded.
  useEffect(() => {
    if (error === "saved") onDone();
  }, [error, onDone]);

  return (
    <form
      action={formAction}
      className="animate-rise-in relative overflow-hidden rounded-2xl border border-line-soft bg-panel px-5.5 py-5"
      style={{ animationDelay: "140ms" }}
    >
      <span
        aria-hidden
        className="absolute top-0 right-0 left-0 h-px"
        style={{ background: "linear-gradient(90deg,var(--color-accent),rgba(47,198,133,0))" }}
      />
      {alert && <input type="hidden" name="id" value={alert.id} />}
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div className="font-mono text-eyebrow tracking-[0.18em] text-accent uppercase">
          {editing ? `Edit alert · ${alert!.scope_value}` : "New alert"}
        </div>
        {editing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-control px-2 py-1 text-caption text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
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

        <div className="block">
          <span className={LABEL}>{alertType === "ai_confidence" ? "Ticker or sector" : "Ticker"}</span>
          {/* Same type-ahead as Add Holding: the submitted value can only ever
              be a symbol the market-data layer actually tracks. */}
          <SymbolTypeahead
            name="scope_value"
            placeholder="Search ticker…"
            initial={alert ? { symbol: alert.scope_value, assetType: "equity", name: null } : null}
            onSelect={(r) => setSymbol(r.symbol)}
            inputClassName={`${inputClass} uppercase placeholder:normal-case`}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3">
        {(alertType === "price" || alertType === "pct_change") && (
          <>
            <label className="block">
              <span className={LABEL}>Direction</span>
              <select
                name="comparator"
                value={cond.comparator}
                onChange={(e) => setC("comparator", e.target.value)}
                className={inputClass}
              >
                <option value="above" className="bg-panel">
                  Above
                </option>
                <option value="below" className="bg-panel">
                  Below
                </option>
              </select>
            </label>
            <label className="block">
              {/* The threshold is in the asset's own currency - a code, not a
                  bare "$", which CAD and AUD share. */}
              <span className={LABEL}>{alertType === "price" ? priceLabel : "Day change (%)"}</span>
              <span className="flex items-center gap-2">
                <input
                  name="value"
                  type="number"
                  step="any"
                  max={MAX_AMOUNT_INPUT}
                  required
                  value={cond.value}
                  onChange={(e) => setC("value", e.target.value)}
                  className={inputClass}
                />
                {alertType === "price" && (
                  <span data-testid="alert-threshold-currency" className="shrink-0 font-mono text-caption text-muted">
                    {priceUnit}
                  </span>
                )}
              </span>
            </label>
          </>
        )}

        {alertType === "volume_spike" && (
          <label className="block">
            <span className={LABEL}>Multiple of 30-day avg volume</span>
            <input
              name="multiplier"
              type="number"
              step="0.1"
              min="0"
              max="10000"
              value={cond.multiplier}
              onChange={(e) => setC("multiplier", e.target.value)}
              required
              className={inputClass}
            />
          </label>
        )}

        {alertType === "technical_crossover" && (
          <>
            <label className="block">
              <span className={LABEL}>Fast SMA (days)</span>
              <input
                name="fastDays"
                type="number"
                min="1"
                max="400"
                value={cond.fastDays}
                onChange={(e) => setC("fastDays", e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Slow SMA (days)</span>
              <input
                name="slowDays"
                type="number"
                min="1"
                max="400"
                value={cond.slowDays}
                onChange={(e) => setC("slowDays", e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Cross direction</span>
              <select
                name="direction"
                value={cond.direction}
                onChange={(e) => setC("direction", e.target.value)}
                className={inputClass}
              >
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
            <select
              name="minLevel"
              value={cond.minLevel}
              onChange={(e) => setC("minLevel", e.target.value)}
              className={inputClass}
            >
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
          <select
            name="cooldown_seconds"
            value={cond.cooldown_seconds}
            onChange={(e) => setC("cooldown_seconds", e.target.value)}
            className={inputClass}
          >
            {COOLDOWN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-panel">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <span className={LABEL}>Deliver via</span>
        <div className="flex flex-wrap gap-4">
          {CHANNELS.map((c) => (
            <label
              key={c.value}
              title={c.hint}
              className={`flex items-center gap-2 text-body pointer-coarse:min-h-11 ${c.value === "in_app" ? "text-primary" : "text-muted"}`}
            >
              <input
                type="checkbox"
                name="channels"
                value={c.value}
                defaultChecked={channels.includes(c.value)}
                className="accent-accent"
              />
              {CHANNEL_LABELS[c.value]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-caption text-dim">
          Push and email are recorded but not delivered - no provider is wired yet, so those rows are logged as{" "}
          <span className="text-muted">unconfigured</span> rather than silently dropped.
        </p>
      </div>

      {error && error !== "saved" && <p className="mt-3 text-body text-warning">{error}</p>}

      {editing && (
        <p className="mt-3 text-caption text-dim">
          Saving an edit clears this alert&apos;s cooldown, so the new condition can fire straight away instead of
          staying quiet under the old one&apos;s timer.
        </p>
      )}

      <button
        type="submit"
        className="mt-4 w-full rounded-[10px] bg-accent px-4 py-[11px] text-[12.5px] font-bold text-canvas transition-[background-color,transform] duration-base ease-standard hover:-translate-y-px hover:bg-accent-light"
      >
        {editing ? "Save changes" : "Arm this alert"}
      </button>
    </form>
  );
}
