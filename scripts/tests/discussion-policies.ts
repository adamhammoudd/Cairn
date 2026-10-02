// Audit 2026-10-02 item 2.2, policy-text half: asserts what migration 0066
// says, without a database. The behavioural half is
// supabase/tests/discussion_lockdown.sql (run by scripts/db-tests.sh, which
// needs a local Postgres - NOT run in the session that wrote this).
//
// Run: npx tsx --conditions=react-server scripts/tests/discussion-policies.ts

import fs from "node:fs";
import path from "node:path";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
const code = (sql: string) => sql.split(/\r?\n/).filter((l) => !l.trim().startsWith("--")).join("\n");

export function runDiscussionPoliciesSuite(): SuiteResult {
  const { check, result } = makeSuite("Discussion thread policies (migration 0066 text)");
  const old = code(read("supabase/migrations/0010_phase10_community_esg.sql"));
  const m = code(read("supabase/migrations/0066_discussion_threads_lockdown.sql"));

  // Reproduce: the 0010 policies are the problem.
  check("0010 (before): 'read all' is using (true) for every role", /create policy "read all" on discussion_threads for select using \(true\)/.test(old));
  check("0010 (before): update own has no column limit", /create policy "update own" on discussion_threads for update using \(auth\.uid\(\) = user_id\)/.test(old));

  // Fixed.
  check("0066 drops the open read policy", /drop policy if exists "read all" on discussion_threads/.test(m));
  check("0066 read is for authenticated only, unflagged or own", /for select to authenticated\s+using \(flagged = false or auth\.uid\(\) = user_id\)/.test(m));
  check("0066 anon has no privileges on the table", /revoke all on table discussion_threads from anon/.test(m));
  check("0066 removes table-level insert/update from authenticated", /revoke insert, update on table discussion_threads from authenticated/.test(m));
  check("0066 grants update on body only", /grant update \(body\) on table discussion_threads to authenticated/.test(m) && !/grant update \([^)]*(upvotes|downvotes|flagged)/.test(m));
  check("0066 grants insert on symbol, user_id, parent_id, body only", /grant insert \(symbol, user_id, parent_id, body\)/.test(m) && !/grant insert \([^)]*(upvotes|downvotes|flagged)/.test(m));
  check("0066 update policy also has WITH CHECK own", /for update to authenticated\s+using \(auth\.uid\(\) = user_id\)\s+with check \(auth\.uid\(\) = user_id\)/.test(m));

  // The app cannot rely on the columns it may no longer write as the user.
  const action = read("src/lib/actions/discussion.ts");
  const insertAt = action.indexOf(".insert({ symbol, user_id: user.id");
  const insertCall = action.slice(insertAt, insertAt + 120);
  check("postComment inserts only the allowed columns as the user", insertAt > 0 && !/flagged|upvotes|downvotes/.test(insertCall), insertCall.replace(/\s+/g, " "));
  check("postComment applies the spam flag through the service role", /createAdminClient\(\)\.from\("discussion_threads"\)\.update\(\{ flagged: true \}\)/.test(action));
  check("vote counters are still written through the service role", /admin\.from\("discussion_threads"\)\.update\(\{ upvotes/.test(action));
  check("a SQL behavioural test exists", fs.existsSync(path.resolve(__dirname, "../../supabase/tests/discussion_lockdown.sql")));
  return result();
}

void runIfMain(import.meta.url, runDiscussionPoliciesSuite);
