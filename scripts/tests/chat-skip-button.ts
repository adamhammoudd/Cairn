// Audit 2026-09-04 (high-priority, by area, Chat): the streaming "Stop" button
// only stopped the browser from *rendering* the rest of the reply. The whole
// answer is generated, scope-guarded and written to chat_messages server-side
// before the first byte streams, so "Stop" couldn't un-generate or un-save it -
// and the truncated on-screen copy was silently replaced by the full answer on
// the next reload. The control didn't do what its label said.
//
// Fix: the button is "Skip" (it ends the typing animation), and on click the
// thread syncs to the persisted turn.
//
// Run: npx tsx --conditions=react-server scripts/tests/chat-skip-button.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const thread = readFileSync(join(ROOT, "src/components/chat/chat-thread.tsx"), "utf8");
const route = readFileSync(join(ROOT, "src/app/api/chat/route.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- the root cause the button can't fight: save happens before the stream ---
// Assistant v2 opens the stream early to carry tool-activity lines, so the
// invariant is now "saved before the first byte of ANSWER TEXT", which is what
// Skip depends on.
const insertIdx = route.indexOf('.from("chat_messages").insert');
const streamIdx = route.indexOf('t: "text"');
check("route.ts writes the turn to chat_messages before any answer text streams", insertIdx > 0 && streamIdx > 0 && insertIdx < streamIdx);

// --- so the button is honest about that ---
check('the streaming button label is "Skip", not "Stop"', /streaming \? "Skip" : "Send"/.test(thread));
check('no "Stop" label remains on the composer button', !/streaming \? "Stop"/.test(thread));

// --- and it reconciles the view with the saved turn on click ---
check(
  "aborting (Skip) reloads the persisted messages for the session",
  /AbortError[\s\S]{0,400}?listChatMessages\(activeSessionId, 0\)[\s\S]{0,120}?setMessages\(await withAnalyses/.test(thread),
);
check(
  "the abort path no longer just keeps the truncated stream",
  !/keep whatever streamed so far/.test(thread),
);

console.log(`\n${pass}/${pass + fail} chat-skip-button cases passed`);
process.exit(fail === 0 ? 0 : 1);
