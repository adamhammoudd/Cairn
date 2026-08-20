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
        <div className="fixed right-6 bottom-24 z-20 hidden h-[520px] w-[380px] flex-col overflow-hidden rounded-card border border-line bg-panel shadow-2xl min-[900px]:flex">
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
        className="fixed right-6 bottom-6 z-20 hidden h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-gradient-to-br from-accent-light to-accent-dark shadow-lg min-[900px]:flex"
        aria-label="Toggle AI research chat"
      >
        <span className="pl-[0.06em] font-mono text-[15px] leading-none font-semibold tracking-[0.06em] text-canvas">{open ? "✕" : "AI"}</span>
      </button>
    </>
  );
}
