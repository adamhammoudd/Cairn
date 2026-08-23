// Tests for src/lib/supabase/read.ts.
//
// The regression these lock down: migrations 0027/0028 were not applied to a
// project, so `recent_prices()` and `symbol_directory` did not exist. Every
// read of them failed, every call site did `?? []`, and the app rendered an
// empty Markets page, a $0 portfolio and a ticker with no stats - five
// symptoms, one cause, and no error anywhere to connect them.
//
// A read that fails must not be indistinguishable from a read that returned
// nothing. That is the whole point of the helper, so it is what is asserted.

import { DataReadError, MIGRATIONS, unwrap, unwrapRows } from "../../src/lib/supabase/read";
import type { SuiteResult, TestCase } from "./report";

const cases: TestCase[] = [];

function check(name: string, ok: boolean, detail: string) {
  cases.push({ name, status: ok ? "pass" : "fail", detail });
}

function expectThrow(name: string, fn: () => unknown, assertion: (e: DataReadError) => string | null) {
  try {
    fn();
    check(name, false, "expected a DataReadError, but the call returned normally");
  } catch (e) {
    if (!(e instanceof DataReadError)) {
      check(name, false, `threw ${(e as Error).name}, not DataReadError`);
      return;
    }
    const problem = assertion(e);
    check(name, problem === null, problem ?? e.message);
  }
}

const err = (code: string, message: string) => ({ data: null, error: { code, message } });

// --- the exact failure that took out five pages at once ---------------------
for (const [code, what] of [
  ["42883", "undefined_function (direct Postgres)"],
  ["PGRST202", "function missing from the PostgREST schema cache"],
] as const) {
  expectThrow(`recent_prices missing - ${what} - throws`, () =>
    unwrap("Portfolio price history (recent_prices)", err(code, 'function recent_prices(text[], integer) does not exist'), MIGRATIONS.onDemandIngestion),
    (e) => (e.missingObject ? null : "missingObject was not set, so the UI cannot tell a broken deploy from an empty result"),
  );
  expectThrow(`recent_prices missing - ${what} - names the migration`, () =>
    unwrap("Portfolio price history (recent_prices)", err(code, "does not exist"), MIGRATIONS.onDemandIngestion),
    (e) => (e.message.includes(MIGRATIONS.onDemandIngestion) ? null : `message does not name the fix: ${e.message}`),
  );
}

for (const [code, what] of [
  ["42P01", "undefined_table (direct Postgres)"],
  ["PGRST205", "table missing from the PostgREST schema cache"],
] as const) {
  expectThrow(`symbol_directory missing - ${what}`, () =>
    unwrapRows("Markets demand ranking (symbol_directory)", err(code, 'relation "symbol_directory" does not exist'), MIGRATIONS.onDemandIngestion),
    (e) => (e.missingObject && e.message.includes(MIGRATIONS.onDemandIngestion) ? null : `unhelpful error: ${e.message}`),
  );
}

expectThrow("symbol_52w_range missing points at 0028, not 0027", () =>
  unwrapRows("Screener 52-week ranges (symbol_52w_range)", err("PGRST202", "not found"), MIGRATIONS.profilesStatements),
  (e) =>
    e.message.includes(MIGRATIONS.profilesStatements) && !e.message.includes(MIGRATIONS.onDemandIngestion)
      ? null
      : `wrong migration named: ${e.message}`,
);

// --- a blocked read is not an empty one -------------------------------------
// An over-restrictive RLS policy answers with rows-denied rather than a missing
// object. It still must not render as "$0" / "no holdings".
expectThrow("RLS denial on holdings throws rather than reading as no holdings", () =>
  unwrapRows("Portfolio holdings", err("42501", "permission denied for table holdings")),
  (e) => (e.missingObject ? "flagged as a missing object; it is a permissions failure" : null),
);

expectThrow("an error with no code still throws", () =>
  unwrapRows("Latest prices (recent_prices)", { data: null, error: { message: "fetch failed" } }),
  (e) => (e.message.includes("fetch failed") ? null : `message lost the cause: ${e.message}`),
);

// --- and the happy path is untouched ----------------------------------------
try {
  const rows = unwrapRows("ok", { data: [{ symbol: "AAPL" }], error: null });
  check("successful read returns its rows", rows.length === 1 && rows[0].symbol === "AAPL", JSON.stringify(rows));
} catch (e) {
  check("successful read returns its rows", false, `threw unexpectedly: ${(e as Error).message}`);
}

try {
  const rows = unwrapRows("ok", { data: null, error: null });
  check("a genuinely empty result is still empty, not an error", rows.length === 0, `${rows.length} rows`);
} catch (e) {
  check("a genuinely empty result is still empty, not an error", false, `threw unexpectedly: ${(e as Error).message}`);
}

try {
  const one = unwrap("ok", { data: { name: "Apple Inc." }, error: null });
  check("maybeSingle-shaped read passes its row through", one?.name === "Apple Inc.", JSON.stringify(one));
} catch (e) {
  check("maybeSingle-shaped read passes its row through", false, `threw unexpectedly: ${(e as Error).message}`);
}

export function runReadErrorsSuite(): SuiteResult {
  return { suiteName: "Supabase read errors", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("read-errors.ts")) {
  for (const c of cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = cases.filter((c) => c.status === "fail").length;
  console.log(`\n${cases.length - failed}/${cases.length} read-error cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
