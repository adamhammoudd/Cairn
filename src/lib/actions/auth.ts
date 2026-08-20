"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkAuthRateLimit, recordAuthAttempt } from "@/lib/auth-rate-limit";

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

  const limit = await checkAuthRateLimit(email, "sign_in", ip);
  if (!limit.allowed) return limit.message ?? "Too many attempts. Try again later.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  await recordAuthAttempt(email, "sign_in", !error, ip);

  if (error) return error.message;
  redirect("/");
}

export async function signUp(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();

  const limit = await checkAuthRateLimit(email, "sign_up", ip);
  if (!limit.allowed) return limit.message ?? "Too many attempts. Try again later.";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  });

  await recordAuthAttempt(email, "sign_up", !error, ip);

  if (error) return error.message;
  if (!data.session) redirect("/login?message=check-your-email");
  redirect("/");
}

export async function forgotPassword(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const origin = (await headers()).get("origin");
  const ip = await clientIp();

  const limit = await checkAuthRateLimit(email, "password_reset", ip);
  // Rate-limited resets return the same confirmation as a successful one.
  // Saying "too many attempts" here would confirm the address is real, which
  // is the enumeration leak the generic message below exists to avoid.
  if (!limit.allowed) redirect("/login?message=check-your-email-for-reset-link");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  await recordAuthAttempt(email, "password_reset", !error, ip);

  if (error) return error.message;
  redirect("/login?message=check-your-email-for-reset-link");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
