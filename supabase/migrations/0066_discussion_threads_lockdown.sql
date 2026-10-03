-- discussion_threads: stop leaking flagged rows, stop authors editing their own
-- moderation state (audit 2026-10-02, item 2.2).
--
-- Migration 0010 created three policies:
--   "read all"   select using (true)               -- anyone, anon key included
--   "write own"  insert with check (auth.uid() = user_id)
--   "update own" update using (auth.uid() = user_id)
--
-- Two problems:
--  (a) READ. `using (true)` for every role means anyone holding the public anon
--      key (it is in the browser bundle) could list flagged and report-hidden
--      comments and every author's user_id. The app filtered flagged rows in
--      TypeScript AFTER fetching them; the database handed them over anyway.
--  (b) WRITE. A policy cannot limit columns, so an author could update their own
--      row's upvotes, downvotes and flagged (clear a spam flag, set a score) -
--      and on INSERT could set the same columns directly, bypassing the spam
--      filter the server action runs.
--
-- After this:
--  * Only signed-in users can read, and only comments that are not flagged,
--    plus their own (an author still sees their flagged comment, as the app
--    always intended). Reports-based hiding stays in the app (the report count
--    is a view over another table). Author ids remain visible to signed-in
--    users: the comment list needs them to resolve display names. A view that
--    hides them is a follow-up if that is not acceptable.
--  * An author may update `body` only (column privilege), on their own rows.
--  * An insert may set only symbol, user_id, parent_id and body. The server
--    action sets `flagged` afterwards through the service role, as it already
--    does for votes and moderation. The service role bypasses RLS and grants.

drop policy if exists "read all" on discussion_threads;
create policy "read visible comments" on discussion_threads
  for select to authenticated
  using (flagged = false or auth.uid() = user_id);

drop policy if exists "update own" on discussion_threads;
create policy "update own body" on discussion_threads
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Column privileges: the table-level grants go, then exactly what is allowed
-- comes back. anon gets nothing on this table at all.
revoke all on table discussion_threads from anon;
revoke insert, update on table discussion_threads from authenticated;
grant select on table discussion_threads to authenticated;
grant insert (symbol, user_id, parent_id, body) on table discussion_threads to authenticated;
grant update (body) on table discussion_threads to authenticated;
