// Audit 2026-09-04 (medium): the calendar grid was locked to the month
// containing today, with no way to view another month - even though events
// further out are already fetched by listUpcomingEvents.
//
// This checks the client-side re-windowing: a monthOffset state, prev/next/
// today controls, and the grid + label derived from the viewed month rather
// than from today.
//
// Run: npx tsx --conditions=react-server scripts/tests/calendar-month-nav.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dirname, "..", "..", "src/components/calendar/calendar-panel.tsx"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

check("has a monthOffset state", /const \[monthOffset, setMonthOffset\] = useState\(0\)/.test(src));
check("derives the viewed month from today + offset", /today\.getMonth\(\) \+ monthOffset/.test(src));
check("the grid is built from viewMonth, not today's month", /const gridStart = new Date\(viewMonth\)/.test(src));
check("inMonth compares against the viewed month", /date\.getMonth\(\) === viewMonth\.getMonth\(\)/.test(src));
check("the month label comes from viewMonth", /const monthLabel = viewMonth\.toLocaleDateString/.test(src));
check("today is still highlighted regardless of the viewed month", /isToday: iso === todayIso/.test(src));
check("has a Previous month control", /aria-label="Previous month"[\s\S]{0,120}setMonthOffset\(\(o\) => o - 1\)/.test(src) || /setMonthOffset\(\(o\) => o - 1\)[\s\S]{0,160}aria-label="Previous month"/.test(src));
check("has a Next month control", /setMonthOffset\(\(o\) => o \+ 1\)/.test(src) && /aria-label="Next month"/.test(src));
check("has a Today reset that is disabled at offset 0", /setMonthOffset\(0\)[\s\S]{0,120}disabled=\{monthOffset === 0\}/.test(src));

console.log(`\n${pass}/${pass + fail} calendar-month-nav cases passed`);
process.exit(fail === 0 ? 0 : 1);
