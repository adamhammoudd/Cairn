// Every control on the Settings page must change real behaviour.
//
// This suite exists because five of them did not. `default_chart_view`,
// `currency`, `metric_style`, `compact_mode` and `extended_hours` were all
// written by the settings form and read by no consumer anywhere in src/ - the
// same defect `refresh_rate_seconds` had shipped with, five times over. A
// settings screen that claims behaviour the app does not perform is the worst
// pattern for a product whose whole positioning is being honest about what it
// actually does, so this pins it rather than leaving it to a one-off audit.
//
// The check is deliberately structural rather than behavioural: for each
// column the form writes, at least one file OUTSIDE the settings UI and the
// settings action must read it. That is what "wired" means here - something
// other than the screen that sets it cares that it exists. A behavioural test
// would need a live database and would not have caught the original defect
// any earlier than a reader did.
//
// Run: npx tsx scripts/tests/settings-wiring.ts

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");
const FUNCTIONS = join(ROOT, "supabase", "functions");

// The Settings UI itself and the action that persists it. A column read only
// by these is a column that round-trips through a form and reaches nothing.
const SETTINGS_SURFACE = [
  "src/components/settings/",
  "src/lib/actions/settings.ts",
  "src/lib/settings-categories.ts",
  "src/lib/supabase/types.ts",
];

interface Wiring {
  /** Column on user_settings, or a JSON key inside notification_thresholds. */
  column: string;
  /** Human name for the control, for the failure message. */
  control: string;
  /**
   * Where the consumer is expected to live. A path prefix, checked so that a
   * consumer appearing somewhere unexpected is reported rather than quietly
   * accepted - the test should fail loudly when the wiring moves.
   */
  expectIn?: string;
}

// One row per control the Settings page ships. Adding a control without adding
// a row here is fine; adding a row without a consumer fails the suite.
const WIRINGS: Wiring[] = [
  { column: "default_chart_view", control: "Display · Default chart timeframe" },
  { column: "refresh_rate_seconds", control: "Display · Refresh rate" },
  { column: "currency", control: "Display · Primary currency" },
  { column: "metric_style", control: "Display · Percent vs. dollar" },
  { column: "compact_mode", control: "Display · Density" },
  { column: "extended_hours", control: "Display · Extended hours" },
  { column: "default_asset_filter", control: "Display · Default Markets category" },
  { column: "default_comparison_timeframe", control: "Display · Default comparison timeframe" },
  { column: "sector_map_default_sector", control: "Display · Sector map focus" },
  { column: "default_alert_channels", control: "Notifications · Default alert delivery" },
  { column: "notification_thresholds", control: "Notifications · Minimum price move" },
  { column: "assistant_expand_methodology", control: "AI Assistant · Show methodology by default" },
  { column: "assistant_use_portfolio_context", control: "AI Assistant · Portfolio context" },
  { column: "briefing_hour_local", control: "AI Assistant · Daily briefing time" },
  { column: "briefing_timezone", control: "AI Assistant · Briefing timezone" },
  { column: "briefing_include_holdings", control: "AI Assistant · Include your holdings" },
  { column: "briefing_watchlist_ids", control: "AI Assistant · Watchlists in the briefing" },
  { column: "briefing_news_categories", control: "AI Assistant · Preferred news categories" },
];

/**
 * Controls that are deliberately stored-only, each with the reason.
 *
 * A row here is a promise the UI must be making honestly: the Settings copy
 * has to say the preference is recorded and not yet acted on. This list is
 * short on purpose - it is the pressure valve, not the escape hatch.
 */
const STORED_ONLY: {
  column: string;
  control: string;
  why: string;
  /** File whose copy has to disclose the gap, and the phrases it must contain. */
  disclosedIn: string;
  uiMustSay: string[];
}[] = [
  {
    column: "two_factor_status",
    control: "Account · Two-factor authentication",
    why: "Two-factor is not implemented - there is no TOTP enrolment, no recovery codes, and no second-factor check at sign-in. The panel records whether the user wants to be told when it ships, which is a real preference, but it protects nothing today.",
    disclosedIn: "src/components/settings/two-factor-panel.tsx",
    uiMustSay: ["Not available yet", "Sign-in is password-only today"],
  },
  {
    column: "briefing_delivery",
    control: "AI Assistant · Briefing delivery",
    why: "No email or push provider is wired. in_app is the real behaviour and is the default; the other two are recorded preferences.",
    disclosedIn: "src/components/settings/settings-form.tsx",
    // The Settings copy has to name the gap, in these words or better.
    uiMustSay: ["not delivered yet"],
  },
];

