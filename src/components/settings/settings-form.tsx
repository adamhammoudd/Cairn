"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { updateSettings } from "@/lib/actions/settings";
import { Toggle } from "@/components/settings/toggle";
import {
  Card,
  CardHeader,
  CardRow,
  CardFooter,
  CheckCard,
  CheckChip,
  Segmented,
  SelectControl,
} from "@/components/settings/settings-card";
import { SECTORS } from "@/lib/sectors";
import { SUPPORTED_CURRENCIES } from "@/lib/market-data/fx";
import { formatRateDate } from "@/components/layout/currency-note";
import type { SettingsTabId } from "@/lib/settings-categories";
import type { AlertChannelName, AssetFilter, ChartView, Database } from "@/lib/supabase/types";

type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

const CHART_VIEWS: ChartView[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

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
  { value: "all", label: "All assets" },
  { value: "equity", label: "Equities" },
  { value: "etf", label: "ETFs" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  { value: "index", label: "Indices" },
];

// `note` is the card's status line: only in-app actually delivers today, and
// the other two are stored preferences (see the row's description).
const ALERT_CHANNELS: { value: AlertChannelName; label: string; note: string }[] = [
  { value: "in_app", label: "In-app", note: "live now" },
  { value: "push", label: "Push", note: "coming soon" },
  { value: "email", label: "Email", note: "coming soon" },
];

// Every hour, labelled in the reader's own locale so 13 reads as "1 PM" where
// that is how people write it.
const BRIEFING_HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: hour,
  label: new Date(Date.UTC(2026, 0, 1, hour)).toLocaleTimeString(undefined, { hour: "numeric", timeZone: "UTC" }),
}));

// A comparable picture of the form: field name -> its submitted value(s). An
// unchecked checkbox simply has no entry, which is what lets a group of
// checkboxes read as one changed field when any of them flips.
function snapshot(form: HTMLFormElement): Record<string, string> {
  const grouped: Record<string, string[]> = {};
  for (const [key, value] of new FormData(form).entries()) (grouped[key] ??= []).push(String(value));
  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => [key, values.slice().sort().join("\u0000")]),
  );
}

function changedFieldCount(before: Record<string, string>, after: Record<string, string>): number {
  let count = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) count++;
  }
  return count;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5.5 py-2.5 text-body font-semibold text-canvas shadow-[0_6px_20px_rgba(47,198,133,0.22)] transition-[filter,transform] duration-base ease-standard hover:-translate-y-px hover:brightness-105 disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

export interface WatchlistOption {
  id: string;
  name: string;
}

interface SettingsFormProps {
  settings: Settings;
  activeTab: SettingsTabId;
  sectorOptions: string[];
  watchlists: WatchlistOption[];
  fx: { effectiveCurrency: string; unavailable: boolean; asOf: string | null };
  intradayAvailable: boolean;
}

