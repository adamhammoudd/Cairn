// A tiny stand-in for Supabase (auth + PostgREST) serving the invented data in
// fixture-data.ts, so the real app can run end to end - signed in - with no
// database, no credentials and no real user data (audit 2026-10-02, item 6.5).
//
//   npx tsx scripts/harness/fake-supabase.ts [port]      (default 54399)
//
// Not a Postgres: it implements just enough of PostgREST for the app's reads
// (select/eq/in/gte/lte/order/limit/offset/count) and answers writes with a
// plausible echo. Unknown tables read as empty; unknown RPCs return []. That is
// deliberate - a page that depends on something this does not model shows its
// empty state, which is itself worth looking at.
import http from "node:http";
import { buildTables, FIXTURE_EMAIL, FIXTURE_USER_ID } from "./fixture-data";

type Row = Record<string, unknown>;
const tables = buildTables();

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(): string {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: FIXTURE_USER_ID, email: FIXTURE_EMAIL, role: "authenticated", aud: "authenticated", exp })}.fixture`;
}
const user = () => ({ id: FIXTURE_USER_ID, aud: "authenticated", role: "authenticated", email: FIXTURE_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
const session = () => ({ access_token: jwt(), token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: "fixture-refresh", user: user() });

// ---- PostgREST-lite -----------------------------------------------------------
function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== "string") return na - nb;
  return String(a) < String(b) ? -1 : 1;
}
function parseList(v: string): string[] {
  return v.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
}
function parseArrayLit(v: string): string[] {
  return v.replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).filter(Boolean);
}
function matches(row: Row, col: string, expr: string): boolean {
  const neg = expr.startsWith("not.");
  const e = neg ? expr.slice(4) : expr;
  const dot = e.indexOf(".");
  const op = e.slice(0, dot);
  const val = e.slice(dot + 1);
  const v = row[col];
  let ok = true;
  switch (op) {
    case "eq": ok = Array.isArray(v) ? (val === "{}" ? v.length === 0 : false) : String(v) === val; break;
    case "neq": ok = String(v) !== val; break;
    case "gt": ok = cmp(v, val) > 0; break;
    case "gte": ok = cmp(v, val) >= 0; break;
    case "lt": ok = cmp(v, val) < 0; break;
    case "lte": ok = cmp(v, val) <= 0; break;
    case "in": ok = parseList(val).includes(String(v)); break;
    case "is": ok = val === "null" ? v === null || v === undefined : val === "true" ? v === true : v === false; break;
    case "ilike": case "like": { const re = new RegExp(`^${val.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*|%/g, ".*")}$`, "i"); ok = re.test(String(v ?? "")); break; }
    case "ov": ok = Array.isArray(v) && parseArrayLit(val).some((x) => v.includes(x)); break;
    case "cs": ok = Array.isArray(v) && parseArrayLit(val).every((x) => v.includes(x)); break;
    default: ok = true;
  }
  return neg ? !ok : ok;
}

function query(table: string, params: URLSearchParams): { rows: Row[]; total: number } {
  let rows = [...(tables[table] ?? [])];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "or", "and", "on_conflict", "columns"].includes(k)) continue;
    rows = rows.filter((r) => matches(r, k, v));
  }
  const total = rows.length;
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((o) => { const [col, dir] = o.split("."); return { col, desc: dir === "desc" }; });
    rows.sort((a, b) => { for (const { col, desc } of keys) { const c = cmp(a[col], b[col]); if (c !== 0) return desc ? -c : c; } return 0; });
  }
  const offset = Number(params.get("offset") ?? 0);
  const limit = params.get("limit") ? Number(params.get("limit")) : rows.length;
  return { rows: rows.slice(offset, offset + limit), total };
}

function rpc(fn: string, args: Row): unknown {
  const px = tables.historical_prices;
  const perSymbol = Number(args.per_symbol ?? 1);
  const groups = (symbols: string[] | null, types: string[] | null) => {
    const by = new Map<string, Row[]>();
    for (const r of px) {
      if (symbols && !symbols.includes(String(r.symbol))) continue;
      if (types && !types.includes(String(r.asset_type))) continue;
      by.set(String(r.symbol), [...(by.get(String(r.symbol)) ?? []), r]);
    }
    return [...by.values()].flatMap((rs) => rs.sort((a, b) => cmp(b.ts, a.ts)).slice(0, perSymbol));
  };
  switch (fn) {
    case "recent_prices": return groups((args.symbols as string[]) ?? [], null);
    case "recent_prices_all": return groups(null, (args.asset_types as string[]) ?? null);
    case "search_symbols": {
      const p = String(args.prefix ?? "").toLowerCase();
      return tables.symbol_directory.filter((d) => String(d.symbol).toLowerCase().startsWith(p) || String(d.name ?? "").toLowerCase().includes(p)).slice(0, Number(args.max_results ?? 8));
    }
    case "symbol_52w_range": {
      return [...new Set(px.map((r) => String(r.symbol)))].map((symbol) => {
        const rs = px.filter((r) => r.symbol === symbol).slice(-252);
        return { symbol, high_52w: Math.max(...rs.map((r) => Number(r.high))), low_52w: Math.min(...rs.map((r) => Number(r.low))) };
      });
    }
    case "waitlist_founding_slots_remaining": return 12;
    default: return [];
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  let body: unknown = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* form bodies are not used */ }
  const send = (status: number, payload: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
    res.end(req.method === "HEAD" || payload === undefined ? undefined : JSON.stringify(payload));
  };
  if (req.method === "OPTIONS") return send(204, undefined, { "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });

  const p = url.pathname;
  if (p === "/auth/v1/token") return send(200, session());
  if (p === "/auth/v1/user") return send(200, user());
  if (p === "/auth/v1/logout") return send(204, undefined);
  if (p.startsWith("/auth/v1/")) return send(200, {});

  if (p.startsWith("/rest/v1/rpc/")) return send(200, rpc(p.slice("/rest/v1/rpc/".length), (body as Row) ?? Object.fromEntries(url.searchParams)));

  if (p.startsWith("/rest/v1/")) {
    const table = p.slice("/rest/v1/".length);
    const accept = String(req.headers.accept ?? "");
    const prefer = String(req.headers.prefer ?? "");
    if (req.method === "GET" || req.method === "HEAD") {
      const { rows, total } = query(table, url.searchParams);
      const range = `${rows.length ? 0 : "*"}${rows.length ? `-${rows.length - 1}` : ""}/${total}`;
      const extra: Record<string, string> = prefer.includes("count=") ? { "Content-Range": range } : {};
      if (accept.includes("vnd.pgrst.object+json")) {
        return rows.length === 1 ? send(200, rows[0], extra) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return send(200, rows, extra);
    }
    // Writes: echo what was sent, so a form submit "works" without storing anything.
    const rowsOut = (Array.isArray(body) ? body : body ? [body] : []).map((r, i) => ({ id: `99000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ...(r as Row) }));
    if (accept.includes("vnd.pgrst.object+json")) return send(req.method === "POST" ? 201 : 200, rowsOut[0] ?? {});
    return prefer.includes("return=representation") ? send(req.method === "POST" ? 201 : 200, rowsOut) : send(req.method === "POST" ? 201 : 204, undefined);
  }
  send(404, { message: "not modelled by the fixture server" });
});

const port = Number(process.argv[2] ?? 54399);
server.listen(port, "127.0.0.1", () => console.log(`[fixture] fake Supabase on http://127.0.0.1:${port} (account ${FIXTURE_EMAIL})`));