/**
 * Strip comments before looking for a consumer.
 *
 * Without this the suite passes on prose. This file, and lib/display-prefs.ts,
 * both *name* every column in their header comments explaining the defect -
 * so a column whose only remaining mention is a comment about it would read as
 * wired. Caught by deliberately breaking the metric_style wiring and watching
 * the check stay green.
 *
 * Deliberately crude: it does not try to respect comment markers inside string
 * or regex literals, because erring toward removing a little too much only
 * makes the check stricter, never more permissive.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

export function runSettingsWiringSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, passed: boolean, detail: string) =>
    cases.push({ name, status: passed ? "pass" : "fail", detail });

  const files = [...walk(SRC), ...walk(FUNCTIONS)].map((path) => {
    const raw = readFileSync(path, "utf8");
    return {
      rel: relative(ROOT, path).replace(/\\/g, "/"),
      // `text` keeps comments, for the disclosure checks that read UI copy.
      text: raw,
      // `code` has them stripped, for the "is this column actually read"
      // checks - a column named only in a comment is not wired.
      code: stripComments(raw),
    };
  });

  const isSettingsSurface = (rel: string) => SETTINGS_SURFACE.some((prefix) => rel.startsWith(prefix));

  // 1. Every wired control has a consumer outside the Settings surface.
  for (const w of WIRINGS) {
    const consumers = files
      .filter((f) => !isSettingsSurface(f.rel) && f.code.includes(w.column))
      .map((f) => f.rel);

    check(
      `${w.control} (${w.column}) is read outside Settings`,
      consumers.length > 0,
      consumers.length > 0
        ? `read by ${consumers.slice(0, 3).join(", ")}${consumers.length > 3 ? ` +${consumers.length - 3} more` : ""}`
        : "written by the settings form and read by nothing - either wire it up or don't ship the control",
    );

    if (w.expectIn) {
      const inExpected = consumers.some((c) => c.startsWith(w.expectIn!));
      check(
        `${w.control} is consumed in ${w.expectIn}`,
        inExpected,
        inExpected ? "found" : `expected a consumer under ${w.expectIn}, found: ${consumers.join(", ") || "none"}`,
      );
    }
  }

  const settingsForm = files.find((f) => f.rel === "src/components/settings/settings-form.tsx");

  // 2. Every stored-only control says so in the UI.
  //
  // A control may be stored-only, but it may not be silently stored-only: the
  // screen has to tell the reader the preference is recorded and not yet acted
  // on. That disclosure is the thing this checks, because it is the thing that
  // keeps a stored-only control from reading as a working one.
  for (const entry of STORED_ONLY) {
    const file = files.find((f) => f.rel === entry.disclosedIn);
    const said = file ? entry.uiMustSay.every((phrase) => file.text.includes(phrase)) : false;
    check(
      `${entry.control} is disclosed as not-yet-active`,
      said,
      said
        ? `${entry.disclosedIn} says ${entry.uiMustSay.map((p) => `"${p}"`).join(" and ")}`
        : `stored-only control with no disclosure in ${entry.disclosedIn}. ${entry.why}`,
    );
  }

  // 3. Every input the form renders is read back by updateSettings.
  //
  // The other half of "the control does something": a field whose name the
  // action never reads round-trips through the browser and is dropped on save,
  // which looks identical to a working control until the page is reloaded.
  const settingsAction = files.find((f) => f.rel === "src/lib/actions/settings.ts");
  if (!settingsForm || !settingsAction) {
    check("settings form and action are both present", false, "one of them could not be read");
  } else {
    // Field names rendered by the form, minus the ones the action reads via a
    // different route or that belong to a sibling form.
    const NOT_PERSISTED_BY_UPDATE_SETTINGS = new Set([
      // Handled by their own actions on the Account panel.
      "password",
      "display_name",
      "email",
      "two_factor_status",
      // Read out of notification_thresholds rather than as its own column.
      "price_move_threshold",
    ]);

    const names = new Set(
      [...settingsForm.code.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]),
    );

    for (const name of names) {
      if (NOT_PERSISTED_BY_UPDATE_SETTINGS.has(name)) continue;
      const read = settingsAction.code.includes(`"${name}"`);
      check(
        `updateSettings reads the "${name}" field`,
        read,
        read ? "read from formData" : "rendered by the form but never read on save - the control silently does nothing",
      );
    }

    // price_move_threshold is the one field stored under a JSON key rather
    // than its own column, so it is checked by name and by destination.
    const thresholdWired =
      settingsAction.code.includes('"price_move_threshold"') &&
      settingsAction.code.includes("price_move_percent");
    check(
      'updateSettings persists "price_move_threshold" into notification_thresholds',
      thresholdWired,
      thresholdWired ? "written as notification_thresholds.price_move_percent" : "field is dropped on save",
    );
  }

  // 4. The two alert evaluators both apply the notification threshold. They are
  //    duplicated across the Node/Deno boundary with no shared module, so one
  //    of them silently missing the gate is a live failure mode.
  const nodeEvaluator = files.find((f) => f.rel === "src/lib/alerts.ts");
  const denoEvaluator = files.find((f) => f.rel === "supabase/functions/evaluate-alerts/index.ts");
  for (const [label, file] of [
    ["Node (src/lib/alerts.ts)", nodeEvaluator],
    ["Deno (evaluate-alerts)", denoEvaluator],
  ] as const) {
    const applies = Boolean(file?.code.includes("minPriceMovePercent") && file.code.includes("PRICE_MOVE_TYPES"));
    check(
      `${label} applies the minimum-price-move floor`,
      applies,
      applies ? "gate present" : "the two evaluators must stay in sync - see the header note in src/lib/alerts.ts",
    );
  }

  // 5. The Settings billing panel and the Research quota indicator read the
  //    same count. Both must route through lib/actions/billing, not their own
  //    query - two counts that agree today are still two counts.
  const billingPanel = files.find((f) => f.rel === "src/components/settings/billing-settings-panel.tsx");
  const settingsPage = files.find((f) => f.rel === "src/app/(app)/settings/page.tsx");
  const researchPage = files.find((f) => f.rel === "src/app/(app)/research/page.tsx");

  const settingsUsesShared = Boolean(settingsPage?.code.includes("getBillingDetail"));
  const researchUsesShared = Boolean(researchPage?.code.includes("getBillingSummary"));
  check(
    "Settings billing usage comes from lib/actions/billing",
    settingsUsesShared,
    settingsUsesShared ? "getBillingDetail()" : "Settings must not count usage itself",
  );
  check(
    "Research quota indicator comes from lib/actions/billing",
    researchUsesShared,
    researchUsesShared ? "getBillingSummary()" : "Research must not count usage itself",
  );
  const noOwnCount = Boolean(billingPanel && !billingPanel.code.includes("ai_usage_events"));
  check(
    "Settings billing panel does not re-query the usage table",
    noOwnCount,
    noOwnCount ? "no direct ai_usage_events read" : "the panel is counting usage itself - it will drift from the gate",
  );

  // 6. Currency has to convert, not relabel. A hard-coded USD in a money
  //    formatter is the exact shape of the bug the currency setting had.
  const hardCodedUsd = files.filter(
    (f) =>
      !isSettingsSurface(f.rel) &&
      f.rel.startsWith("src/") &&
      // lib/display-prefs.ts is the one place allowed to name a currency, and
      // it names the *effective* one rather than a literal.
      f.rel !== "src/lib/display-prefs.ts" &&
      /currency:\s*"USD"/.test(f.code),
  );
  // Ticker-level panels legitimately print the symbol's own listing currency
  // (profile, statements), which is not the reader's display currency. The
  // assistant's data layer states the currency annual SEC figures were FILED
  // in - they are read only from companyfacts' units.USD - which is asset
  // money and must not convert (feat/native-currency).
  const ALLOWED_LISTING_CURRENCY = ["src/components/ticker/", "src/lib/ai/assistant/data.ts"];
  const offenders = hardCodedUsd
    .map((f) => f.rel)
    .filter((rel) => !ALLOWED_LISTING_CURRENCY.some((prefix) => rel.startsWith(prefix)));
  check(
    "no portfolio/markets surface hard-codes USD formatting",
    offenders.length === 0,
    offenders.length === 0
      ? "all money goes through lib/display-prefs formatters"
      : `hard-coded USD in: ${offenders.join(", ")} - these ignore Settings > Display > Currency`,
  );

  return {
    suiteName: "settings-wiring",
    // Gating: a settings control with no consumer is a promise the product
    // does not keep, which is the failure this suite exists to prevent.
    gating: true,
    cases,
  };
}

if (process.argv[1]?.endsWith("settings-wiring.ts")) {
  const suite = runSettingsWiringSuite();
  for (const c of suite.cases) {
    console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name} - ${c.detail}`);
  }
  const failed = suite.cases.filter((c) => c.status !== "pass");
  console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} passed`);
  writeReport([suite]);
  if (failed.length > 0) process.exitCode = 1;
}
