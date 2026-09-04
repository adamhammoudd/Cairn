// Audit 2026-09-04, finding #12: /api/chat had no per-minute rate limit (only a
// daily quota, and Premium's is unlimited) and no server-side max length on the
// submitted message before it was built into the model prompt.
//
// Run: npx tsx --conditions=react-server scripts/tests/chat-abuse-surface.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rateLimit, _resetRateLimits } from "../../src/lib/rate-limit";
import { MAX_CHAT_MESSAGE_CHARS } from "../../src/lib/ai/chat-generate";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// --- the limiter -------------------------------------------------------
_resetRateLimits();
const t0 = 1_000_000;
const results = Array.from({ length: 15 }, (_, i) => rateLimit("chat:userA", 12, 60_000, t0 + i));
check("first 12 requests in the window are allowed", results.slice(0, 12).every((r) => r.allowed));
check("the 13th request in the window is blocked", results[12].allowed === false);
check("a blocked result carries a positive Retry-After", results[12].retryAfterSec >= 1);
check("remaining counts down to 0", results[0].remaining === 11 && results[11].remaining === 0);

check(
  "a different user has its own window",
  rateLimit("chat:userB", 12, 60_000, t0 + 5).allowed === true,
);

check(
  "the window resets after windowMs",
  rateLimit("chat:userA", 12, 60_000, t0 + 60_001).allowed === true,
);

// --- the message-length ceiling --------------------------------------
check("there is a positive max message length", MAX_CHAT_MESSAGE_CHARS > 0 && MAX_CHAT_MESSAGE_CHARS <= 20_000);

// --- the route wires both in -----------------------------------------
const route = readFileSync(join(import.meta.dirname, "..", "..", "src/app/api/chat/route.ts"), "utf8");
check("route applies rateLimit() keyed per user", /rateLimit\(`chat:\$\{user\.id\}`/.test(route));
check("route returns 429 with Retry-After when rate-limited", /status:\s*429[\s\S]{0,120}Retry-After/.test(route));
check("route rejects an over-length message with a 400", /MAX_CHAT_MESSAGE_CHARS[\s\S]{0,120}status:\s*400/.test(route));
check(
  "the rate-limit check is before the request body is parsed",
  route.indexOf("rateLimit(`chat:") < route.indexOf("await req.json()"),
  "burst check runs after body parse - abuse still costs a parse + DB hit",
);

// --- runChatTurn enforces the ceiling as a choke point --------------
const gen = readFileSync(join(import.meta.dirname, "..", "..", "src/lib/ai/chat-generate.ts"), "utf8");
check(
  "runChatTurn itself rejects an over-length message before buildChatContext",
  /\[\.\.\.message\]\.length > MAX_CHAT_MESSAGE_CHARS[\s\S]{0,120}throw/.test(gen),
);

console.log(`\n${pass}/${pass + fail} chat-abuse-surface cases passed`);
process.exit(fail === 0 ? 0 : 1);
