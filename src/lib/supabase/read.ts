import "server-only";

// Why this exists
// ---------------
// Every price/market read in the app was written as
//   const { data } = await supabase.rpc("recent_prices", ...)
//   ... (data ?? [])
// which drops `error` on the floor. When migration 0027/0028 had not been
// applied to a project, `recent_prices()` and `symbol_directory` simply did not
// exist, so PostgREST answered every one of those reads with an error - and the
// app rendered an empty Markets page, a $0 portfolio and a ticker with no stats,
// with nothing in the logs and nothing on screen to say why. One missing
// migration presented as five unrelated bugs.
//
// A financial surface must not answer "we could not read your holdings" with
// "$0". That is not a degraded reading, it is a wrong one. These helpers make a
// failed read fail loudly instead of quietly resolving to empty.

/** The shape both `.from().select()` and `.rpc()` resolve to. */
interface ReadResult<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string | null; hint?: string | null } | null;
}

/**
 * Postgres / PostgREST codes that mean "the object this query needs is not in
 * the database" - i.e. a migration was never applied, rather than a bad query.
 */
const MISSING_OBJECT_CODES = new Set([
  "42P01", // undefined_table
  "42883", // undefined_function
  "PGRST202", // function not found in the PostgREST schema cache
  "PGRST205", // table not found in the PostgREST schema cache
]);

export class DataReadError extends Error {
  readonly label: string;
  readonly code?: string;
  /** True when the cause is a missing table/function, not a malformed query. */
  readonly missingObject: boolean;

  constructor(label: string, code: string | undefined, message: string, missingObject: boolean) {
    super(message);
    this.name = "DataReadError";
    this.label = label;
    this.code = code;
    this.missingObject = missingObject;
  }
}

/**
 * Returns the rows, or throws a `DataReadError` that names what failed and -
 * when the object is missing entirely - which migration supplies it.
 *
 * `migration` is the file that creates the object being read, so the error text
 * is a repair instruction rather than a bare Postgres code.
 */
export function unwrap<T>(label: string, result: ReadResult<T>, migration?: string): T | null {
  const { data, error } = result;
  if (!error) return data;

  const missing = MISSING_OBJECT_CODES.has(error.code ?? "");
  const suffix =
    missing && migration
      ? ` This database is missing ${migration} - apply it in the Supabase SQL editor, then reload. See supabase/README.md.`
      : "";

  const failure = new DataReadError(label, error.code, `${label}: ${error.message}.${suffix}`, missing);

  // Logged here, not only where it is caught. A server component that throws in
  // a production build hands the browser React error #441 and a digest - the
  // message is deliberately withheld - so this console line is the only place
  // the full cause is guaranteed to appear (Vercel > the deployment > Logs).
  console.error(`[cairn] read failed - ${failure.message}`, {
    code: error.code,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  });

  throw failure;
}

/** `unwrap` for reads whose natural empty value is a list. */
export function unwrapRows<T>(label: string, result: ReadResult<T[]>, migration?: string): T[] {
  return unwrap(label, result, migration) ?? [];
}

/** Migration filenames, kept in one place so the hints cannot drift. */
export const MIGRATIONS = {
  onDemandIngestion: "supabase/migrations/0027_on_demand_ingestion.sql",
  profilesStatements: "supabase/migrations/0028_profiles_statements_moderation.sql",
} as const;
