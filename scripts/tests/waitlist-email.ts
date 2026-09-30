// Tests for the waitlist confirmation email in src/lib/waitlist.ts.
//
// Two things matter here and are easy to regress:
//   1. Provider precedence. The Gmail SMTP path is a TEMPORARY bridge. Resend
//      must win the moment it is configured, and "nothing configured" must fall
//      through to the console log - never to a half-configured provider.
//   2. The email body is a light-background template, not a copy of the dark
//      product UI, and it actually carries the confirmation link + CTA.
//
// Pure assertions only - nothing here opens a socket or sends a message.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectEmailProvider, buildConfirmationEmail, parseClientTimezone, siteUrl } from "../../src/lib/waitlist";
import type { SuiteResult, TestCase } from "./report";

const cases: TestCase[] = [];

function check(name: string, ok: boolean, detail: string) {
  cases.push({ name, status: ok ? "pass" : "fail", detail });
}

// --- provider precedence --------------------------------------------------
const RESEND = { RESEND_API_KEY: "re_x", WAITLIST_EMAIL_FROM: "Cairn <a@b.co>" };
const GMAIL = { GMAIL_SMTP_USER: "x@gmail.com", GMAIL_SMTP_APP_PASSWORD: "abcd efgh ijkl mnop" };

{
  const p = selectEmailProvider({ ...RESEND, ...GMAIL });
  check("Resend wins when both Resend and Gmail are configured", p === "resend", `got "${p}"`);
}
{
  const p = selectEmailProvider({ ...GMAIL });
  check("Gmail bridge is used only when Resend is absent", p === "gmail", `got "${p}"`);
}
{
  const p = selectEmailProvider({});
  check("Nothing configured falls through to console (none)", p === "none", `got "${p}"`);
}
{
  const p = selectEmailProvider({ RESEND_API_KEY: "re_x" });
  check("A half-configured Resend (key, no from) does not count", p === "none", `got "${p}"`);
}
{
  const p = selectEmailProvider({ GMAIL_SMTP_USER: "x@gmail.com" });
  check("A half-configured Gmail (user, no password) does not count", p === "none", `got "${p}"`);
}
{
  const p = selectEmailProvider({ ...RESEND, GMAIL_SMTP_USER: "x@gmail.com" });
  check("Full Resend + partial Gmail still resolves to Resend", p === "resend", `got "${p}"`);
}

// --- template ------------------------------------------------------------
const URL = "https://cairn.example.com/waitlist/confirm?token=11111111-2222-3333-4444-555555555555";
const msg = buildConfirmationEmail(URL);

{
  const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://cairn.example.com/waitlist/";
    check(
      "configured site URL paths are removed before adding the confirmation route",
      siteUrl(null) === "https://cairn.example.com",
      "confirmation links must start at the site origin",
    );
  } finally {
    if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
  }
}

{
  const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    check(
      "request origin paths are removed before adding the confirmation route",
      siteUrl("https://cairn.example.com/waitlist") === "https://cairn.example.com",
      "fallback confirmation links must start at the site origin",
    );
  } finally {
    if (savedSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl;
  }
}

check("subject is set", msg.subject.length > 0, msg.subject);
check("plain-text part carries the confirm URL", msg.text.includes(URL), "URL present in text");
check("HTML part carries the confirm URL", msg.html.includes(URL), "URL present in html");
check(
  "HTML body has a light background, not the dark product canvas",
  msg.html.includes("background:#f4f4f5") && !msg.html.includes("background:#0A0A0A"),
  "light ground",
);
check(
  "HTML references the hosted logo on the same origin as the link",
  msg.html.includes("https://cairn.example.com/cairn-lockup.png"),
  "logo img",
);
check(
  "HTML has a visible confirm CTA",
  /confirm my email/i.test(msg.html),
  "CTA text present",
);
check(
  "CTA button uses the brand accent green",
  msg.html.includes("#2FC685"),
  "accent green present",
);
check(
  "compliance line is present",
  /not a broker and not investment advice/i.test(msg.html) && /not a broker/i.test(msg.text),
  "disclaimer present",
);

// --- client timezone capture (src/lib/waitlist.ts + waitlist-form.tsx) ----
//
// Regression cover for the bug where every waitlist row landed with
// client_timezone = '': the form wrote the value into a hidden <input> from a
// mount effect through a ref, and that value never reached the submitted
// FormData. The form now stamps it at dispatch time and parseClientTimezone
// normalises it.
check("a real IANA zone is kept", parseClientTimezone("Europe/London") === "Europe/London", "Area/Location");
check("a three-part zone is kept", parseClientTimezone("America/Argentina/Salta") === "America/Argentina/Salta", "");
check("bare UTC is kept", parseClientTimezone("UTC") === "UTC", "");
check("an empty string becomes null, not ''", parseClientTimezone("") === null, "the exact value every old row has");
check("whitespace is trimmed then rejected if empty", parseClientTimezone("   ") === null, "");
check("a missing field is null", parseClientTimezone(null) === null, "");
check("an over-long value is rejected", parseClientTimezone("A/".repeat(40)) === null, "> 64 chars");
check(
  "a junk value that isn't zone-shaped is rejected",
  parseClientTimezone("'; drop table waitlist; --") === null,
  "sanity filter against a hand-crafted POST",
);

{
  const form = readFileSync(join(import.meta.dirname, "..", "..", "src", "app", "waitlist", "waitlist-form.tsx"), "utf8");
  check(
    "the form stamps tz onto the payload at submit time",
    form.includes('formData.set("tz"'),
    "not via a hidden <input> populated after mount",
  );
  check(
    "the form no longer relies on a ref-filled hidden tz input",
    !form.includes('name="tz"') && !/tzRef/.test(form),
    "that pattern is what lost the value",
  );
}

{
  const legacyConfirm = readFileSync(
    join(import.meta.dirname, "..", "..", "src", "app", "waitlist", "waitlist", "confirm", "page.tsx"),
    "utf8",
  );
  check(
    "legacy duplicated confirmation paths redirect to the canonical route",
    legacyConfirm.includes('redirect(`/waitlist/confirm?${params.toString()}`)') &&
      legacyConfirm.includes("searchParams: Promise<{ token?: string }>") &&
      legacyConfirm.includes("params.set(\"token\", token)"),
    "old emails must remain usable after the URL fix",
  );
}

export function runWaitlistEmailSuite(): SuiteResult {
  return { suiteName: "Waitlist confirmation email", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("waitlist-email.ts")) {
  for (const c of cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = cases.filter((c) => c.status === "fail").length;
  console.log(`\n${cases.length - failed}/${cases.length} waitlist-email cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
