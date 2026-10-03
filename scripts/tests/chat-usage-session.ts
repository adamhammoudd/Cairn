// Audit 2026-10-02 item 2.1: recordChatUsage / checkChatUsageAllowed were
// exported from a "use server" module and took a `userId` argument, so any
// signed-in browser could read, or burn, another user's chat quota. They now
// live in lib/chat-usage.ts and take no argument: the user comes from the
// session.
//
// Behavioural: the session and the database are replaced by fakes (module
// loader hook), then the real functions run. A "caller" signed in as Alice
// tries to pass Bob's id; the rows written and counted must still be Alice's.
//
// Run: npx tsx --conditions=react-server scripts/tests/chat-usage-session.ts

import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";

type Fake = { session: string | null; inserts: { table: string; row: Record<string, unknown> }[]; countedFor: string[]; countResult: number };
const fake: Fake = { session: ALICE, inserts: [], countedFor: [], countResult: 0 };

// Intercept the app's own imports so no network or cookie store is needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const realLoad = M._load;
const countQuery = () => {
  const q = { eq(col: string, val: string) { if (col === "user_id") fake.countedFor.push(val); return q; }, gte() { return Promise.resolve({ count: fake.countResult, error: null }); } };
  return q;
};
const stubs: Record<string, unknown> = {
  "@/lib/supabase/auth": { getAuthUser: async () => (fake.session ? { id: fake.session } : null) },
  "@/lib/supabase/server": { createClient: async () => ({ from: (t: string) => (t === "user_settings" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { briefing_timezone: "Europe/Brussels" } }) }) }) } : { select: countQuery }) }) },
  "@/lib/supabase/admin": { createAdminClient: () => ({ from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { fake.inserts.push({ table, row }); return { error: null }; } }) }) },
  "@/lib/actions/billing": { getUserPlan: async () => "free" },
  "@/lib/admin-role": { isAdminUser: async () => false },
  "server-only": {},
};
M._load = function (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
  // Only chat-usage.ts's own imports are replaced, so a suite running at the
  // same time in run-all can never receive a stub.
  return parent?.filename?.endsWith("chat-usage.ts") && request in stubs ? stubs[request] : realLoad.call(this, request, parent, ...rest);
};

export async function runChatUsageSessionSuite(): Promise<SuiteResult> {
  const { check, result } = makeSuite("Chat quota is session-bound (no user id argument)");
  const root = path.resolve(__dirname, "../..");
  const actions = fs.readFileSync(path.join(root, "src/lib/actions/billing.ts"), "utf8");
  const mod = fs.readFileSync(path.join(root, "src/lib/chat-usage.ts"), "utf8");

  check("(before) the old signatures took a userId and sat in a 'use server' file — now gone from billing.ts", !/checkChatUsageAllowed|recordChatUsage/.test(actions.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n")));
  check("chat-usage.ts is not a server-action module", !/^\s*["']use server["']/m.test(mod) && /import "server-only"/.test(mod));
  check("neither function declares a parameter", /export async function checkChatUsageAllowed\(\)/.test(mod) && /export async function recordChatUsage\(\)/.test(mod));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const usage = require("../../src/lib/chat-usage") as { checkChatUsageAllowed: (...a: unknown[]) => Promise<{ allowed: boolean }>; recordChatUsage: (...a: unknown[]) => Promise<void> };

  // Alice, trying to burn Bob's quota by passing his id.
  fake.session = ALICE;
  await usage.recordChatUsage(BOB);
  check("recording while signed in as Alice writes Alice's row, even if Bob's id is passed", fake.inserts.length === 1 && fake.inserts[0].row.user_id === ALICE && fake.inserts[0].table === "chat_usage_events", JSON.stringify(fake.inserts));
  check("no row is ever written for Bob", !fake.inserts.some((i) => i.row.user_id === BOB));

  // Alice, trying to read Bob's quota.
  fake.inserts.length = 0;
  fake.countedFor.length = 0;
  fake.countResult = 3;
  await usage.checkChatUsageAllowed(BOB);
  check("checking while signed in as Alice counts Alice's usage, even if Bob's id is passed", fake.countedFor.length === 1 && fake.countedFor[0] === ALICE, fake.countedFor.join(","));

  // Quota behaviour for the session user still works (free plan: 5 a day).
  fake.countResult = 0;
  check("under the free limit: allowed", (await usage.checkChatUsageAllowed()).allowed === true);
  fake.countResult = 10_000;
  check("over the limit: refused", (await usage.checkChatUsageAllowed()).allowed === false);

  // No session: nothing is read, nothing is written.
  fake.session = null;
  fake.inserts.length = 0;
  fake.countedFor.length = 0;
  await usage.recordChatUsage(ALICE);
  const gate = await usage.checkChatUsageAllowed(ALICE);
  check("signed out: nothing recorded and the gate refuses", fake.inserts.length === 0 && fake.countedFor.length === 0 && gate.allowed === false);

  // The route no longer passes an id.
  const route = fs.readFileSync(path.join(root, "src/app/api/chat/route.ts"), "utf8");
  check("the chat route calls both without an id", /checkChatUsageAllowed\(\)/.test(route) && /recordChatUsage\(\)/.test(route));

  M._load = realLoad;
  return result();
}

void runIfMain(import.meta.url, runChatUsageSessionSuite);
