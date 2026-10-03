// Lists stored analyses whose headline or text forecasts market direction, even
// hedged ("may keep climbing") - audit 2026-10-02, item 3.11. READ-ONLY: it
// prints what it finds and changes nothing. Old rows are not rewritten by the
// fix; regeneration is the founder's call.
//
//   npx tsx --conditions=react-server scripts/audit-stored-forward-looking.ts
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (loaded by
// ./tests/env). Not run by the session that wrote it - no credentials there.
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { forwardLookingMatch } from "@/lib/ai/forward-looking";

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_analyses")
    .select("id, scope_type, scope_value, headline, reasoning_text, created_at, superseded_by")
    .eq("status", "validated")
    .is("superseded_by", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const hits = rows
    .map((r) => ({ r, field: forwardLookingMatch(r.headline ?? "") ? "headline" : forwardLookingMatch(r.reasoning_text ?? "") ? "text" : null, match: forwardLookingMatch(r.headline ?? "") ?? forwardLookingMatch(r.reasoning_text ?? "") }))
    .filter((h) => h.field);
  console.log(`Checked ${rows.length} current validated analyses; ${hits.length} forecast market direction.`);
  for (const { r, field, match } of hits) {
    console.log(`- ${r.id} ${r.scope_type}:${r.scope_value} ${r.created_at.slice(0, 10)} [${field}] "${match}"`);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
