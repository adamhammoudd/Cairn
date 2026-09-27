// Stand-in for src/lib/supabase/admin.ts under scripts/harness/tsconfig.readonly.json:
// the service-role client, wrapped so it can read production and never write.
import { readOnlyClient } from "./readonly-supabase";

export function createAdminClient() {
  return readOnlyClient();
}
