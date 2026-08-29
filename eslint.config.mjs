import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // globalIgnores REPLACES ESLint's default ignore set rather than adding to
  // it, so omitting node_modules here un-ignored it: `eslint .` linted every
  // dependency and reported 12,471 problems, which made the real count
  // unreadable and the lint script useless as a signal.
  globalIgnores([
    "node_modules/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are full copies of the repo, and .claude/skills holds
    // installed third-party skills. Neither is authored project source:
    // linting them double-counts every file and reports problems against code
    // this repo does not own.
    ".claude/**",
    // Generated artefacts, not authored source.
    "graphify-out/**",
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
