// Regression test: the Premium analog table was readable by anyone.
//
// ai_analysis_historical_analogs had a "public read validated" RLS policy
// (0034), so the public anon key could read every analog behind every
// validated analysis over the REST API - live on 2026-09-26 the anon role saw
// all 300 rows across 11 analyses - while the app trimmed Free accounts to one
// analog each. Migration 0051 drops the policy; the app reads the table only
// through the service role, after the plan gate.
//
// Source checks (the live check is the SQL in the PR: SET ROLE anon, count).
//
// Run: npx tsx --conditions=react-server scripts/tests/premium-analogs-private.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

export function runPremiumAnalogsPrivateSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).sort();
  const drops = migrations.filter((m) => /drop policy if exists "public read validated" on public\.ai_analysis_historical_analogs/.test(read(`supabase/migrations/${m}`)));
  const lastCreate = migrations.filter((m) => /create policy "public read validated" on public\.ai_analysis_historical_analogs/.test(read(`supabase/migrations/${m}`))).pop();
  check(
    "a migration after the one that created it drops the analog table's public read policy",
    drops.length > 0 && !!lastCreate && drops[drops.length - 1] > lastCreate,
    `created in ${lastCreate}, dropped in ${drops.join(", ") || "none"}`,
  );

  // Every read of the table in the app goes through the service role.
  const readers: string[] = [];
  const userScoped: string[] = [];
  for (const f of walk("src")) {
    if (f.endsWith("supabase/types.ts")) continue;
    const src = read(f);
    for (const m of src.matchAll(/(\w+(?:\(\))?)\s*\n?\s*\.from\("ai_analysis_historical_analogs"\)/g)) {
      readers.push(`${f}:${m[1]}`);
      if (!/admin|createAdminClient\(\)/i.test(m[1])) userScoped.push(`${f}:${m[1]}`);
    }
  }
  check("no app read of the analog table uses a user-scoped client", readers.length > 0 && userScoped.length === 0, `readers: ${readers.join(", ")}; user-scoped: ${userScoped.join(", ") || "none"}`);

  const action = read("src/lib/actions/analysis.ts");
  const gate = action.indexOf("await getUserPlan()");
  // The service-role client, either inline or as the `admin` created after the
  // plan is known (feat/analysis-display-v2 reads several tables with it).
  const adminDecl = action.indexOf("const admin = createAdminClient();");
  const inline = action.indexOf('createAdminClient()\n      .from("ai_analysis_historical_analogs")');
  const viaAdmin = action.search(/\badmin\s*\n\s*\.from\("ai_analysis_historical_analogs"\)/);
  const adminRead = inline > 0 ? inline : adminDecl > gate && viaAdmin > adminDecl ? viaAdmin : -1;
  check("attachMethodology reads analogs with the service role only after the plan is known", gate > 0 && adminRead > gate, `plan at ${gate}, admin read at ${adminRead}`);

  return { suiteName: "Premium analogs are not publicly readable", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = runPremiumAnalogsPrivateSuite();
  writeReport([suite]);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}
