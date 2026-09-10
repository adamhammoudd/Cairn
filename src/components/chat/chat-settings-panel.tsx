"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteChatSession, renameChatSession, updateChatPreferences, type ChatSession } from "@/lib/actions/chat";
import { ConfirmDialog } from "@/components/dialog";

// Tri-state control. A per-chat preference is null until the user actually
// sets it, so a thread keeps following Settings > AI Assistant instead of
// freezing whatever the account preference happened to be when it was created.
const CHOICES: { value: "inherit" | "on" | "off"; label: string }[] = [
  { value: "inherit", label: "Use account default" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

function toChoice(value: boolean | null): "inherit" | "on" | "off" {
  if (value === null) return "inherit";
  return value ? "on" : "off";
}

function fromChoice(choice: "inherit" | "on" | "off"): boolean | null {
  if (choice === "inherit") return null;
  return choice === "on";
}

const ROW =
  "flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-b border-line-soft px-4.5 py-4 last:border-b-0";
const PILL =
  "cursor-pointer rounded-control border border-line px-3 py-1.5 text-body text-muted peer-checked:border-transparent peer-checked:bg-active peer-checked:text-primary";

interface ChatSettingsPanelProps {
  session: ChatSession;
  /** Account-level values, shown so "Use account default" isn't a mystery box. */
  accountDefaults: { expandMethodology: boolean; usePortfolioContext: boolean };
  fallbackTitle: string;
}

export function ChatSettingsPanel({ session, accountDefaults, fallbackTitle }: ChatSettingsPanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState(session.title?.trim() ?? "");
  const [expand, setExpand] = useState(toChoice(session.expand_methodology));
  const [context, setContext] = useState(toChoice(session.use_portfolio_context));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startSave(async () => {
      const renameError = await renameChatSession(session.id, title || fallbackTitle);
      if (renameError) {
        setError(renameError);
        return;
      }
      const prefsError = await updateChatPreferences(session.id, {
        expandMethodology: fromChoice(expand),
        usePortfolioContext: fromChoice(context),
      });
      if (prefsError) {
        setError(prefsError);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function remove() {
    setConfirmingDelete(true);
  }

  function confirmRemove() {
    setConfirmingDelete(false);
    startDelete(async () => {
      const deleteError = await deleteChatSession(session.id);
      if (deleteError) {
        setError(deleteError);
        return;
      }
      // The thread this page describes no longer exists, so there is nothing
      // to go "back" to - land on the assistant, which opens the next thread.
      router.replace("/assistant");
    });
  }

  return (
    <div className="animate-page-in mx-auto max-w-[1060px]">
      {/* Back sits above everything at the top-left, matching the Settings
          sub-header pattern rather than introducing a third nav style. */}
      <Link
        href="/assistant"
        className="mb-4 inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-body text-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to chat
      </Link>

      <div className="mb-5.5">
        <div className="mb-2 font-mono text-eyebrow text-muted uppercase">Assistant · Conversation</div>
        <h1 className="font-serif text-h1 leading-[1.1] font-normal text-primary">Conversation settings</h1>
        <p className="mt-2 max-w-[560px] text-lead text-muted text-pretty">
          Name this thread and set how the assistant answers inside it. Anything left on the account default keeps
          following Settings › AI Assistant.
        </p>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <div className="border-b border-line px-4.5 py-4 font-serif text-h3 text-primary">This conversation</div>

        <div className={ROW}>
          <div className="min-w-0 max-sm:w-full">
            <div className="text-body text-primary">Name</div>
            <div className="mt-1 text-caption text-muted">Shown in the History rail. Blank falls back to the date.</div>
          </div>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={fallbackTitle}
            className="w-full max-w-[280px] rounded-control border border-line bg-canvas px-3 py-1.5 text-body text-primary outline-none transition-colors duration-base ease-standard focus:border-accent max-sm:max-w-none"
          />
        </div>

        <div className={ROW}>
          <div className="min-w-0 max-sm:w-full">
            <div className="text-body text-primary">Show methodology by default</div>
            <div className="mt-1 max-w-[440px] text-caption leading-relaxed text-muted text-pretty">
              Expand sources and historical analogs on every answer in this thread without a click. Account default:{" "}
              <span className="text-primary">{accountDefaults.expandMethodology ? "On" : "Off"}</span>.
            </div>
          </div>
          <Choices name="expand" value={expand} onChange={setExpand} />
        </div>

        <div className={ROW}>
          <div className="min-w-0 max-sm:w-full">
            <div className="text-body text-primary">Portfolio context</div>
            <div className="mt-1 max-w-[440px] text-caption leading-relaxed text-muted text-pretty">
              Let the assistant read your holdings and watchlists when deciding what is relevant in this thread.
              Answers stay market/sector/ticker-level either way — Cairn never analyses your position or resolves to
              buy, hold, or sell. Account default:{" "}
              <span className="text-primary">{accountDefaults.usePortfolioContext ? "On" : "Off"}</span>.
            </div>
          </div>
          <Choices name="context" value={context} onChange={setContext} />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4.5 py-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {saved && !error && <span className="text-body text-accent">Saved.</span>}
          {error && <span className="text-body text-negative">{error}</span>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 bg-canvas/60 px-4.5 py-4">
          <div className="min-w-0">
            <div className="text-body text-negative">Delete conversation</div>
            <div className="mt-1 text-caption text-muted">
              Removes this thread and every message in it. Immediate and irreversible.
            </div>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="shrink-0 rounded-control border border-negative/40 px-4 py-2 text-body text-negative transition-colors duration-fast ease-standard hover:bg-negative/12 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this conversation?"
        description="The thread and every message in it are removed. Analyses it cited stay on record and remain reachable from Research."
        confirmLabel="Delete conversation"
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function Choices({
  name,
  value,
  onChange,
}: {
  name: string;
  value: "inherit" | "on" | "off";
  onChange: (next: "inherit" | "on" | "off") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHOICES.map((c) => (
        <label key={c.value}>
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            className="peer sr-only"
          />
          <span className={PILL}>{c.label}</span>
        </label>
      ))}
    </div>
  );
}
