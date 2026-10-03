// Audit 2026-10-02 item 3.1 - what the assistant's portfolio tool hands the AI
// model, written down so it cannot change unnoticed.
//
// FINDING: the Privacy Policy says "Position sizes, quantities and values are
// never sent" to the model. The code sends quantity, value, weight, cost basis
// and gain (get_portfolio, src/lib/ai/assistant/tools.ts) whenever portfolio
// context is on, and it was on by default (migration 0016). The decision on
// which way to resolve that - strip the amounts (A) or keep them, make it
// opt-in and change the policy (B) - is the founder's and is NOT made here.
//
// What IS done either way: portfolio context is opt-in (default off). This suite
// pins that, and records today's payload as a snapshot. When the founder picks A,
// set `FORBIDDEN` below (it is empty on purpose) and the test that already
// exists for it starts failing on any payload that contains one of them.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-context-payload.ts

import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

// tools.ts imports server-only helpers; allow them for this suite only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const realLoad = M._load;
M._load = function (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
  if (request === "server-only" && parent?.filename && /src[\\/]lib[\\/]ai[\\/]assistant[\\/]/.test(parent.filename)) return {};
  return realLoad.call(this, request, parent, ...rest);
};

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

/** Fields that must NOT appear in what the model receives. EMPTY until the founder chooses option A. */
export const FORBIDDEN: string[] = [];

/** Every key name anywhere in a JSON-like value. */
export function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); allKeys(x, out); }
  return out;
}

export function forbiddenIn(payload: unknown, forbidden: readonly string[]): string[] {
  const keys = allKeys(payload);
  return forbidden.filter((f) => keys.has(f));
}

export async function runPortfolioContextPayloadSuite(): Promise<SuiteResult> {
  const { check, result } = makeSuite("Portfolio context: opt-in, and what the model receives (snapshot)");

  // ---- opt-in (decided either way) ------------------------------------------
  const sources = [
    "src/app/api/chat/route.ts", "src/app/(app)/assistant/page.tsx", "src/app/(app)/assistant/[sessionId]/settings/page.tsx",
    "src/lib/actions/chat.ts", "src/components/settings/settings-form.tsx", "src/components/chat/chat-thread.tsx",
    "src/lib/ai/chat-generate.ts", "src/lib/ai/context.ts",
  ];
  const stillOn = sources.filter((f) => /assistant_use_portfolio_context \?\? true|usePortfolioContext = true/.test(read(f)));
  check("no code path reads a missing setting as ON", stillOn.length === 0, stillOn.join(", "));
  check("migration 0068 sets the column default to false", /alter column assistant_use_portfolio_context set default false/.test(read("supabase/migrations/0068_portfolio_context_opt_in.sql")));
  check("(before) migration 0016 had made it default true", /assistant_use_portfolio_context boolean not null default true/.test(read("supabase/migrations/0016_founder_feedback_pass2.sql")));

  // ---- the payload ----------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { runTool } = require("../../src/lib/ai/assistant/tools") as typeof import("../../src/lib/ai/assistant/tools");
  const { DEFAULT_DISPLAY_PREFS } = require("../../src/lib/display-prefs") as typeof import("../../src/lib/display-prefs");
  const portfolio = {
    totalValueUsd: 1000, dayChangeUsd: 10, dayChangePct: 1, weekChangePct: 2, costBasisUsd: 900, gainUsd: 100, gainPct: 11.1,
    holdings: [{ symbol: "NVDA", name: "NVIDIA", assetType: "equity", quantity: 2.5, valueUsd: 600, weekChangePct: 1, dayChangePct: 0.5, costBasisUsd: 500, gainUsd: 100, gainPct: 20, scores: [{ label: "Growth", verdict: "Strong", level: "strong" }] }],
    upcoming: [],
  };
  const data = { portfolio: async () => portfolio } as never;

  const off = await runTool("get_portfolio", {}, { data, plan: "premium", prefs: DEFAULT_DISPLAY_PREFS, usePortfolio: false });
  check("with portfolio context off, the tool refuses and returns no holding data", off.ok === false && !JSON.stringify(off.data).includes("NVDA"));

  const on = await runTool("get_portfolio", {}, { data, plan: "premium", prefs: DEFAULT_DISPLAY_PREFS, usePortfolio: true });
  const keys = [...allKeys(on.data)].sort();
  const SNAPSHOT = ["cost_basis", "display_currency", "gain_since_bought", "holdings", "name", "quantity", "scorecard", "symbol", "this_week", "today", "total_value", "upcoming", "value", "weight"].sort();
  check("SNAPSHOT: the field names the model receives today (quantity, value, cost_basis and gain are among them - the policy contradiction)", JSON.stringify(keys) === JSON.stringify(SNAPSHOT), keys.join(","));

  // ---- the guard that option A switches on ----------------------------------
  check("the forbidden-field check catches a payload that contains one", forbiddenIn(on.data, ["quantity"]).join() === "quantity");
  check("FORBIDDEN is empty until the founder chooses, so this passes today", forbiddenIn(on.data, FORBIDDEN).length === 0);

  M._load = realLoad;
  return result();
}

void runIfMain(import.meta.url, runPortfolioContextPayloadSuite);
