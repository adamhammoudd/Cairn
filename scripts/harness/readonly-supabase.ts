// A Supabase client that reads production and never writes to it.
//
// Reads go to the real database. Every insert/upsert/update/delete is kept in
// an in-process overlay instead, and later reads of the same table see those
// rows merged in, so a pipeline that writes a row and reads it back (factor
// analogs, a freshly ingested price series, the ai_analyses parent row) runs
// end to end exactly as it would in production, with nothing leaving this
// process. RPCs are allowed only from a read-only allowlist.
//
// Used through tsconfig path overrides (scripts/harness/tsconfig.readonly.json)
// so the code under test is the unmodified production module graph.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Row = Record<string, unknown>;
type Call = { m: string; args: unknown[] };

const READ_ONLY_RPCS = new Set(["recent_prices"]);

interface TableOverlay {
  rows: Row[];
  keys: string[] | null;
}
const overlay = new Map<string, TableOverlay>();

/** Every write the harness swallowed: table, operation and row count. */
export const interceptedWrites: { table: string; op: string; rows: number }[] = [];

let seq = 0;

/** Normalise a value for comparison: timestamps compare as instants, everything else as-is. */
function norm(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : new Date(t).toISOString();
  }
  return v;
}

function keyOf(row: Row, keys: string[]): string {
  return keys.map((k) => String(norm(row[k]))).join("|");
}

function cmp(a: unknown, b: unknown): number {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;
  return (x as number | string) < (y as number | string) ? -1 : 1;
}

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return String(v).replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
}

const FILTERS = new Set(["eq", "neq", "in", "is", "gte", "gt", "lte", "lt", "contains", "not", "match"]);
const NON_FILTERS = new Set(["select", "order", "range", "limit", "single", "maybeSingle", "returns", "abortSignal", "throwOnError"]);

/** Does `row` pass every recorded filter? False for a filter this harness cannot evaluate. */
function matches(row: Row, calls: Call[]): boolean {
  for (const { m, args } of calls) {
    if (NON_FILTERS.has(m)) continue;
    if (!FILTERS.has(m)) return false;
    const [col, a, b] = args as [string, unknown, unknown];
    const v = row[col];
    switch (m) {
      case "eq":
        if (cmp(v, a) !== 0) return false;
        break;
      case "neq":
        if (cmp(v, a) === 0) return false;
        break;
      case "in":
        if (!parseList(a).some((x) => cmp(v, x) === 0 || String(v) === x)) return false;
        break;
      case "is":
        if (a === null ? v !== null && v !== undefined : v !== a) return false;
        break;
      case "gte":
        if (cmp(v, a) < 0) return false;
        break;
      case "gt":
        if (cmp(v, a) <= 0) return false;
        break;
      case "lte":
        if (cmp(v, a) > 0) return false;
        break;
      case "lt":
        if (cmp(v, a) >= 0) return false;
        break;
      case "contains":
        if (!Array.isArray(v) || !(a as unknown[]).every((x) => (v as unknown[]).includes(x))) return false;
        break;
      case "match":
        for (const [k, want] of Object.entries(col as unknown as Row)) if (cmp(row[k], want) !== 0) return false;
        break;
      case "not": {
        const op = a as string;
        if (op === "is") {
          if (b === null || b === "null" ? v === null || v === undefined : v === b) return false;
        } else if (op === "in") {
          if (parseList(b).some((x) => String(v) === x)) return false;
        } else if (op === "eq") {
          if (cmp(v, b) === 0) return false;
        } else return false;
        break;
      }
    }
  }
  return true;
}

function overlayFor(table: string): TableOverlay {
  let o = overlay.get(table);
  if (!o) {
    o = { rows: [], keys: null };
    overlay.set(table, o);
  }
  return o;
}

type Result = { data: unknown; error: unknown; count?: number | null; status?: number; statusText?: string };

