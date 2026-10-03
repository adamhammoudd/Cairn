// Shared by suites that need to see what a component actually renders: runs
// render-component.ts in a child process and returns the visible text.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "../..");

/**
 * The environment a render child process runs in. The suites run under
 * NODE_OPTIONS="--conditions=react-server" (the documented command), and a child
 * spawned from them inherits it - under which react-dom/server refuses to load
 * ("react-dom/server is not supported in React Server Components"), so every
 * rendering suite failed before it rendered anything (audit 2026-10-02, 4.1).
 * A render child must resolve react-dom/server normally, so the condition is
 * cleared for it and nothing else about the environment changes.
 */
export function renderChildEnv(base: Record<string, string | undefined> = process.env): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...base };
  const cleaned = (env.NODE_OPTIONS ?? "")
    .replace(/(?:^|\s)(?:--conditions|-C)(?:=|\s+)\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned) env.NODE_OPTIONS = cleaned;
  else delete env.NODE_OPTIONS;
  return env as NodeJS.ProcessEnv;
}

/** Rendered HTML, or "RENDER FAILED: ..." - never throws, so a suite reports it as a failed case. */
export function renderComponentHtml(modulePath: string, exportName: string, props: unknown): string {
  try {
    return execFileSync(
      process.execPath,
      [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(DIR, "render-component.ts"), modulePath, exportName, JSON.stringify(props)],
      { cwd: ROOT, encoding: "utf8", env: renderChildEnv() },
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
