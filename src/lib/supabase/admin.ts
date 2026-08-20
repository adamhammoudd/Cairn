// Build-time enforcement of the boundary the comment below asserts. Without
// this, "never import from a Client Component" is a convention that holds
// until someone breaks it; with it, importing this module into a client
// component fails the build instead of shipping a service-role key path into
// the browser bundle.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Service-role client - bypasses RLS. Server-only; never import from a Client Component.
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
