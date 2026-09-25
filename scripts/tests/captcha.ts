// hCaptcha + beta-invite helpers (src/lib/captcha.ts, src/lib/public-paths.ts).
// Pure and network-free. Run: npm run test:captcha

import {
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_MISSING_MESSAGE,
  captchaConfigured,
  captchaTokenFrom,
  friendlyAuthError,
  isCaptchaError,
  missingCaptchaMessage,
} from "@/lib/captcha";
import { inviteAllowed, inviteCodes, isInvitedSignup, isPublicPath } from "@/lib/public-paths";

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  console.log(`${ok ? "pass " : "FAIL "} ${msg}`);
  if (!ok) failures.push(msg);
};

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const saved = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

// --- captcha configured ---
process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY = "site-key-for-tests";
expect(captchaConfigured(), "a site key turns the captcha on");
expect(missingCaptchaMessage(form({ email: "a@b.c" })) === CAPTCHA_MISSING_MESSAGE, "no token -> stopped before Supabase, with a plain message");
expect(missingCaptchaMessage(form({ captchaToken: "   " })) === CAPTCHA_MISSING_MESSAGE, "a blank token counts as missing");
expect(missingCaptchaMessage(form({ captchaToken: "P1_abc" })) === null, "a token lets the request through");
expect(captchaTokenFrom(form({ captchaToken: " P1_abc " })) === "P1_abc", "the token is passed on trimmed");

// --- captcha not configured (local dev without a key) ---
process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY = "";
expect(!captchaConfigured(), "no site key -> captcha off");
expect(missingCaptchaMessage(form({})) === null, "with captcha off, a form without a token is not blocked here");
expect(captchaTokenFrom(form({})) === undefined, "no token -> undefined, so Supabase gets no captchaToken field");

if (saved === undefined) delete process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
else process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY = saved;

// --- Supabase's error text ---
const raw = "captcha protection: request disallowed (invalid-input-response)";
expect(isCaptchaError(raw), "Supabase's captcha rejection is recognised");
expect(friendlyAuthError(raw) === CAPTCHA_FAILED_MESSAGE, "and shown in plain words");
expect(friendlyAuthError("Invalid login credentials") === "Invalid login credentials", "other errors pass through unchanged");

// --- beta invites ---
const codes = "cairn-beta-7Hq2, short, , second-code-xyz9";
expect(inviteCodes(codes).length === 2, `codes under 8 characters and blanks are ignored (${inviteCodes(codes).join("|")})`);
expect(inviteAllowed("cairn-beta-7Hq2", codes), "a listed code is accepted");
expect(inviteAllowed(" second-code-xyz9 ", codes), "surrounding spaces in the link are tolerated");
expect(!inviteAllowed("short", codes), "a too-short code is rejected even if listed");
expect(!inviteAllowed("CAIRN-BETA-7HQ2", codes), "codes are case-sensitive");
expect(!inviteAllowed("", codes) && !inviteAllowed(null, codes), "no code -> no sign-up");
expect(!inviteAllowed("cairn-beta-7Hq2", undefined), "BETA_INVITE_CODES unset -> nobody can sign up");
expect(isInvitedSignup("/signup", "cairn-beta-7Hq2", codes), "/signup opens with a valid invite");
expect(!isInvitedSignup("/signup", "wrong-code-123", codes), "/signup stays closed with a wrong invite");
expect(!isInvitedSignup("/portfolio", "cairn-beta-7Hq2", codes), "an invite code opens /signup only, nothing else");
expect(!isPublicPath("/signup"), "/signup is still not public on its own");

console.log(`\n${failures.length === 0 ? "all" : "NOT all"} captcha/invite cases passed`);
process.exit(failures.length === 0 ? 0 : 1);