export function SettingsForm({ settings, activeTab, sectorOptions, watchlists, fx, intradayAvailable }: SettingsFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const baseline = useRef<Record<string, string>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [unsaved, setUnsaved] = useState(0);
  const [toast, setToast] = useState(false);

  // The wrapper only adds the confirmation toast. Re-baselining after a save is
  // handled by onReset below, since React resets an uncontrolled form once its
  // action settles.
  const [result, formAction] = useActionState(async (prev: string | null, formData: FormData) => {
    const outcome = await updateSettings(prev, formData);
    if (outcome === "saved") {
      setToast(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), 2400);
    }
    return outcome;
  }, null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // After a save React resets this uncontrolled form to its DEFAULT values -
  // and a <select>'s default is fixed when it mounts, so the refreshed
  // `settings` never reached it: Currency snapped back to the old USD right
  // after saving EUR, and the next save of any other setting wrote USD back
  // (both of the founder's 2026-09-25/26 saves returned 204; the row held
  // USD). Keying the form on the saved row remounts it with the new defaults.
  const savedKey = JSON.stringify(settings);
  const [baselineKey, setBaselineKey] = useState(savedKey);
  if (baselineKey !== savedKey) {
    setBaselineKey(savedKey);
    setUnsaved(0);
  }
  useEffect(() => {
    if (formRef.current) baseline.current = snapshot(formRef.current);
  }, [savedKey]);

  function recount() {
    if (formRef.current) setUnsaved(changedFieldCount(baseline.current, snapshot(formRef.current)));
  }

  function handleReset() {
    // The reset event fires before the fields revert, so read them a tick later.
    setTimeout(() => {
      if (!formRef.current) return;
      baseline.current = snapshot(formRef.current);
      setUnsaved(0);
    }, 0);
  }

  const notificationThreshold = (settings.notification_thresholds?.price_move_percent as number | undefined) ?? 5;
  const channels = settings.default_alert_channels ?? ["in_app"];
  const briefingWatchlists = settings.briefing_watchlist_ids ?? [];
  const briefingCategories = settings.briefing_news_categories ?? [];
  const browserZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  // States what is actually happening: which rate, from whom, dated - or that
  // the rate could not be fetched and figures are still in USD.
  // Only the reader's own money converts; share and coin prices stay in their
  // own currency (feat/native-currency), so the hint must not promise that
  // every price changes.
  const currencyHint = fx.unavailable
    ? "Used for your own money: portfolio value, holdings, gains and briefing totals. The European Central Bank reference rate couldn't be fetched just now, so those are still shown in USD. Nothing is converted at a guessed rate. Share and coin prices are always in their own currency."
    : fx.effectiveCurrency === "USD"
      ? "Used for your own money: portfolio value, holdings, gains and briefing totals. Share and coin prices are always shown in their own currency."
      : `Used for your own money: portfolio value, holdings, gains and briefing totals, converted from USD at the European Central Bank reference rate${fx.asOf ? ` of ${formatRateDate(fx.asOf)}` : ""}. Share and coin prices are always shown in their own currency.`;

  return (
    <form
      key={savedKey}
      ref={formRef}
      action={formAction}
      onChange={recount}
      onReset={handleReset}
      className="flex flex-col gap-3.5"
    >
      {/* DISPLAY -------------------------------------------------------------- */}
      <div className={activeTab === "display" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Charts &amp; data" note="Applies to every chart and table in the app" tint="accent" />

          <CardRow label="Default chart timeframe" desc="What Ticker Detail and Portfolio open with.">
            <Segmented
              name="default_chart_view"
              value={settings.default_chart_view ?? "3M"}
              wrap
              options={CHART_VIEWS.map((v) => ({ value: v, label: v }))}
            />
          </CardRow>

          <CardRow
            label="Refresh rate"
            desc="How often pages re-run their queries, while the market is open and this tab is in the foreground. The ticker and portfolio pages carry a live quote and refresh it on this cadence (never faster than once a minute - the quote provider is rate-limited). Other surfaces show the last daily close, so a refresh there refetches the same figure."
          >
            <SelectControl name="refresh_rate_seconds" defaultValue={settings.refresh_rate_seconds}>
              {REFRESH_RATES.map((r) => (
                <option key={r.value} value={r.value} className="bg-panel">
                  {r.label}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow label="Primary currency" desc={currencyHint}>
            <SelectControl name="currency" defaultValue={settings.currency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-panel">
                  {c}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow
            label="Metric style"
            desc="Whether gains and losses lead with the amount or the percentage. Both stay visible where there is room - this reorders them, it doesn't hide one."
          >
            <Segmented
              name="metric_style"
              value={settings.metric_style ?? "percent"}
              options={[
                { value: "percent", label: "Percent" },
                // Was "Dollar" - wrong word for a EUR/GBP/etc. account (this
                // toggles amount vs. percentage, not literally US dollars).
                { value: "absolute", label: "Amount" },
              ]}
            />
          </CardRow>

          <CardRow label="Compact mode" desc="Tighter rows and smaller cards on Holdings, Markets, Watchlists and the Screener - fits roughly a third more on screen.">
            <Toggle name="compact_mode" defaultChecked={settings.compact_mode} />
          </CardRow>

          <CardRow
            label="Extended hours"
            desc={
              intradayAvailable
                ? "Include pre-market and after-hours prints in the 1D and 1W intraday charts. Daily-close figures elsewhere are regular-session closes either way."
                : "Needs the intraday market-data provider, which isn't configured on this deployment. The preference is saved and takes effect as soon as a key is set."
            }
          >
            <Toggle name="extended_hours" defaultChecked={settings.extended_hours} />
          </CardRow>

          <CardRow label="Default Markets filter" desc="Which asset type the Markets page opens on.">
            <SelectControl name="default_asset_filter" defaultValue={settings.default_asset_filter ?? "all"}>
              {ASSET_FILTERS.map((f) => (
                <option key={f.value} value={f.value} className="bg-panel">
                  {f.label}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow label="Default Compare timeframe" desc="Applied to every new comparison you start.">
            <SelectControl name="default_comparison_timeframe" defaultValue={settings.default_comparison_timeframe ?? "3M"}>
              {CHART_VIEWS.map((v) => (
                <option key={v} value={v} className="bg-panel">
                  {v}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardRow
            label="Sector map default focus"
            desc={
              sectorOptions.length > 0
                ? "The sector the map opens on. It is moved to the front and outlined; the other sectors stay on screen."
                : "No sectors are classified yet. Once fundamentals land for your tracked symbols, they appear here."
            }
          >
            <SelectControl
              name="sector_map_default_sector"
              defaultValue={settings.sector_map_default_sector ?? ""}
              disabled={sectorOptions.length === 0}
            >
              <option value="" className="bg-panel">
                Whole market
              </option>
              {sectorOptions.map((name) => (
                <option key={name} value={name} className="bg-panel">
                  {name}
                </option>
              ))}
            </SelectControl>
          </CardRow>

          <CardFooter>
            <span className="text-caption text-dim">
              Defaults apply to new sessions. Per-page choices you make while browsing aren&rsquo;t overwritten.
            </span>
          </CardFooter>
        </Card>
      </div>

      {/* NOTIFICATIONS ------------------------------------------------------- */}
      <div className={activeTab === "notifications" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Alerts" note="Defaults for every new alert you create" tint="warning" />

          <CardRow
            label="Default delivery"
            desc="Pre-checked on the New alert form. Only in-app is delivered today; push and email are recorded as a preference and marked 'unconfigured' by the evaluator until a provider is wired."
          >
            <div className="flex min-w-[150px] shrink-0 flex-col gap-2">
              {ALERT_CHANNELS.map((c) => (
                <CheckCard
                  key={c.value}
                  name="default_alert_channels"
                  value={c.value}
                  label={c.label}
                  note={c.note}
                  defaultChecked={channels.includes(c.value)}
                />
              ))}
            </div>
          </CardRow>

          <CardRow
            label="Minimum price move"
            desc="Account-wide floor. A price or % change alert whose close-to-close move is smaller than this doesn't fire, whatever its own threshold says. Volume spikes, SMA crossovers and AI-confidence alerts are not affected."
          >
            <div className="flex shrink-0 items-center gap-2 rounded-panel border border-line bg-canvas px-3 py-2 transition-colors duration-base ease-standard focus-within:border-accent">
              <input
                type="number"
                name="price_move_threshold"
                defaultValue={notificationThreshold}
                min={0}
                step={0.1}
                className="w-16 bg-transparent text-right text-body text-primary outline-none"
              />
              <span className="text-body text-dim">%</span>
            </div>
          </CardRow>

          <CardRow label="Your alerts" desc="Individual alerts, their per-alert thresholds, and the delivery log live on the Alerts page. This panel only sets what a new alert starts with.">
            <Link
              href="/alerts"
              className="shrink-0 rounded-control border border-line px-3.5 py-2 text-body text-primary transition-colors duration-fast ease-standard hover:border-line-strong"
            >
              Manage alerts →
            </Link>
          </CardRow>
        </Card>
      </div>

      {/* AI ASSISTANT ------------------------------------------------------- */}
      <div className={activeTab === "assistant" ? "contents" : "hidden"}>
        <Card>
          <CardHeader title="Daily briefing" note="When it runs and what feeds it" tint="violet" />

          <CardRow label="Delivery time" desc="The scheduler runs hourly and generates your briefing in the hour you pick, in your timezone. Changing this changes when the job actually fires for you.">
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <SelectControl name="briefing_hour_local" defaultValue={settings.briefing_hour_local ?? 12} minWidth={110}>
                {BRIEFING_HOURS.map((h) => (
                  <option key={h.value} value={h.value} className="bg-panel">
                    {h.label}
                  </option>
                ))}
              </SelectControl>
              <input
                type="text"
                name="briefing_timezone"
                defaultValue={settings.briefing_timezone ?? "UTC"}
                list="briefing-timezones"
                spellCheck={false}
                className="w-44 rounded-panel border border-line bg-canvas px-3 py-2.5 text-body text-primary outline-none transition-colors duration-fast ease-standard focus:border-accent"
              />
              <datalist id="briefing-timezones">
                <option value="UTC" />
                <option value={browserZone} />
                <option value="America/New_York" />
                <option value="America/Chicago" />
                <option value="America/Los_Angeles" />
                <option value="Europe/London" />
                <option value="Europe/Berlin" />
                <option value="Asia/Singapore" />
                <option value="Asia/Tokyo" />
                <option value="Australia/Sydney" />
              </datalist>
            </div>
          </CardRow>

          <CardRow label="Include your holdings" desc="When off, the briefing covers only the watchlists selected below.">
            <Toggle name="briefing_include_holdings" defaultChecked={settings.briefing_include_holdings ?? true} />
          </CardRow>

          <CardRow
            label="Watchlists in the briefing"
            desc={watchlists.length > 0 ? "Leave all unchecked for every watchlist. Checking some narrows the briefing to those." : "No watchlists yet. Create one and it appears here."}
          >
            {watchlists.length === 0 ? (
              <Link href="/watchlists/new" className="text-body text-accent hover:underline">
                New watchlist →
              </Link>
            ) : (
              <div className="flex max-w-[420px] shrink-0 flex-wrap justify-end gap-2">
                {watchlists.map((w) => (
                  <CheckChip
                    key={w.id}
                    name="briefing_watchlist_ids"
                    value={w.id}
                    label={w.name}
                    defaultChecked={briefingWatchlists.includes(w.id)}
                  />
                ))}
              </div>
            )}
          </CardRow>

          <CardRow label="Preferred news categories" desc="Stories tagged with these appear in the briefing's news section. News about a symbol you hold or watch is always included regardless.">
            <div className="flex max-w-[460px] shrink-0 flex-wrap justify-end gap-2">
              {SECTORS.map((s) => (
                <CheckChip
                  key={s.slug}
                  name="briefing_news_categories"
                  value={s.slug}
                  label={s.label}
                  defaultChecked={briefingCategories.includes(s.slug)}
                />
              ))}
            </div>
          </CardRow>

          <CardRow label="Briefing delivery" desc="In-app is the only channel Cairn can deliver on today - the briefing appears on the Assistant page. Choosing email or push records the preference and changes nothing else until a provider is wired.">
            <SelectControl name="briefing_delivery" defaultValue={settings.briefing_delivery ?? "in_app"}>
              <option value="in_app" className="bg-panel">
                In-app only
              </option>
              <option value="email" className="bg-panel">
                Email (not delivered yet)
              </option>
              <option value="push" className="bg-panel">
                Push (not delivered yet)
              </option>
            </SelectControl>
          </CardRow>
        </Card>

        <Card>
          <CardHeader title="Answers" note="How analyses are presented. Caveats and confidence never differ by plan." />

          <CardRow label="Show methodology by default" desc="Expand sources and historical analogs on every answer without a click.">
            <Toggle name="assistant_expand_methodology" defaultChecked={settings.assistant_expand_methodology ?? true} />
          </CardRow>

          <CardRow
            label="Portfolio context"
            desc="Let the assistant read your holdings and watchlists when deciding what is relevant. Answers stay market/sector/ticker-level either way - Cairn never analyses your position or resolves to buy, hold, or sell."
          >
            <Toggle name="assistant_use_portfolio_context" defaultChecked={settings.assistant_use_portfolio_context ?? false} />
          </CardRow>
        </Card>
      </div>

      {/* The sticky bar appears only once something differs from what is saved,
          and says how many fields do. Discard resets the whole form. */}
      {unsaved > 0 && (
        <div className="animate-slide-up fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3.5 border-t border-line-soft bg-canvas/90 px-5.5 py-3.5 backdrop-blur-md">
          <span className="flex items-center gap-2.5 text-caption text-muted">
            <span aria-hidden className="animate-breathe h-1.5 w-1.5 rounded-full bg-warning" />
            {unsaved === 1 ? "1 unsaved change" : `${unsaved} unsaved changes`}
          </span>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => formRef.current?.reset()}
              className="rounded-panel border border-line px-4 py-2.5 text-body text-primary transition-colors duration-fast ease-standard hover:border-line-strong"
            >
              Discard
            </button>
            <SaveButton />
          </div>
        </div>
      )}

      {/* Outside the bar: React resets the form after a failed save too, which dismisses the bar, and the reason must outlive it. */}
      {result && result !== "saved" && (
        <p role="alert" className="px-1 text-body text-negative">
          {result}
        </p>
      )}

      {toast && (
        <div
          role="status"
          className="animate-slide-up-centred fixed bottom-6.5 left-1/2 z-[60] flex items-center gap-2.5 rounded-panel border border-accent/40 bg-panel px-4.5 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.6)]"
        >
          <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-accent text-eyebrow text-canvas">
            ✓
          </span>
          <span className="text-caption text-primary">Saved.</span>
        </div>
      )}
    </form>
  );
}
