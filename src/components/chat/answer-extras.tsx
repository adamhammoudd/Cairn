"use client";

import { MarkdownMessage } from "@/components/chat/markdown-message";
import type { AnswerTile, AssistantMeta } from "@/lib/ai/assistant/types";

// The pieces of an assistant v2 answer around its text (feat/assistant-v2):
// the "Checked: ..." activity line, up to four key-figure tiles and the
// follow-up suggestions. Everything here comes from chat_messages.meta,
// which the server built from tool results - the component formats nothing.

/** "Checked: NVDA prices, NVDA scorecard, the web" - or, while tools run, what is being checked now. */
export function CheckedLine({ checked, live }: { checked: string[]; live?: boolean }) {
  if (checked.length === 0) return null;
  return (
    <div className="mb-3 flex items-start gap-2 font-mono text-micro leading-[1.5] text-dim" aria-live={live ? "polite" : undefined}>
      <span aria-hidden className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${live ? "animate-breathe bg-accent" : "bg-line-strong"}`} />
      <span>
        {live ? "Checking" : "Checked"}: {checked.join(", ")}
        {live ? "…" : ""}
      </span>
    </div>
  );
}

/** Gains green, losses red (the only red on the page), everything else neutral. */
function toneFor(value: string): string {
  if (/^\+\d/.test(value)) return "text-accent-light";
  if (/^[-−]\d|^-\$/.test(value)) return "text-negative-light";
  return "text-primary";
}

export function AnswerTiles({ tiles }: { tiles: AnswerTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <dl className="my-3.5 grid grid-cols-2 gap-2 min-[640px]:grid-cols-4">
      {tiles.map((t) => (
        <div key={`${t.label}-${t.value}`} className="min-w-0 rounded-panel border border-line bg-canvas px-3 py-2.5">
          <dt className="truncate font-mono text-eyebrow uppercase tracking-[0.1em] text-dim">{t.label}</dt>
          <dd className={`m-0 mt-1 truncate font-mono text-[17px] tabular-nums ${toneFor(t.value)}`}>{t.value}</dd>
          {t.note && <dd className="m-0 mt-0.5 truncate text-micro text-muted">{t.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function FollowUps({ items, onPick, disabled }: { items: string[]; onPick?: (q: string) => void; disabled?: boolean }) {
  if (items.length === 0 || !onPick) return null;
  return (
    <div className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Suggested follow-up questions">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="rounded-full border border-line px-3 py-1.5 text-left text-caption text-muted transition-colors duration-fast ease-standard hover:border-accent hover:text-primary disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

const SOURCES_HEADING = /(?:^|\n)### Sources\n/g;

/**
 * Splits the trailing "### Sources" section (agent.ts renderMarkdown) off an
 * answer, so the list can sit behind a disclosure instead of trailing every turn.
 */
export function splitSources(content: string): [string, string] {
  const matches = [...content.matchAll(SOURCES_HEADING)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) return [content, ""];
  return [content.slice(0, last.index).trimEnd(), content.slice(last.index + last[0].length).trim()];
}

/** The numbered source list, collapsed by default. The count stays visible so a reader knows the answer is sourced. */
export function SourcesDisclosure({ sources }: { sources: string }) {
  if (!sources) return null;
  const count = sources.split("\n").filter((l) => /^\d+\./.test(l)).length;
  return (
    <details className="group mt-3.5 border-t border-line pt-3">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 font-mono text-micro text-muted transition-colors duration-fast ease-standard hover:text-primary [&::-webkit-details-marker]:hidden pointer-coarse:min-h-11">
        <span aria-hidden className="inline-block transition-transform duration-fast group-open:rotate-90">
          ›
        </span>
        <span className="group-open:hidden">See all sources{count > 0 ? ` (${count})` : ""}</span>
        <span className="hidden group-open:inline">Hide sources</span>
      </summary>
      <div className="mt-2 text-caption">
        <MarkdownMessage content={sources} />
      </div>
    </details>
  );
}

/** Shown when the reader got the code-built answer because the model's draft failed Cairn's checks. */
export function FactsNote({ meta }: { meta: AssistantMeta }) {
  if (meta.source !== "facts") return null;
  return <p className="mt-3 text-micro text-dim">Written by Cairn directly from the data above.</p>;
}
