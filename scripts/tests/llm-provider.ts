// The DeepInfra switch (2026-09-25), proven without a network: the request
// goes to the right host with the right key, a host that rejects
// `reasoning_effort` is retried once without it, and the old GROQ_API_KEY is
// never read (it would otherwise be sent to DeepInfra).
//
// Replaces global fetch with a fake for the duration of the run, so it is
// deliberately NOT part of test:ai-suite, whose live suites run in parallel
// and need the real fetch.
//
// Run: npm run test:llm-provider

import { isLlmConfigured, llmComplete, llmHealthCheck, providerNameFor } from "@/lib/ai/llm";

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  console.log(`${ok ? "pass " : "FAIL "} ${msg}`);
  if (!ok) failures.push(msg);
};

type Call = { url: string; auth: string | null; body: Record<string, unknown> };

function withEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function fakeFetch(respond: (call: Call) => Response): { calls: Call[]; restore: () => void } {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input),
      auth: headers.get("authorization"),
      body: JSON.parse(String(init?.body ?? "{}")),
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const ok = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 });

async function main() {
  const saved = Object.fromEntries(
    ["LLM_API_KEY", "GROQ_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "FALLBACK_LLM_BASE_URL", "FALLBACK_LLM_API_KEY"].map((k) => [k, process.env[k]]),
  );
  try {
    // 1. The old Groq key alone does not configure anything.
    withEnv({ LLM_API_KEY: undefined, GROQ_API_KEY: "gsk_old", LLM_BASE_URL: undefined, LLM_MODEL: undefined, FALLBACK_LLM_BASE_URL: undefined, FALLBACK_LLM_API_KEY: undefined });
    expect(!isLlmConfigured(), "GROQ_API_KEY alone is ignored - it can never be sent to DeepInfra");

    // 2. Defaults: DeepInfra, the same model id as before, LLM_API_KEY as the bearer.
    withEnv({ LLM_API_KEY: "di_test_key" });
    {
      const f = fakeFetch(() => ok("fine"));
      const text = await llmComplete({ system: "s", messages: [{ role: "user", content: "hi" }] });
      f.restore();
      const c = f.calls[0];
      expect(text === "fine", "a completion comes back");
      expect(c?.url === "https://api.deepinfra.com/v1/openai/chat/completions", `default host is DeepInfra (${c?.url})`);
      expect(c?.auth === "Bearer di_test_key", "the DeepInfra key is the bearer token, not the Groq one");
      expect(c?.body.model === "openai/gpt-oss-120b", `model id unchanged (${String(c?.body.model)})`);
      expect(c?.body.reasoning_effort === "low", "reasoning_effort is sent by default");
      expect(providerNameFor("https://api.deepinfra.com/v1/openai") === "deepinfra", "stored analyses are labelled deepinfra:...");
    }

    // 3. A host that rejects reasoning_effort gets one retry without it.
    {
      const f = fakeFetch((call) =>
        "reasoning_effort" in call.body
          ? new Response(JSON.stringify({ error: { message: "Unknown parameter: reasoning_effort" } }), { status: 400 })
          : ok("answered without the hint"),
      );
      const text = await llmComplete({ system: "s", messages: [{ role: "user", content: "hi" }] });
      f.restore();
      expect(text === "answered without the hint", "a reasoning_effort rejection is retried without the field");
      expect(f.calls.length === 2, `exactly one extra request (${f.calls.length} calls)`);
    }

    // 4. An unrelated 400 is NOT retried without the field - a real error stays loud.
    {
      const f = fakeFetch(() => new Response(JSON.stringify({ error: { message: "invalid model id" } }), { status: 400 }));
      let threw = false;
      try {
        await llmComplete({ system: "s", messages: [{ role: "user", content: "hi" }] });
      } catch {
        threw = true;
      }
      f.restore();
      expect(threw, "an unrelated 400 still fails immediately");
      expect(f.calls.length === 1, `and is not re-sent (${f.calls.length} call)`);
    }

    // 5. An empty prepaid balance (402) is "busy", sent once, not a crash.
    {
      const f = fakeFetch(() => new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 402 }));
      let name = "";
      try {
        await llmComplete({ system: "s", messages: [{ role: "user", content: "hi" }] });
      } catch (e) {
        name = e instanceof Error ? e.constructor.name : "";
      }
      f.restore();
      expect(name === "LlmBusyError", `HTTP 402 surfaces as the busy message (${name})`);
      expect(f.calls.length === 1, `and is not retried (${f.calls.length} call)`);
    }

    // 6. Health check reports the DeepInfra host.
    {
      const f = fakeFetch(() => ok("pong"));
      const h = await llmHealthCheck();
      f.restore();
      expect(h.ok && h.detail.includes("api.deepinfra.com"), `health check hits DeepInfra (${h.detail})`);
    }
  } finally {
    withEnv(saved);
  }

  console.log(`\n${failures.length === 0 ? "all" : "NOT all"} llm-provider cases passed`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