async function runRead(real: SupabaseClient<Database>, table: string, calls: Call[]): Promise<Result> {
  const o = overlay.get(table);
  const local = o ? o.rows.filter((r) => matches(r, calls)) : [];
  const single = calls.find((c) => c.m === "single" || c.m === "maybeSingle")?.m;
  const range = calls.find((c) => c.m === "range")?.args as [number, number] | undefined;
  const limit = calls.find((c) => c.m === "limit")?.args[0] as number | undefined;

  // With overlay rows in play, read the real rows from offset 0 so the merged
  // page can be cut at the right place.
  let b: any = real.from(table as never);
  for (const c of calls) {
    if (local.length > 0 && c.m === "range") b = b.range(0, range![1]);
    else if (local.length > 0 && (c.m === "single" || c.m === "maybeSingle")) continue;
    else b = b[c.m](...c.args);
  }
  const res: Result = await b;
  if (local.length === 0 || res.error) return res;

  const realRows: Row[] = Array.isArray(res.data) ? (res.data as Row[]) : res.data ? [res.data as Row] : [];
  // A projected read ("select ts") carries only some of the conflict columns;
  // the others were pinned by an eq filter, so the columns it does carry are
  // enough to tell an overlay row shadowing a real one.
  const keys = (o!.keys ?? ["id"]).filter((k) => realRows.length === 0 || k in realRows[0]);
  const shadowed = new Set(local.map((r) => keyOf(r, keys)));
  const projected = realRows.length > 0 ? Object.keys(realRows[0]) : null;
  let rows = [
    ...(keys.length === 0 ? realRows : realRows.filter((r) => !shadowed.has(keyOf(r, keys)))),
    ...(projected ? local.map((r) => Object.fromEntries(projected.map((c) => [c, r[c]]))) : local),
  ];
  const orders = calls.filter((c) => c.m === "order");
  if (orders.length > 0) {
    rows.sort((x, y) => {
      for (const { args } of orders) {
        const [col, opt] = args as [string, { ascending?: boolean } | undefined];
        const d = cmp(x[col], y[col]);
        if (d !== 0) return opt?.ascending === false ? -d : d;
      }
      return 0;
    });
  }
  if (range) rows = rows.slice(range[0], range[1] + 1);
  if (limit !== undefined) rows = rows.slice(0, limit);
  if (single) {
    if (rows.length === 0) return single === "single" ? { data: null, error: { message: "no rows (read-only harness)" } } : { data: null, error: null };
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

function applyWrite(table: string, op: string, values: unknown, opts: Record<string, unknown> | undefined, calls: Call[]): Result {
  const o = overlayFor(table);
  let touched: Row[] = [];
  if (op === "insert" || op === "upsert") {
    const input = (Array.isArray(values) ? values : [values]) as Row[];
    const keys = op === "upsert" && typeof opts?.onConflict === "string" ? (opts.onConflict as string).split(",").map((s) => s.trim()) : null;
    if (keys) o.keys = keys;
    for (const v of input) {
      const row: Row = { ...v };
      if (row.id === undefined) row.id = `ro-${table}-${++seq}`;
      if (row.created_at === undefined) row.created_at = new Date().toISOString();
      if (keys) {
        const k = keyOf(row, keys);
        const at = o.rows.findIndex((r) => keyOf(r, keys) === k);
        if (at >= 0) {
          if (opts?.ignoreDuplicates) continue;
          row.id = o.rows[at].id;
          o.rows[at] = row;
          touched.push(row);
          continue;
        }
      }
      o.rows.push(row);
      touched.push(row);
    }
  } else if (op === "update") {
    touched = o.rows.filter((r) => matches(r, calls));
    for (const r of touched) Object.assign(r, values as Row);
  } else if (op === "delete") {
    touched = o.rows.filter((r) => matches(r, calls));
    o.rows = o.rows.filter((r) => !touched.includes(r));
  }
  interceptedWrites.push({ table, op, rows: Array.isArray(values) ? values.length : touched.length || 1 });
  const wantsRows = calls.some((c) => c.m === "select");
  const single = calls.some((c) => c.m === "single" || c.m === "maybeSingle");
  if (!wantsRows) return { data: null, error: null };
  return { data: single ? (touched[0] ?? null) : touched, error: null };
}

/** A chainable, thenable stand-in that records every call and runs `exec` when awaited. */
function chain(exec: (calls: Call[]) => Promise<Result>, calls: Call[] = []): any {
  return new Proxy(
    {},
    {
      get(_t, p) {
        if (p === "then") {
          return (ok: (r: Result) => unknown, fail: (e: unknown) => unknown) => exec(calls).then(ok, fail);
        }
        if (typeof p === "symbol") return undefined;
        return (...args: unknown[]) => chain(exec, [...calls, { m: p, args }]);
      },
    },
  );
}

export function readOnly(real: SupabaseClient<Database>): SupabaseClient<Database> {
  return new Proxy(real, {
    get(t, p, r) {
      if (p === "from") {
        return (table: string) => ({
          select: (...args: unknown[]) => chain((calls) => runRead(real, table, calls), [{ m: "select", args }]),
          insert: (values: unknown, opts?: Record<string, unknown>) => chain(async (calls) => applyWrite(table, "insert", values, opts, calls)),
          upsert: (values: unknown, opts?: Record<string, unknown>) => chain(async (calls) => applyWrite(table, "upsert", values, opts, calls)),
          update: (values: unknown) => chain(async (calls) => applyWrite(table, "update", values, undefined, calls)),
          delete: () => chain(async (calls) => applyWrite(table, "delete", null, undefined, calls)),
        });
      }
      if (p === "rpc") {
        return (fn: string, args?: unknown, opts?: unknown) => {
          if (!READ_ONLY_RPCS.has(fn)) throw new Error(`read-only harness: rpc "${fn}" is not on the read-only allowlist`);
          return (t.rpc as any)(fn, args, opts);
        };
      }
      if (p === "storage" || p === "functions") throw new Error(`read-only harness: supabase.${String(p)} is blocked`);
      return Reflect.get(t, p, r);
    },
  });
}

let shared: SupabaseClient<Database> | null = null;

/** The one read-only client every module in the process shares, so they all see the same overlay. */
export function readOnlyClient(): SupabaseClient<Database> {
  shared ??= readOnly(
    createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  );
  return shared;
}

/** Forget every swallowed write (between symbols in a sweep, so each starts from production as it is). */
export function resetOverlay(): void {
  overlay.clear();
  interceptedWrites.length = 0;
}
