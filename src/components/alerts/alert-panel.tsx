"use client";

import { useState, useTransition } from "react";
import { deleteAlert, toggleAlert, type DeliveryWithAlert } from "@/lib/actions/alerts";
import { Switch } from "@/components/switch";
import { AlertForm, CHANNEL_LABELS } from "@/components/alerts/alert-form";
import { ALERT_TYPE_LABELS, COOLDOWN_OPTIONS, describeCondition, type Alert, type AlertChannel } from "@/lib/alerts";
import { useDisplayPrefs } from "@/components/display-prefs-provider";

type AlertTab = "armed" | "triggered" | "paused";

/** Kind identity, shared by a card's avatar, its kind pill and its rail.
 *
 *  A price alert takes the gain/loss pair, because "above" and "below" mean
 *  exactly what green and red already mean everywhere else in the product -
 *  the direction lives on `condition.comparator`. Everything else is
 *  directionless, so it takes a secondary tint and never the gain colour. */
function alertTone(a: Alert): { text: string; rail: string } {
  if (a.alert_type === "price") {
    const below = a.condition?.comparator === "below";
    return below
      ? { text: "text-negative border-negative/35", rail: "bg-negative" }
      : { text: "text-accent border-accent/35", rail: "bg-accent" };
  }
  if (a.alert_type === "pct_change") return { text: "text-info border-info/35", rail: "bg-info" };
  if (a.alert_type === "ai_confidence") return { text: "text-warning border-warning/35", rail: "bg-warning" };
  return { text: "text-violet border-violet/35", rail: "bg-violet" };
}

interface AlertPanelProps {
  alerts: Alert[];
  deliveries: DeliveryWithAlert[];
  /** Settings › Notifications default, pre-checked on the New alert form. */
  defaultChannels: AlertChannel[];
}

