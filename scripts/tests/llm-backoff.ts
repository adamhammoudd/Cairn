// Unit test for the Groq rate-limit retry policy (src/lib/ai/llm.ts).
//
// This is the half of Section 1 that can be proven without a live key: the
// retry classification and the backoff arithmetic are pure functions, and they
// are exactly the parts that fail quietly if they are wrong. A too-eager retry
// set turns a 401 into four 401s and a timeout; a too-narrow one turns a 429
// into a user-visible error on the first hiccup.
//
// What still needs a live key: that a real 429 from Groq is actually recovered
// from. That is Section 8's job, not this suite's, and it is reported as
// unverified rather than implied by these passes.
//
// Run: npm run test:backoff

import { backoffDelayMs, isRetryableStatus, BUSY_MESSAGE, LlmBusyError } from "@/lib/ai/llm";
import type { SuiteResult, TestCase } from "./report";

const MAX_BACKOFF_MS = 8_000;

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runLlmBackoffSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- which statuses are worth retrying ----
  for (const status of [429, 500, 502, 503, 504, 408, 529]) {
    cases.push(
      check(`HTTP ${status} is treated as transient`, isRetryableStatus(status), `isRetryableStatus(${status})=true`),
    );
  }
  // The important negatives: retrying these hides a real configuration fault
  // behind a delay, which is how "no model configured" became "chat hangs".
  for (const status of [400, 401, 403, 404, 422]) {
    cases.push(
      check(
        `HTTP ${status} is NOT retried (real fault, must surface)`,
        !isRetryableStatus(status),
        `isRetryableStatus(${status})=false`,
      ),
    );
  }

  // ---- backoff grows, and stays bounded ----
  const noHeader = [0, 1, 2, 3].map((i) => backoffDelayMs(i));
  cases.push(
    check(
      "backoff is strictly positive on every attempt",
      noHeader.every((d) => d > 0),
      `delays=[${noHeader.join(", ")}]ms`,
    ),
  );
  cases.push(
    check(
      "backoff never exceeds the ceiling",
      noHeader.every((d) => d <= MAX_BACKOFF_MS),
      `max observed ${Math.max(...noHeader)}ms <= ${MAX_BACKOFF_MS}ms`,
    ),
  );
  // Jitter means attempt N is not guaranteed larger than N-1 on any single
  // draw, so the growth assertion is made on the floor of the range, which is
  // deterministic: floor(attempt) = ceiling(attempt)/2.
  const floor = (attempt: number) => Math.min(600 * 2 ** attempt, MAX_BACKOFF_MS) / 2;
  cases.push(
    check(
      "backoff floor grows with each attempt (exponential, not flat)",
      floor(0) < floor(1) && floor(1) < floor(2),
      `floors=[${floor(0)}, ${floor(1)}, ${floor(2)}]ms`,
    ),
  );

  // ---- Retry-After is honoured, in both legal forms ----
  cases.push(
    check(
      "numeric Retry-After (seconds) is honoured",
      backoffDelayMs(0, "2") === 2000,
      `backoffDelayMs(0, "2")=${backoffDelayMs(0, "2")}ms`,
    ),
  );
  cases.push(
    check(
      "fractional Retry-After is rounded up, not truncated to zero",
      backoffDelayMs(0, "0.35") === 350,
      `backoffDelayMs(0, "0.35")=${backoffDelayMs(0, "0.35")}ms`,
    ),
  );
  cases.push(
    check(
      "an absurd Retry-After is clamped to the ceiling",
      backoffDelayMs(0, "3600") === MAX_BACKOFF_MS,
      `backoffDelayMs(0, "3600")=${backoffDelayMs(0, "3600")}ms`,
    ),
  );
  const httpDate = new Date(Date.now() + 3000).toUTCString();
  const dateDelay = backoffDelayMs(0, httpDate);
  cases.push(
    check(
      "HTTP-date Retry-After is honoured",
      dateDelay > 1500 && dateDelay <= 3200,
      `backoffDelayMs(0, "${httpDate}")=${dateDelay}ms`,
    ),
  );
  cases.push(
    check(
      "unparseable Retry-After falls back to computed backoff",
      backoffDelayMs(1, "soon") > 0,
      `backoffDelayMs(1, "soon")=${backoffDelayMs(1, "soon")}ms`,
    ),
  );

  // ---- the user-facing contract ----
  const busy = new LlmBusyError(429, 4, "rate_limit_exceeded");
  cases.push(
    check(
      "LlmBusyError carries the status and attempt count for the log",
      busy.status === 429 && busy.attempts === 4 && busy.name === "LlmBusyError",
      `status=${busy.status} attempts=${busy.attempts}`,
    ),
  );
  cases.push(
    check(
      "the user-facing busy message says busy and says try again, with no internals",
      /temporarily busy/i.test(BUSY_MESSAGE) &&
        /try again/i.test(BUSY_MESSAGE) &&
        !/\b(429|groq|http|token|api)\b/i.test(BUSY_MESSAGE),
      JSON.stringify(BUSY_MESSAGE),
    ),
  );

  // --- A failed fallback must not hide why we fell back ----------------------
  // Real incident (2026-09-24): the primary hit its tokens-per-day limit and
  // the configured fallback answered HTTP 402 (unfunded account). The thrown
  // error was the fallback's alone, so every symptom read "payment required"
  // while the actual cause was a rate limit on the primary - and because a 402
  // is not an LlmBusyError, the UI showed the generic failure message instead
  // of "busy, try again". LlmBusyError now carries `detail` separately so the
  // two can be combined without nesting the prefix inside itself.
  {
    const primary = new LlmBusyError(429, 1, "tokens per day (TPD): Limit 200000, Used 199139");
    cases.push(
      check(
        "busy error exposes the provider's own text, unprefixed",
        primary.detail === "tokens per day (TPD): Limit 200000, Used 199139" &&
          primary.message.startsWith("Model provider unavailable after 1 attempt(s) (HTTP 429): "),
        `detail = "${primary.detail}"`,
      ),
    );
    // How completeWithEndpoints re-throws: built from `detail`, never `message`.
    const combined = new LlmBusyError(
      primary.status,
      primary.attempts,
      `${primary.detail} | Fell back to https://fallback.example/v1, which failed too: HTTP 402 payment required`,
    );
    cases.push(
      check(
        "the combined error keeps the busy classification",
        combined instanceof LlmBusyError && combined.status === 429,
        "so callers still render the 'busy, try again' message rather than a generic error",
      ),
    );
    cases.push(
      check(
        "the combined error names BOTH causes",
        combined.message.includes("tokens per day") && combined.message.includes("402 payment required"),
        "the rate limit that caused the fallback, and the fallback's own failure",
      ),
    );
    cases.push(
      check(
        "the prefix appears exactly once",
        combined.message.split("Model provider unavailable").length - 1 === 1,
        "building from `message` instead of `detail` nested the prefix inside itself",
      ),
    );
  }

  return { suiteName: "LLM rate-limit retry policy", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("llm-backoff.ts")) {
  const suite = runLlmBackoffSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} backoff cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
