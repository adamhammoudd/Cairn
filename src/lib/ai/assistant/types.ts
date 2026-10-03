// Shared shapes for the tool-using assistant (feat/assistant-v2).
//
// Pure types only - imported by the agent, the tools, the guards, the route
// and the chat UI alike.

export type ToolName =
  | "find_symbol"
  | "get_quote"
  | "get_price_summary"
  | "get_scorecard"
  | "get_company_numbers"
  | "get_history_outcome"
  | "get_news"
  | "get_calendar"
  | "get_portfolio"
  | "compare"
  | "get_market_proxies"
  | "web_search";

/** One citable source. `n` is assigned in code, in the order sources first appear. */
export interface AssistantSource {
  n: number;
  kind: "news" | "web" | "filing" | "data";
  title: string;
  publisher: string;
  url: string | null;
  /** YYYY-MM-DD, when known. */
  date: string | null;
}

export type SourceDraft = Omit<AssistantSource, "n">;

/** What one tool call produced. Logged on the message (meta.tools). */
export interface ToolOutcome {
  name: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  /** Short label for the "Checked: ..." line - "NVDA price", "your portfolio", "the web". */
  label: string;
  /**
   * What the model is shown. Numbers in here are display strings, formatted in
   * code ("$178.43", "+3.4%"), so the answer can quote them exactly - and the
   * figure guard's allow-list is built from this, never from model memory.
   */
  data: unknown;
  sources: SourceDraft[];
  /** Web content: fenced in the prompt as data, never as instructions. */
  untrusted?: boolean;
  error?: string;
  /** A plain sentence per fact, written in code - used by the fallback answer. */
  facts: string[];
  /** Up to a few headline figures, for the fallback answer's tiles. */
  tiles: AnswerTile[];
  ms: number;
  /** The tool failed before it sent anything (web search switched off): nothing was spent, and it must not be counted or reported as a search. */
  notRun?: boolean;
  /** Money spent by the tool itself (a paid web search), USD. */
  costUsd?: number;
  /** A stored analysis the tool reused, for the methodology card. */
  analysisId?: string;
}

export interface AnswerTile {
  label: string;
  value: string;
  note?: string;
}

export type SectionHeading = "What's happening" | "The business" | "What history says" | "For you";

export interface AnswerSection {
  heading: SectionHeading;
  /** Markdown; web/news claims carry [n] citations. */
  body: string;
}

/** The model's structured answer (and the fallback's, built in code). */
export interface AnswerDraft {
  lead: string;
  tiles: AnswerTile[];
  sections: AnswerSection[];
  follow_ups: string[];
}

/** Everything the UI renders around the text, stored in chat_messages.meta. */
export interface AssistantMeta {
  version: 1;
  /** "Checked: NVDA price, NVDA scorecard, news, the web". */
  checked: string[];
  tiles: AnswerTile[];
  sources: AssistantSource[];
  followUps: string[];
  /** "model" when the model's answer passed every guard; "facts" for the code-built fallback. */
  source: "model" | "facts";
  /** Guard failures on the way (first draft, repair), for review. */
  guardFailures: { reason: string; evidence?: string }[];
  portfolioUsed: boolean;
  /** Which web search provider received the search terms, when the answer used a web search (audit 3.5). Absent on older messages. */
  webProvider?: "groq" | "brave" | null;
  tools: { name: ToolName; args: Record<string, unknown>; ok: boolean; ms: number; error?: string }[];
  usage: { calls: number; promptTokens: number; completionTokens: number; webSearches: number };
  costUsd: number;
  model: string | null;
}
