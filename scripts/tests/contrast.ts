// WCAG contrast floor for the palette, checked against the real token values
// parsed out of globals.css.
//
// This exists because the dark theme was assumed to be fine and was not:
// --color-dim measured 3.66:1 against the canvas, below the 4.5:1 AA floor for
// normal text, and it is used at 9.5-11px where the large-text allowance does
// not apply. axe-core caught it on every page it could reach.
//
// Kept as a unit test rather than only in the browser audit because it needs
// no server and no browser, so a palette edit is checked on every CI run
// rather than only when someone remembers to run the a11y pass.

import fs from "node:fs";
import path from "node:path";
import type { SuiteResult, TestCase } from "./report";

const AA_NORMAL = 4.5;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function readTokens(): Record<string, string> {
  const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const tokens: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    if (!tokens[m[1]]) tokens[m[1]] = m[2];
  }
  return tokens;
}

// Tokens used as text or as meaningful iconography, which must clear AA
// against both grounds they are drawn on. Backgrounds and hairlines are
// excluded - `line` is a 1px border, which is a non-text contrast concern with
// a different (3:1) threshold and is not what this suite is asserting.
const TEXT_TOKENS = ["primary", "muted", "dim", "accent", "accent-light", "negative", "warning", "info", "violet"];
const GROUNDS = ["canvas", "panel"];

export function runContrastSuite(): SuiteResult {
  const tokens = readTokens();
  const cases: TestCase[] = [];

  for (const name of TEXT_TOKENS) {
    const fg = tokens[name];
    if (!fg) {
      cases.push({ name: `--color-${name} is defined`, status: "fail", detail: "token not found in globals.css" });
      continue;
    }
    for (const groundName of GROUNDS) {
      const bg = tokens[groundName];
      if (!bg) continue;
      const ratio = contrastRatio(fg, bg);
      const ok = ratio >= AA_NORMAL;
      cases.push({
        name: `${name} on ${groundName} meets WCAG AA for normal text`,
        status: ok ? "pass" : "fail",
        detail: `${fg} on ${bg} = ${ratio.toFixed(2)}:1 (needs ${AA_NORMAL}:1)`,
        attachment: ok ? undefined : `Raise --color-${name} until it reaches ${AA_NORMAL}:1 against ${bg}.`,
      });
    }
  }

  // Guards the sanity of the calculation itself: known reference pairs.
  const white = contrastRatio("#ffffff", "#000000");
  cases.push({
    name: "contrast calculation is correct (white on black = 21:1)",
    status: Math.abs(white - 21) < 0.01 ? "pass" : "fail",
    detail: `${white.toFixed(2)}:1`,
  });
  const same = contrastRatio("#777777", "#777777");
  cases.push({
    name: "contrast calculation is correct (identical colours = 1:1)",
    status: Math.abs(same - 1) < 0.01 ? "pass" : "fail",
    detail: `${same.toFixed(2)}:1`,
  });

  return { suiteName: "Palette contrast (WCAG AA)", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("contrast.ts")) {
  const suite = runContrastSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} contrast cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
