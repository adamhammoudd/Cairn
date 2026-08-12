// Loads .env.local for standalone script execution (tsx, not Next.js), which
// doesn't get Next's automatic env loading. Import this before anything that
// reads process.env.
//
// Note there's no API-key check here anymore: Cairn runs a self-hosted model,
// so "is the model available" is a reachability question, not a credentials
// one — see llmHealthCheck() in src/lib/ai/llm.ts, which the scope-guard
// suite uses to decide whether its live tier can run.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(process.cwd(), ".env.local") });
