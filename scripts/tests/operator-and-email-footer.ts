// Audit 2026-10-02 items 3.2 (legal notice from env), 3.4 (email footers, reply
// STOP) and 3.10 (self-service waitlist removal). No network, no database: the
// provider's fetch, the environment and the removal store are all injected.
//
// Run: npx tsx --conditions=react-server scripts/tests/operator-and-email-footer.ts

import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { readOperatorIdentity, legalNoticeLive } from "../../src/lib/operator";
import { appendFooter, buildEmailFooter, stopLine } from "../../src/lib/email-footer";
import { isStopReply, parseSender, readInbound, removeByEmail, removeByToken, type RemovalStore } from "../../src/lib/waitlist-removal";
import { buildInviteEmail } from "../../src/lib/beta-invites/email";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

// waitlist.ts is "server-only" and talks to Supabase: stub both for this suite,
// only for that file's own imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const realLoad = M._load;
M._load = function (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
  if (parent?.filename?.endsWith("waitlist.ts") && /lib[\\/]waitlist\.ts$/.test(parent.filename)) {
    if (request === "server-only") return {};
    if (request === "@/lib/supabase/admin") return { createAdminClient: () => { throw new Error("no database in this test"); } };
  }
  return realLoad.call(this, request, parent, ...rest);
};

const FULL = {
  OPERATOR_NAME: "Test Operator BV",
  OPERATOR_ADDRESS: "1 Test Street, 1000 Brussels",
  OPERATOR_ENTERPRISE_NUMBER: "0123.456.789",
  OPERATOR_CONTACT_EMAIL: "contact@test.invalid",
};
const RESEND = { RESEND_API_KEY: "re_test", WAITLIST_EMAIL_FROM: "Cairn <hello@test.invalid>" };

