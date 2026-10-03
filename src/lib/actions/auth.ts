"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAuthRateLimit, recordAuthAttempt } from "@/lib/auth-rate-limit";
import { TOS_VERSION, PRIVACY_VERSION, consentGiven } from "@/lib/legal-versions";
import { captchaTokenFrom, friendlyAuthError, missingCaptchaMessage } from "@/lib/captcha";
import { inviteAllowed } from "@/lib/public-paths";
import { INVITE_INVALID_MESSAGE, isWellFormedInviteCode, normalizeEmail } from "@/lib/beta-invites/codes";
import { claimInviteAndCreateAccount } from "@/lib/beta-invites/claim";
import { createSupabaseInviteStore } from "@/lib/beta-invites/supabase-store";
import { validateDisplayName } from "@/lib/display-name";

// Behind a proxy the socket address is the proxy's, so the forwarded chain is
// the only thing that identifies the caller. First entry is the client;
// everything after it is infrastructure.
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return h.get("x-real-ip");
}

export async function signIn(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  const noCaptcha = missingCaptchaMessage(formData);
  if (noCaptcha) return noCaptcha;

  const limit = await checkAuthRateLimit(email, "sign_in", ip);
  if (!limit.allowed) return limit.message ?? "Too many attempts. Try again later.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: captchaTokenFrom(formData) },
  });

  await recordAuthAttempt(email, "sign_in", !error, ip);

  if (error) return friendlyAuthError(error.message);
  redirect("/");
}

export async function signUp(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Checked before anything is claimed or created, so a bad name costs the
  // person nothing: no spent invite, no half-made account.
  const nameResult = validateDisplayName(formData.get("name"));
  if (!nameResult.ok) return nameResult.error;
  const name = nameResult.value;

  // Server-side gate, not just the disabled button: a hand-crafted POST must
  // not be able to create an account without a consent record behind it.
  if (!consentGiven(formData)) {
    return "You must agree to the Terms of Service and Privacy Policy to create an account.";
  }

  // Beta: accounts are invite-only. The proxy keeps /signup closed without an
  // ?invite=, but a server action is a plain POST endpoint, so the invite is
  // checked here too - and this is the check that counts.
  const invite = String(formData.get("invite") ?? "").trim();
  // MANUAL OVERRIDE: a shared BETA_INVITE_CODES code takes the original open
  // sign-up path below, unchanged.
  const shared = inviteAllowed(invite, process.env.BETA_INVITE_CODES);
  if (!shared) {
    if (invite === "") return "Sign-up is invite-only during the beta. Join the waitlist and we will let you know.";
    if (!isWellFormedInviteCode(invite)) return INVITE_INVALID_MESSAGE;
  }

  const noCaptcha = missingCaptchaMessage(formData);
  if (noCaptcha) return noCaptcha;

  const h = await headers();
  const ip = await clientIp();
  const userAgent = h.get("user-agent");
  const consentedAt = new Date().toISOString();

  const limit = await checkAuthRateLimit(email, "sign_up", ip);
  if (!limit.allowed) return limit.message ?? "Too many attempts. Try again later.";

  if (!shared) return signUpWithPersonalInvite({ invite, email, password, name, formData, ip, userAgent, consentedAt });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken: captchaTokenFrom(formData),
      data: {
        ...(name ? { display_name: name } : {}),
        // Backstop copy of the consent, on the auth user itself, in case the
        // user_consents insert below fails.
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        consented_at: consentedAt,
      },
    },
  });

  await recordAuthAttempt(email, "sign_up", !error, ip);

  if (error) return friendlyAuthError(error.message);

  if (data.user) await recordConsent(data.user.id, consentedAt, ip, userAgent);

  if (!data.session) redirect("/login?message=check-your-email");
  redirect("/");
}

// The compliance record. Service-role client: a user must not be able to
// forge or delete their own consent row. A failure here is logged with the
// user id (recoverable from the auth-user metadata backstop) rather than
// failing a signup whose auth user already exists.
async function recordConsent(userId: string, consentedAt: string, ip: string | null, userAgent: string | null) {
  const { error: consentError } = await createAdminClient()
    .from("user_consents")
    .insert({
      user_id: userId,
      consented_at: consentedAt,
      tos_version: TOS_VERSION,
      privacy_version: PRIVACY_VERSION,
      ip,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
    });
  if (consentError) {
    console.error(`[signUp] user_consents insert failed for ${userId}:`, consentError.message);
  }
}

/**
 * Sign-up with a personal invite (src/lib/beta-invites). The invite is
 * reserved atomically before the account exists, so two simultaneous requests
 * on one link create at most one account; it is marked claimed by that
 * account in the same step.
 *
 * The account is created already email-confirmed: the invite link was
 * delivered to this address and the address had already passed the waitlist's
 * double opt-in, so a third confirmation email would only stand between the
 * person and onboarding. That is also why the address must match the invite.
 */
async function signUpWithPersonalInvite(input: {
  invite: string;
  email: string;
  password: string;
  name: string;
  formData: FormData;
  ip: string | null;
  userAgent: string | null;
  consentedAt: string;
}): Promise<string> {
  const admin = createAdminClient();
  const result = await claimInviteAndCreateAccount(
    createSupabaseInviteStore(),
    { code: input.invite, email: input.email, now: new Date() },
    async (invitedEmail) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: invitedEmail,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          // Saved in the same createUser call: the handle_new_user trigger
          // copies it into profiles.display_name in the same transaction, so
          // there is no second write that could fail and leave a nameless
          // account. If it did fail, createUser fails and the invite is released.
          ...(input.name ? { display_name: input.name } : {}),
          // Backstop copy of the consent, as on the open path.
          tos_version: TOS_VERSION,
          privacy_version: PRIVACY_VERSION,
          consented_at: input.consentedAt,
          beta_invite: true,
        },
      });
      if (error || !data.user) {
        const exists = error?.code === "email_exists" || /already (been )?registered/i.test(error?.message ?? "");
        return {
          ok: false,
          message: exists
            ? "An account already exists for this email. Sign in instead."
            : friendlyAuthError(error?.message ?? "Could not create the account."),
        };
      }
      return { ok: true, userId: data.user.id };
    },
  );

  await recordAuthAttempt(input.email, "sign_up", result.ok, input.ip);
  if (!result.ok) return result.message;

  await recordConsent(result.userId, input.consentedAt, input.ip, input.userAgent);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(input.email),
    password: input.password,
    options: { captchaToken: captchaTokenFrom(input.formData) },
  });
  // The account exists either way; if the automatic sign-in is refused (a
  // spent captcha token, say), send them to sign in by hand.
  if (error) redirect("/login?message=account-created");
  redirect("/?welcome=beta");
}

export async function forgotPassword(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const origin = (await headers()).get("origin");
  const ip = await clientIp();

  const noCaptcha = missingCaptchaMessage(formData);
  if (noCaptcha) return noCaptcha;

  const limit = await checkAuthRateLimit(email, "password_reset", ip);
  // Rate-limited resets return the same confirmation as a successful one.
  // Saying "too many attempts" here would confirm the address is real, which
  // is the enumeration leak the generic message below exists to avoid.
  if (!limit.allowed) redirect("/login?message=check-your-email-for-reset-link");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
    captchaToken: captchaTokenFrom(formData),
  });

  await recordAuthAttempt(email, "password_reset", !error, ip);

  if (error) return friendlyAuthError(error.message);
  redirect("/login?message=check-your-email-for-reset-link");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