export function AlertPanel({ alerts, deliveries, defaultChannels }: AlertPanelProps) {
  // null = closed, "new" = create form, otherwise the id of the alert being
  // edited. One form at a time, so the page can't hold two conflicting drafts.
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [tab, setTab] = useState<AlertTab>("armed");
  const [, startMutate] = useTransition();
  const prefs = useDisplayPrefs();

  const editing = openForm && openForm !== "new" ? alerts.find((a) => a.id === openForm) : undefined;

  const activeCount = alerts.filter((a) => a.enabled).length;

  function cooldownLabel(seconds: number) {
    return COOLDOWN_OPTIONS.find((o) => o.value === seconds)?.label ?? `${seconds}s`;
  }

  // The design splits alerts three ways, and the split is already in the data:
  // enabled-and-never-fired is armed, enabled-and-fired is triggered, disabled
  // is paused.
  const armed = alerts.filter((a) => a.enabled && !a.last_triggered_at);
  const triggered = alerts.filter((a) => a.enabled && a.last_triggered_at);
  const paused = alerts.filter((a) => !a.enabled);
  const shown = tab === "armed" ? armed : tab === "triggered" ? triggered : paused;

  // Real counts only - no "closest to firing" card here, since that needs a
  // live price/threshold distance this component isn't given (alerts +
  // deliveries only). Adding it means passing current prices in as a prop,
  // which is a data-plumbing decision, not a styling one.
  const STATS: { label: string; value: string; note: string; textClass: string; accent: string }[] = [
    { label: "Armed", value: String(armed.length), note: "watching at every close", textClass: "text-accent", accent: "#2fc685" },
    {
      label: "Recent deliveries",
      value: String(deliveries.length),
      note: "latest in-app notifications",
      textClass: "text-warning",
      accent: "#d9a441",
    },
    { label: "Paused", value: String(paused.length), note: "not being evaluated", textClass: "text-muted", accent: "#3a3a3a" },
  ];
  const TABS: { key: AlertTab; label: string; count: number }[] = [
    { key: "armed", label: "Armed", count: armed.length },
    { key: "triggered", label: "Triggered", count: triggered.length },
    { key: "paused", label: "Paused", count: paused.length },
  ];

  return (
    <div className="animate-page-in flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          {/* "Portfolio", not the design file's "Planning": the shipped nav
              (lib/nav-items.ts) files Alerts under Portfolio, and a breadcrumb
              that disagrees with the menu you arrived through is worse than one
              that disagrees with the mock. */}
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Portfolio · Alerts</div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            Alerts
          </h1>
          <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
            Price levels, percentage moves and event reminders. Each fires once per cooldown window, then goes quiet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-[7px] rounded-[9px] border border-accent/35 bg-accent/8 px-3 py-2 text-[12.5px] text-accent-light">
            <span aria-hidden className="relative h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-accent" />
              <span className="absolute inset-0 animate-ping rounded-full bg-accent" />
            </span>
            {activeCount} armed · checked at every close
          </span>
          <button
            type="button"
            onClick={() => setOpenForm((prev) => (prev === "new" ? null : "new"))}
            className="rounded-[9px] bg-accent px-4 py-[9px] text-[12.5px] font-bold text-canvas transition-[background,transform] duration-base ease-standard hover:-translate-y-px hover:bg-accent-light"
          >
            {openForm === "new" ? "Close" : "+ New alert"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="relative flex flex-col gap-1.5 overflow-hidden rounded-[15px] border border-[#232323] bg-panel px-[19px] py-[17px]"
          >
            <span
              aria-hidden
              className="absolute top-0 right-0 left-0 h-px"
              style={{ background: `linear-gradient(90deg,${stat.accent},transparent)` }}
            />
            <div className="font-mono text-eyebrow tracking-[0.18em] text-dim uppercase">{stat.label}</div>
            <div className={`font-serif text-[32px] leading-[1.05] ${stat.textClass}`}>{stat.value}</div>
            <div className="text-caption text-muted">{stat.note}</div>
          </div>
        ))}
      </div>

      {/* Armed / Triggered / Paused, with counts. Before this the page listed
          every alert in one column, so a paused alert and one actively watching
          a level sat indistinguishable except for a switch position. */}
      {alerts.length > 0 && (
        <div className="flex w-fit flex-wrap gap-[3px] rounded-[11px] border border-[#232323] bg-[#0c0c0c] p-[3px]">
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-[7px] rounded-[9px] px-[13px] py-[7px] text-[12.5px] whitespace-nowrap transition-colors duration-base ease-standard ${
                  on ? "bg-[#1e1e1e] text-primary" : "text-muted hover:text-primary"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-[5px] px-[5px] py-px font-mono text-eyebrow ${
                    on ? "bg-accent/15 text-accent-light" : "bg-[#161616] text-dim"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* One form component serves create and edit -- keyed so switching
          between rows remounts it with the right defaults instead of keeping
          the previous alert's values in the uncontrolled inputs. */}
      {openForm && (
        <AlertForm
          key={openForm}
          alert={editing}
          defaultChannels={defaultChannels}
          onDone={() => setOpenForm(null)}
          onCancel={() => setOpenForm(null)}
        />
      )}

      <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[300px_1fr]">
        <aside className="relative overflow-hidden rounded-2xl border border-[#232323] bg-panel min-[900px]:sticky min-[900px]:top-[78px]">
          <span
            aria-hidden
            className="absolute top-0 right-0 left-0 h-px"
            style={{ background: "linear-gradient(90deg,#d9a441,rgba(217,164,65,0))" }}
          />
          <div className="border-b border-[#1c1c1c] px-4 py-3.5 font-mono text-eyebrow tracking-[0.18em] text-warning uppercase">
            Recent deliveries
          </div>
          {deliveries.length === 0 ? (
            <p className="px-4 py-5 text-body text-dim">Nothing yet - alerts appear here when they fire.</p>
          ) : (
            deliveries.map((d) => (
              <div key={d.id} className="flex gap-3 border-b border-[#171717] px-4 py-3.5 last:border-b-0">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <div className="text-body leading-relaxed text-primary text-pretty">
                    {d.message ?? `${d.scope_value} alert fired.`}
                  </div>
                  <div className="mt-1 text-micro text-dim" suppressHydrationWarning>
                    {CHANNEL_LABELS[d.channel] ?? d.channel} ·{" "}
                    {new Date(d.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            ))
          )}
        </aside>

        <div className="flex flex-col gap-3">
          {alerts.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
              <div className="font-serif text-h3 text-primary">No markers set</div>
              <p className="mx-auto mt-2 max-w-[380px] text-body text-muted text-pretty">
                Create an alert and Cairn watches for the condition, then goes quiet for the cooldown window.
              </p>
            </div>
          ) : (
            shown.map((a, index) => (
              <div
                key={a.id}
                className="animate-rise-in flex gap-[15px] overflow-hidden rounded-[14px] border border-[#232323] bg-panel transition-[border-color,background] duration-base ease-standard hover:border-line-strong hover:bg-[#121212]"
                style={{ animationDelay: `${140 + index * 55}ms` }}
              >
                {/* The rail carries the alert's kind, and dims when it is not
                    being evaluated - so a paused alert reads as paused from
                    the edge of the card rather than from a switch position. */}
                <span
                  aria-hidden
                  className={`w-[3px] shrink-0 self-stretch ${alertTone(a).rail} ${
                    a.enabled ? "" : "opacity-40"
                  }`}
                />
                <div className="min-w-[180px] flex-1 py-[15px] pr-[18px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-control border bg-panel font-mono text-eyebrow ${
                        alertTone(a).text
                      }`}
                    >
                      {a.scope_value.slice(0, 2)}
                    </span>
                    <span
                      className={`text-[13.5px] font-semibold transition-colors duration-base ease-standard ${
                        a.enabled ? "text-primary" : "text-dim"
                      }`}
                    >
                      {a.scope_value}
                    </span>
                    <span
                      className={`rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.1em] uppercase ${
                        alertTone(a).text
                      }`}
                    >
                      {ALERT_TYPE_LABELS[a.alert_type]}
                    </span>
                    <span
                      className={`rounded-full border px-[9px] py-[3px] font-mono text-[9.5px] tracking-[0.12em] uppercase ${
                        !a.enabled
                          ? "border-line text-dim"
                          : a.last_triggered_at
                            ? "border-warning/35 bg-warning/10 text-warning"
                            : "border-accent/35 bg-accent/10 text-accent"
                      }`}
                    >
                      {!a.enabled ? "Paused" : a.last_triggered_at ? "Triggered" : "Armed"}
                    </span>
                  </div>

                  <div className="mt-2.5 text-body leading-[1.55] text-[#c9c9c9] text-pretty">
                    {describeCondition(a.alert_type, a.condition, prefs)}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-eyebrow text-dim uppercase">
                      Cooldown {cooldownLabel(a.cooldown_seconds)}
                    </span>
                    {a.channels.map((ch) => (
                      <span key={ch} className="rounded-full border border-line px-2 py-1 text-micro text-muted">
                        {CHANNEL_LABELS[ch] ?? ch}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className={`min-w-[130px] text-caption ${a.last_triggered_at ? "text-accent" : "text-dim"}`}
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
                  <button
                    type="button"
                    onClick={() => setOpenForm((prev) => (prev === a.id ? null : a.id))}
                    aria-label={`Edit ${a.scope_value} alert`}
                    title="Edit"
                    className={`flex h-7 w-7 items-center justify-center rounded-control transition-colors duration-fast ease-standard hover:bg-active ${
                      openForm === a.id ? "text-accent" : "text-muted hover:text-primary"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
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
                    className="flex h-7 w-7 items-center justify-center rounded-control text-negative transition-colors duration-fast ease-standard hover:bg-negative/12"
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
