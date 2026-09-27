// Re-judge and re-render a saved coverage-sweep JSON (docs/audits/coverage-
// sweep-<label>.json) after a change to the legitimacy rules - no re-run, no
// network. Run: npx tsx --conditions=react-server scripts/coverage-sweep-rerender.ts <label>
import fs from "node:fs";
import path from "node:path";
import { judge, renderReport, type SweepResult } from "./coverage-sweep";

const label = process.argv[2];
const file = path.resolve(`docs/audits/coverage-sweep-${label}.json`);
const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { seed: number; label: string; commit: string; started: string; results: (SweepResult & { pipeline: string })[] };
const results = saved.results.map((r) => ({ ...r, ...judge(r) }));
fs.writeFileSync(file, JSON.stringify({ ...saved, results }, null, 1));
fs.writeFileSync(path.resolve(`docs/audits/coverage-sweep-${label}.md`), renderReport(results, { seed: saved.seed, label: saved.label, commit: saved.commit, started: saved.started, pipeline: results[0]?.pipeline ?? "?" }));
console.log(`re-judged ${results.length} results -> docs/audits/coverage-sweep-${label}.md`);
