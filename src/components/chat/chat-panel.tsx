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
        <div>
          <div>
            <div>
              <span>AI research</span>
            </div>
            <button type="button" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div>
            <ChatThread compact />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}

        aria-label="Toggle AI research chat"
 >
        <span>{open ? "✕" : "AI"}</span>
      </button>
    </>
  );
}
