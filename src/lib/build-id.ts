import { execSync } from "node:child_process";

// A build identifier for the corner BuildBadge - lets anyone confirm the
// browser is looking at the current build before assuming a stale render is a
// design bug.
//
// Both values are resolved ONCE, when this module is first loaded, not on
// every render. The old version shelled out to `git rev-parse` and
// `git status` on every request: slow, and it returned "unknown" on Vercel
// anyway (the build container has no .git). Now the commit SHA comes from the
// platform's build env (Vercel sets VERCEL_GIT_COMMIT_SHA), and the timestamp
// is captured when the server bundle first loads - i.e. at deploy/cold-start
// time, not per-request.

function resolveBuildId(): string {
  const sha =
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);

  // Local dev / a checkout that does have .git: one call at module load.
  try {
    return execSync("git rev-parse --short HEAD", { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const BUILD_ID = resolveBuildId();
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

export function getBuildId(): string {
  return BUILD_ID;
}

export function getBuildTime(): string {
  return BUILD_TIME;
}
