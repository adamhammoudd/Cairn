import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * The signed-in user, validated against the Auth server, memoised for the
 * lifetime of one request.
 *
 * `supabase.auth.getUser()` is a network round-trip to GoTrue every time it is
 * called (unlike `getSession()`, which only reads the cookie). The app layout,
 * `getUserPlan()` and `getDisplayPrefs()` each called it independently, so a
 * single navigation made three identical auth validations before rendering a
 * page. React's `cache()` collapses every call that shares this function
 * reference within one request into one.
 *
 * Returns `null` for an unauthenticated request - callers decide whether that
 * is a redirect or a documented default.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
