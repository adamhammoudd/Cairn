import { execSync } from "node:child_process";

// ui-reset-v2: lets anyone confirm the browser is actually looking at the
// current build before assuming a stale render is a design bug.
export function getBuildId(): string {
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: process.cwd() }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: process.cwd() }).toString().trim().length > 0;
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}

export function getBuildTime(): string {
  return new Date().toISOString();
}
