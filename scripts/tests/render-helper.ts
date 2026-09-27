// Shared by suites that need to see what a component actually renders: runs
// render-component.ts in a child process and returns the visible text.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");

/** Rendered HTML, or "RENDER FAILED: ..." - never throws, so a suite reports it as a failed case. */
export function renderComponentHtml(modulePath: string, exportName: string, props: unknown): string {
  try {
    return execFileSync(
      process.execPath,
      [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(DIR, "render-component.ts"), modulePath, exportName, JSON.stringify(props)],
      { cwd: ROOT, encoding: "utf8" },
    );
  } catch (err) {
    return `RENDER FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** The rendered text with tags stripped and whitespace collapsed. */
export function renderComponentText(modulePath: string, exportName: string, props: unknown): string {
  return renderComponentHtml(modulePath, exportName, props)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
