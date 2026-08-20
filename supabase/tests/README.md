# Database tests

`npm run test:db` provisions a throwaway database from `supabase/schema.sql`
plus every file in `supabase/migrations/`, then runs each `.sql` file here
against it. A failing case aborts with a non-zero exit.

| File | What it pins down |
|---|---|
| `rls_idor.sql` | Cross-user access is denied on every user-scoped table, for reads, writes, forged-owner inserts, and anonymous callers. |
| `price_ordering.sql` | `ORDER BY ... DESC` + `LIMIT` returns the newest rows, in the three places a `LIMIT` sits on top of a time series. |

## Why these exist

Several server actions carry comments asserting that RLS makes a foreign
resource id safe — `listChatMessages()`, `addWatchlistItem()`,
`listDeliveries()` all say some version of *"RLS joins through the owner, so a
foreign id returns no rows."* That claim was never tested. `rls_idor.sql`
tests it: two real users, real rows, and every read and write a malicious
client could aim at the other user's primary keys, executed as role
`authenticated` with the attacker's `sub` claim — the same security context
PostgREST establishes from a real JWT.

The actions now also check ownership themselves rather than delegating the
decision to the policy. These tests cover the backstop; the explicit checks in
`src/lib/actions/` are the first line.

## These tests can fail

A test that cannot fail is not a test. The IDOR suite was verified by negative
control — weakening one policy to `using (true)`:

```
$ psql -d cairn -c 'drop policy "own row" on holdings;' \
       -c 'create policy "own row" on holdings for all using (true) with check (true);'
$ psql -d cairn -f supabase/tests/rls_idor.sql
 FAIL   | ANON  read holdings                                     |  0 |  2
 FAIL   | READ  holdings by bob id                                |  0 |  1
 FAIL   | READ  unscoped select * from holdings returns only own  |  1 |  2
 FAIL   | WRITE delete bob holding                                |  0 |  1
 FAIL   | WRITE insert holding owned by bob                       |  0 |  1
 FAIL   | WRITE update bob holding                                |  0 |  1
exit 3
```

Restoring the policy returns it to 33/33 and exit 0. `price_ordering.sql`
carries its own control: it asserts that the *old* ascending-plus-`LIMIT`
shape still produces a stale row, so the two shapes are compared against each
other rather than the fix being asserted alone.

## Local Postgres

`pg_cron` and `pg_net` are Supabase-managed and cannot be installed locally, so
`harness/01_cron_shim.sql` provides stand-ins — enough to execute the
scheduling migrations and inspect the job commands they register. Likewise
`harness/00_supabase_shim.sql` supplies `auth.users`, `auth.uid()` and the
`anon` / `authenticated` / `service_role` roles, and `harness/02_grants.sql`
mirrors the table grants Supabase issues so that RLS — not a missing GRANT — is
what the tests actually exercise.

To spin up a cluster on port 5433:

```bash
useradd -m cairnpg && mkdir -p /home/cairnpg/pgdata && chown -R cairnpg /home/cairnpg
su cairnpg -c "/usr/lib/postgresql/16/bin/initdb -D /home/cairnpg/pgdata -U postgres --auth=trust"
su cairnpg -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/cairnpg/pgdata -o '-p 5433 -k /tmp' start"
```

## What these tests do not cover

They run against a local Postgres built from the committed files, not against
the production Supabase project. They prove the *policies and query shapes in
this repository* are correct. They cannot prove production's live database
matches this repository — that needs a run against production credentials.
