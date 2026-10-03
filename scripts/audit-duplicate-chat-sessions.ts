// Lists chat sessions that look like one conversation stored twice (same owner,
// same title, created within five seconds) - audit 2026-10-02, item 5.9.
// READ-ONLY: prints what it finds and deletes nothing. Whether to remove a
// duplicate is the founder's call, per conversation.
//
//   npx tsx --conditions=react-server scripts/audit-duplicate-chat-sessions.ts
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local,
// loaded by ./tests/env). Not run by the session that wrote it - no credentials.
import "./tests/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { likelyDoubleInserts } from "@/lib/chat-sessions";

async function main() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("chat_sessions").select("id, user_id, title, created_at").order("created_at", { ascending: true });
  if (error) throw error;
  const byUser = new Map<string, NonNullable<typeof data>>();
  for (const s of data ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let pairs = 0;
  for (const [user, list] of byUser) {
    for (const [a, b] of likelyDoubleInserts(list)) {
      pairs++;
      // The account is shown as a short tag, not an id or an email.
      console.log(`- account ${user.slice(0, 8)}: "${a.title}" ${a.id} and ${b.id} (${a.created_at} / ${b.created_at})`);
    }
  }
  console.log(`${data?.length ?? 0} sessions checked; ${pairs} likely double inserts.`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
