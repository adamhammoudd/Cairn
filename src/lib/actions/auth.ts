"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAuthRateLimit, recordAuthAttempt } from "@/lib/auth-rate-limit";
import { TOS_VERSION, PRIVACY_VERSION, consentGiven } from "@/lib/legal-versions";
import { captchaTokenFrom, friendlyAuthError, missingCaptchaMessage } from "@/lib/captcha";
import { inviteAllowed } from "@/lib/public-paths";

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
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Server-side gate, not just the disabled button: a hand-crafted POST must
  // not be able to create an account without a consent record behind it.
  if (!consentGiven(formData)) {
    return "You must agree to the Terms of Service and Privacy Policy to create an account.";
  }

  // Beta: accounts are invite-only. The proxy already keeps /signup closed
  // without a valid ?invite=, but a server action is a plain POST endpoint, so
  // the same check runs here too.
  if (!inviteAllowed(String(formData.get("invite") ?? ""), process.env.BETA_INVITE_CODES)) {
    return "Sign-up is invite-only during the beta. Join the waitlist and we will let you know.";
  }

  const noCaptcha = missingCaptchaMessage(formData);
  if (noCaptcha) return noCaptcha;

  const h = await headers();
  const ip = await clientIp();
  const userAgent = h.get("user-agent");
  const consentedAt = new Date().toISOString();

  const limit = await checkAuthRateLimit(email, "sign_up", ip);
  if (!limit.allowed) return limit.message ?? "Too many attempts. Try again later.";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken: captchaTokenFrom(formData),
      data: {
        display_name: name,
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

  // The compliance record. Service-role client: a user must not be able to
  // forge or delete their own consent row. A failure here is logged with the
  // user id (recoverable from the auth-user metadata backstop) rather than
  // failing a signup whose auth user already exists.
  if (data.user) {
    const { error: consentError } = await createAdminClient()
      .from("user_consents")
      .insert({
        user_id: data.user.id,
        consented_at: consentedAt,
        tos_version: TOS_VERSION,
        privacy_version: PRIVACY_VERSION,
        ip,
        user_agent: userAgent ? userAgent.slice(0, 500) : null,
      });
    if (consentError) {
      console.error(`[signUp] user_consents insert failed for ${data.user.id}:`, consentError.message);
    }
  }

  if (!data.session) redirect("/login?message=check-your-email");
  redirect("/");
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
