"use client";

import { useState } from "react";

// Copies a block of text. If the clipboard is unavailable (an insecure context,
// or a browser that refuses), the text is still selectable in the block above, so
// the button says so rather than appearing to work.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
      className="tap mt-3 inline-flex min-h-11 items-center rounded-control border border-line px-3.5 text-body text-muted transition-colors duration-base ease-standard hover:border-line-strong hover:text-primary"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy - select the text above" : label}
    </button>
  );
}
