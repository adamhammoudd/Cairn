#!/usr/bin/env bash
# Provisions a throwaway Postgres database from the committed schema +
# migrations and runs every SQL test in supabase/tests/.
#
# These tests exist because the RLS policies and the price-ordering fix are
# both things the codebase *asserts* in comments and had never demonstrated.
# They run against a real database, so they fail when a policy or a query
# shape regresses -- see the negative-control note in supabase/tests/README.md.
#
# Usage: scripts/db-tests.sh            (spins up a local cluster if needed)
#        PGHOST=... PGPORT=... scripts/db-tests.sh   (use an existing server)
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PGHOST:=/tmp}"; : "${PGPORT:=5433}"; : "${PGUSER:=postgres}"
: "${CAIRN_TEST_DB:=cairn_test}"
export PGHOST PGPORT PGUSER

if ! pg_isready -q; then
  echo "No Postgres reachable at $PGHOST:$PGPORT." >&2
  echo "Start one, or see supabase/tests/README.md for the local-cluster recipe." >&2
  exit 1
fi

echo "==> provisioning $CAIRN_TEST_DB"
psql -q -d postgres -c "drop database if exists $CAIRN_TEST_DB;" -c "create database $CAIRN_TEST_DB;"
psql -q -d "$CAIRN_TEST_DB" -v ON_ERROR_STOP=1 -f supabase/tests/harness/00_supabase_shim.sql
psql -q -d "$CAIRN_TEST_DB" -v ON_ERROR_STOP=1 -f supabase/tests/harness/01_cron_shim.sql
psql -q -d "$CAIRN_TEST_DB" -v ON_ERROR_STOP=1 -f supabase/schema.sql

# pg_cron/pg_net are Supabase-managed and not installable locally; the harness
# provides stand-ins, so the CREATE EXTENSION lines are dropped for this run
# only. Everything else in each migration executes verbatim.
#
# Migration errors used to be sent to a log nobody read and swallowed with
# `|| true`, so a migration that failed to apply looked exactly like one that
# applied cleanly. That is the same blind spot that let an unapplied 0027 reach
# a deploy: the objects the app reads were simply absent, and nothing said so.
# Errors are now printed, and anything outside BENIGN_MIGRATION_ERRORS fails
# the run.
#
# Benign here means "expected against this harness", not "expected in Supabase":
#   - fundamentals is created by schema.sql, so 0004 re-creating it conflicts
#   - app.settings.cron_secret is a Supabase database setting, unset locally
#   - rls_auto_enable() is Supabase-managed and absent from a plain Postgres
BENIGN_MIGRATION_ERRORS='relation "fundamentals" already exists|policy "public read" for table "fundamentals" already exists|app.settings.cron_secret is not set|function public.rls_auto_enable\(\) does not exist'

migration_failures=0
for m in supabase/migrations/*.sql; do
  sed '/create extension/d' "$m" > /tmp/cairn-mig.sql
  psql -q -d "$CAIRN_TEST_DB" -f /tmp/cairn-mig.sql >/tmp/cairn-mig.log 2>&1 || true
  if unexpected=$(grep -E '^psql.*ERROR|^ERROR' /tmp/cairn-mig.log | grep -Ev "$BENIGN_MIGRATION_ERRORS"); then
    echo "!! $(basename "$m") did not apply cleanly:" >&2
    echo "$unexpected" | sed 's/^/     /' >&2
    migration_failures=1
  fi
done

if [ "$migration_failures" -ne 0 ]; then
  echo >&2
  echo "One or more migrations failed to apply; the tests below would be running" >&2
  echo "against a database that does not match the committed schema." >&2
  exit 1
fi
psql -q -d "$CAIRN_TEST_DB" -v ON_ERROR_STOP=1 -f supabase/tests/harness/02_grants.sql

failed=0
for t in supabase/tests/*.sql; do
  echo
  echo "==> $(basename "$t")"
  if ! psql -d "$CAIRN_TEST_DB" -X -q -v ON_ERROR_STOP=1 -f "$t"; then
    failed=1
  fi
done

echo
if [ "$failed" -ne 0 ]; then
  echo "FAIL - one or more database tests failed."
  exit 1
fi
echo "All database tests passed."
