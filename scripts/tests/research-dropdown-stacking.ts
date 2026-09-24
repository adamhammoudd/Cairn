// The research composer's stacking level (src/components/analysis/research-workspace.tsx).
//
// Reported bug (2026-09-24): typing in the research scope box showed a
// suggestion list that was sliced off part-way down - the second row was cut
// mid-height and the rest were invisible.
//
// It was not a clipping problem, which is where an `overflow` hunt would send
// you. Confirmed in a real browser with document.elementFromPoint: the element
// painting over the list was inside the section that follows the composer,
// `<section className="animate-rise-in relative ...">`. That animation leaves a
// transform on the section, which makes it a stacking context; being positioned
// and LATER in the DOM, it painted above the composer. The dropdown's own z-20
// could not win, because z-20 only ranks it inside the composer's own stacking
// context (animate-menu-in gives the composer a transform too).
//
// So the fix is a z-index on the composer itself, and this guards it: a
// reformat that drops `relative z-10` brings the bug straight back, and the
// symptom looks like a CSS clip, so it would be hunted in the wrong place
// again.
//
// z-10 specifically: the sticky top nav is z-30 and must keep covering the
// suggestion list as the page scrolls behind it. A composer at z-30+ would
// punch through the nav.
//
// Run: npx tsx --conditions=react-server scripts/tests/research-dropdown-stacking.ts

import "./env";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, condition: boolean, detail: string): TestCase {
  return { name, status: condition ? "pass" : "fail", detail };
}

/** The composer panel's className, as written in the source. */
function composerClass(source: string): string | null {
  const m = source.match(/<div className="(animate-menu-in[^"]*rounded-2xl[^"]*)"/);
  return m ? m[1] : null;
}

export function runResearchDropdownStackingSuite(): SuiteResult {
  const cases: TestCase[] = [];

  let source: string;
  try {
    source = readFileSync(new URL("../../src/components/analysis/research-workspace.tsx", import.meta.url), "utf8");
  } catch {
    return {
      suiteName: "Research composer stacking (suggestion list overhangs the page)",
      gating: true,
      cases: [check("read research-workspace.tsx", false, "could not read the component")],
    };
  }

  const cls = composerClass(source);
  cases.push(check("the composer panel was found in the source", cls !== null, cls ?? "no animate-menu-in rounded-2xl panel matched"));

  if (cls) {
    cases.push(
      check(
        "the composer is positioned, so a z-index applies to it at all",
        /\brelative\b/.test(cls),
        `class = "${cls}"`,
      ),
    );
    const z = cls.match(/\bz-(\d+)\b/);
    cases.push(
      check(
        "the composer carries an explicit z-index",
        z !== null,
        z ? `z-${z[1]}` : "no z-* class - the section below will paint over the suggestion list again",
      ),
    );
    if (z) {
      const level = Number(z[1]);
      cases.push(
        check(
          "it outranks the following section, which sits at z-index auto",
          level > 0,
          `z-${level} beats the auto-level sibling that was covering it`,
        ),
      );
      cases.push(
        check(
          "it still sits below the sticky top nav (z-30)",
          level < 30,
          `z-${level} < 30, so the nav keeps covering the list while the page scrolls`,
        ),
      );
    }
  }

  // The dropdown's own z-20 remains necessary: it ranks the list above the
  // input row inside the composer. Losing it would put the list under the
  // sibling controls even with the composer ranked correctly.
  cases.push(
    check(
      "the suggestion list keeps its own z-index inside the composer",
      /absolute[^"]*\bz-20\b/.test(source),
      "the absolutely-positioned suggestion panel still carries z-20",
    ),
  );

  return { suiteName: "Research composer stacking (suggestion list overhangs the page)", gating: true, cases };
}

function main() {
  const suite = runResearchDropdownStackingSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass" : "FAIL"}  ${c.name} - ${c.detail}`);
  console.log(`\n${suite.cases.length - failed.length}/${suite.cases.length} research-dropdown-stacking cases passed`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