export async function runOperatorAndEmailFooterSuite(): Promise<SuiteResult> {
  const { check, eq, result } = makeSuite("Operator identity, email footers, waitlist removal");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const waitlist = require("../../src/lib/waitlist") as typeof import("../../src/lib/waitlist");

  // ---- 3.2 operator identity ------------------------------------------------
  check("nothing set -> no identity, legal notice not live", readOperatorIdentity({}) === null && legalNoticeLive({}) === false);
  check("three of four set -> still not live", legalNoticeLive({ ...FULL, OPERATOR_ADDRESS: undefined }) === false);
  check("an old template placeholder counts as unset", legalNoticeLive({ ...FULL, OPERATOR_NAME: "[TO BE COMPLETED - full legal name]" }) === false);
  check("blank/whitespace counts as unset", legalNoticeLive({ ...FULL, OPERATOR_ENTERPRISE_NUMBER: "   " }) === false);
  const id = readOperatorIdentity(FULL);
  check("all four set -> live, values exactly as given, optional fields null", legalNoticeLive(FULL) && id?.name === FULL.OPERATOR_NAME && id?.address === FULL.OPERATOR_ADDRESS && id?.vatNumber === null && id?.legalForm === null);
  eq("optional VAT is read when set", readOperatorIdentity({ ...FULL, OPERATOR_VAT_NUMBER: "BE0123456789" })?.vatNumber, "BE0123456789");

  const page = read("src/app/legal-notice/page.tsx");
  check("the legal notice has no placeholder text left, and no value of its own", !/TO BE COMPLETED/.test(page) && /readOperatorIdentity\(\)/.test(page) && /if \(!operator\) notFound\(\)/.test(page));
  check("the footer, the legal shell and the sitemap gate the link on the same function", ["src/components/front-door/footer.tsx", "src/components/legal-shell.tsx", "src/app/sitemap.ts"].every((f) => /legalNoticeLive\(\)/.test(read(f))));
  check("Terms section 14 links the legal notice when it is live", /legalNoticeLive\(\)/.test(read("src/app/terms/page.tsx")) && /href="\/legal-notice"/.test(read("src/app/terms/page.tsx")));
  check("no value for any operator field is committed (env example is empty)", /^OPERATOR_NAME=$/m.test(read(".env.local.example")) && /^OPERATOR_ADDRESS=$/m.test(read(".env.local.example")));

  // ---- 3.4 footer on every message ------------------------------------------
  const sent: { to: string; body: { text: string; html: string; subject: string } }[] = [];
  const fakeFetch = (async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    sent.push({ to: b.to, body: b });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const REMOVAL = "https://cairn.test/waitlist/remove?token=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const confirmation = waitlist.buildConfirmationEmail("https://cairn.test/waitlist/confirm?token=x");
  const invite = buildInviteEmail({ kind: "invite", link: "https://cairn.test/signup?invite=CODE", expiresAt: new Date("2026-12-01"), premiumUntil: null, origin: "https://cairn.test" });
  const reminder = buildInviteEmail({ kind: "reminder", link: "https://cairn.test/signup?invite=CODE2", expiresAt: new Date("2026-12-01"), premiumUntil: null, origin: "https://cairn.test" });

  for (const [name, msg] of [["confirmation", confirmation], ["invite", invite], ["reminder", reminder]] as const) {
    check(`(before) the ${name} email body has no sender identity or stop line of its own`, !/Reply STOP/.test(msg.text) && !/Enterprise number/.test(msg.text));
  }

  for (const [name, msg] of [["confirmation", confirmation], ["invite", invite], ["reminder", reminder]] as const) {
    sent.length = 0;
    const r = await waitlist.sendEmail("someone@example.invalid", msg, { env: { ...RESEND, ...FULL }, fetch: fakeFetch, removalUrlFor: async () => REMOVAL });
    const p = sent[0]?.body;
    check(`${name}: sent through the provider`, r.sent === true && sent.length === 1);
    check(`${name}: text carries identity, address, enterprise number and contact`, !!p && p.text.includes(FULL.OPERATOR_NAME) && p.text.includes(FULL.OPERATOR_ADDRESS) && p.text.includes(FULL.OPERATOR_ENTERPRISE_NUMBER) && p.text.includes(FULL.OPERATOR_CONTACT_EMAIL));
    check(`${name}: text carries the one-line opt-out and the personal link`, !!p && p.text.includes(stopLine(REMOVAL)));
    check(`${name}: html carries the footer and the link`, !!p && p.html.includes('data-cairn-footer="1"') && p.html.includes(REMOVAL) && p.html.indexOf("data-cairn-footer") < p.html.lastIndexOf("</body>"));
    check(`${name}: the original message is intact above the footer`, !!p && p.text.startsWith(msg.text.trimEnd()));
  }

  // Without identity: still a footer (stop line + published contact), never the provider's bare message.
  sent.length = 0;
  await waitlist.sendEmail("someone@example.invalid", confirmation, { env: { ...RESEND }, fetch: fakeFetch, removalUrlFor: async () => null });
  check("no operator identity: footer still present with the stop line and the published contact", /Reply STOP and we won't email you again\./.test(sent[0]?.body.text ?? "") && /Contact: /.test(sent[0]?.body.text ?? "") && !/Enterprise number/.test(sent[0]?.body.text ?? ""));

  // Launch switch.
  sent.length = 0;
  const blocked = await waitlist.sendEmail("someone@example.invalid", invite, { env: { ...RESEND, EMAIL_REQUIRE_IDENTITY: "1" }, fetch: fakeFetch, removalUrlFor: async () => null });
  check("EMAIL_REQUIRE_IDENTITY=1 without an identity: nothing is sent", blocked.sent === false && blocked.reason === "operator-identity-missing" && sent.length === 0);
  const okNow = await waitlist.sendEmail("someone@example.invalid", invite, { env: { ...RESEND, ...FULL, EMAIL_REQUIRE_IDENTITY: "1" }, fetch: fakeFetch, removalUrlFor: async () => null });
  check("EMAIL_REQUIRE_IDENTITY=1 with an identity: sent", okNow.sent === true);

  // One choke point.
  const wl = read("src/lib/waitlist.ts");
  const wlCode = wl.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
  const calls = (name: string) => (wlCode.match(new RegExp("(?<!function )" + name + "[(]", "g")) ?? []).length;
  check("both providers are called from exactly one place, inside sendEmail (so no message can skip the footer)", calls("sendViaResend") === 1 && calls("sendViaGmailSmtp") === 1 && wlCode.indexOf("return sendViaResend(") > wlCode.indexOf("export async function sendEmail") && wlCode.indexOf("return sendViaResend(") < wlCode.indexOf("export function buildConfirmationEmail"));
  check("only sendEmail is used to send (no other module talks to a provider)", !/api\.resend\.com|nodemailer/.test(read("src/lib/beta-invites/server.ts")) && /sendEmail\(to, message\)/.test(read("src/lib/beta-invites/server.ts")));
  check("a message is not footed twice", (() => { const f = buildEmailFooter({ operator: null, fallbackContact: "c@x.invalid", removalUrl: null }); const once = appendFooter({ text: "hi", html: "<body>hi</body>" }, f); return appendFooter(once, f).text === once.text; })());

  // ---- 3.4/3.10 stop and removal --------------------------------------------
  const rows = new Map<string, { email: string; token: string }>();
  const addRow = (email: string, token: string) => rows.set(email, { email, token });
  const store: RemovalStore = {
    async deleteByToken(t) { let n = 0; for (const [k, v] of rows) if (v.token === t) { rows.delete(k); n++; } return n; },
    async deleteByEmail(e) { return rows.delete(e) ? 1 : 0; },
  };
  const T1 = "11111111-1111-4111-8111-111111111111";
  addRow("a@example.invalid", T1);
  addRow("b@example.invalid", "22222222-2222-4222-8222-222222222222");
  eq("a malformed token is invalid and deletes nothing", await removeByToken(store, "not-a-token"), "invalid");
  eq("the right token removes the row", await removeByToken(store, T1), "removed");
  check("only that person is gone", !rows.has("a@example.invalid") && rows.has("b@example.invalid"));
  eq("the same link again is a harmless not-found", await removeByToken(store, T1), "not-found");
  eq("STOP by email removes (case/space insensitive)", await removeByEmail(store, "  B@Example.invalid "), "removed");
  eq("a bad address is invalid", await removeByEmail(store, "nope"), "invalid");

  check("STOP, stop., Unsubscribe, 'remove me' are stop replies", ["STOP", "stop.", "Unsubscribe", "remove me", "\n\n  STOP  \n> quoted"].every(isStopReply));
  check("a sentence containing the word is not a stop reply", !isStopReply("please don't stop the beta") && !isStopReply("Can you stop by next week?"));
  check("a quoted original above/below does not count", !isStopReply("> Reply STOP and we won't email you again\nthanks!") && isStopReply("STOP\n\n> Reply STOP and we won't email you again"));
  eq("sender is read out of 'Name <a@b.c>'", parseSender("Ada Lovelace <Ada@Example.invalid>"), "ada@example.invalid");
  check("a plain webhook body is read", readInbound({ from: "a@example.invalid", text: "STOP" }).isStop === true);
  check("Resend's wrapped inbound event is read", (() => { const m = readInbound({ type: "email.received", data: { from: "A <a@example.invalid>", subject: "Re: invite", text: "stop" } }); return m.from === "a@example.invalid" && m.isStop; })());
  check("STOP in the subject with an empty body counts", readInbound({ from: "a@example.invalid", subject: "STOP", text: "" }).isStop === true);
  check("garbage input never throws and never stops anyone", (() => { try { return readInbound(null).isStop === false && readInbound("x").from === null; } catch { return false; } })());

  const route = read("src/app/api/email/inbound/route.ts");
  check("the inbound route refuses without a configured secret (503) and without the bearer (401)", /status: 503/.test(route) && /status: 401/.test(route) && /timingSafeEqual/.test(route));
  check("the inbound route answers the same whether or not the sender was on the list", /handled: true/.test(route) && !/not-found.*status/.test(route));
  const removePage = read("src/app/waitlist/remove/page.tsx");
  check("opening the removal link does not delete (a button posts to a server action)", !/createAdminClient|\.delete\(/.test(removePage) && /RemoveForm/.test(removePage));
  const mig = read("supabase/migrations/0067_waitlist_removal_token.sql");
  check("migration 0067 adds a unique random removal token", /add column if not exists removal_token uuid not null default gen_random_uuid\(\)/.test(mig) && /create unique index if not exists waitlist_removal_token_key/.test(mig));

  M._load = realLoad;
  return result();
}

void runIfMain(import.meta.url, runOperatorAndEmailFooterSuite);
