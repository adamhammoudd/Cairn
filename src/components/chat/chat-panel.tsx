"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChatThread } from "@/components/chat/chat-thread";

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (pathname.startsWith("/assistant")) return null;

  return (
    <>
      {open && (
        <div className="fixed right-6 bottom-24 z-20 flex h-[520px] w-[380px] flex-col overflow-hidden rounded-card border border-line bg-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] tracking-[0.08em] text-muted uppercase">AI research</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-primary">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread compact />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-6 bottom-6 z-20 flex h-14 w-14 items-center justify-center rounded-full shadow-lg"
        style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
        aria-label="Toggle AI research chat"
      >
        <span className="font-serif text-lg text-canvas">{open ? "✕" : "AI"}</span>
      </button>
    </>
  );
}
