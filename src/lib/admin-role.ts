import "server-only";

import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the user carries the admin role. Admins have no AI usage cap -
 * analyses and chat run without a quota check (they still record usage, so the
 * admin dashboard's own figures stay real). The role is only settable via
 * service-role SQL, never through the app.
 *
 * Its own module rather than lib/actions/billing.ts: an export there is a
 * server action anyone can call with any user id.
 */
export async function isAdminUser(supabase: SupabaseClient<Database>, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  return data?.role === "admin";
}
