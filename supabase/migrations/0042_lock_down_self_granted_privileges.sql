-- Two tables let a signed-in user grant themselves things nobody sells.
--
-- `subscriptions` and `profiles` were both created with a single permissive
-- policy of the shape `for all using (auth.uid() = user_id)`, and both carry a
-- column that decides what the user is entitled to - `subscriptions.tier` and
-- `profiles.role`. RLS was doing its job (you can only reach your own row);
-- the mistake was assuming your own row is safe to hand you write access to.
--
-- The anon key ships in the browser bundle, so both of these are one console
-- paste from any signed-in page:
--
--   supabase.from('subscriptions').update({ tier: 'premium' }).eq('user_id', me)
--     -> Premium forever, free. getUserPlan() reads exactly this column,
--        through the user-scoped client (lib/actions/billing.ts).
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('user_id', me)
--     -> isAdminUser() true, which means unlimited AI usage (every quota check
--        in billing.ts short-circuits on it, so this is direct spend on a
--        metered provider) plus the /admin dashboard, which 404s for everyone
--        else precisely so its existence stays unknown.
--
-- There is a third, quieter one on `subscriptions`: with row-level write
-- access and no column restriction, a user could also write another account's
-- `stripe_customer_id` into their own row and then open the Stripe Customer
-- Portal against it.
--
-- Posture after this migration: the service-role client is the only writer of
-- either entitlement column. That is already how the app is built - the Stripe
-- webhook is the sole grantor of a tier, and `recordAiUsage` and the consent
-- writer already use the admin client for exactly this reason. The one
-- exception was `setTier`'s self-downgrade, which this migration's companion
-- commit moves onto the admin client too.
--
-- Idempotent: policy drops use `if exists`, and REVOKE/GRANT are declarative.

-- ---------------------------------------------------------------- subscriptions

-- Two policies existed with identical predicates ("own row" and "own
-- subscription"), which is also why the performance advisor was reporting 20
-- duplicate-permissive-policy findings on this table alone.
drop policy if exists "own row" on public.subscriptions;
drop policy if exists "own subscription" on public.subscriptions;

create policy "read own subscription"
  on public.subscriptions
  for select
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policy at all: writes belong to the service role,
-- which bypasses RLS. Revoking the table grants as well means a write fails at
-- the privilege layer rather than silently matching zero rows, so a regression
-- surfaces as an error instead of as a no-op.
revoke insert, update, delete on public.subscriptions from anon, authenticated;

-- ---------------------------------------------------------------------- profiles

-- Profiles keep user-facing writes - a user must be able to set their own
-- display name - but `role` is removed from what that write can touch.
drop policy if exists "own row" on public.profiles;

create policy "read own profile"
  on public.profiles
  for select
  using ((select auth.uid()) = user_id);

create policy "update own profile"
  on public.profiles
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Insert is pinned to the default role. Without this, delete-then-reinsert
-- would walk straight around the column grant below.
create policy "insert own profile"
  on public.profiles
  for insert
  with check ((select auth.uid()) = user_id and role = 'member');

-- No delete policy: account deletion runs through deleteAccount() on the
-- service-role client and the auth.users cascade, neither of which consults
-- RLS. A user deleting their profile row directly only ever orphaned data.

-- Column-level grant. Postgres has no column-level RLS, so the privilege
-- system is what keeps `role` out of reach: revoke UPDATE on the table, then
-- grant it back on exactly the two columns a user owns.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant insert on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- `(select auth.uid())` rather than a bare `auth.uid()` throughout: the bare
-- call is re-evaluated per row, which is the auth_rls_initplan advisor warning
-- standing against 23 policies in this schema. These four are now correct;
-- the rest are a separate pass.
