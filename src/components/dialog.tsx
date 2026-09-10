"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * The app's own modal, replacing window.confirm/window.prompt.
 *
 * Four flows asked for confirmation through the browser's native dialog: two
 * deletes, a watchlist delete and "name this screen". Those come from Chrome,
 * not from Cairn - system font, system chrome, no way to mark a destructive
 * action as destructive, and pinned to the top of the window rather than to
 * the thing being acted on. On a dark, typeset product they read as the page
 * having handed the user off to something else at the one moment that most
 * needs care.
 *
 * Native dialogs also block the page's JS thread entirely while open, which
 * makes them untestable in any automated browser session.
 *
 * The scrim and panel reuse the cn-scrim / cn-sheet keyframes already in
 * globals.css, which were written for exactly this and had one call site.
 */

interface BaseProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the confirm control in the loss/destructive tone. */
  destructive?: boolean;
  onCancel: () => void;
}

interface ConfirmProps extends BaseProps {
  onConfirm: () => void;
}

interface PromptProps extends BaseProps {
  /** Pre-fills the field; the dialog owns the value while it is open. */
  defaultValue?: string;
  placeholder?: string;
  /** Called with the trimmed value. Not called when the field is empty. */
  onSubmit: (value: string) => void;
}

/**
 * Shared shell: scrim, panel, escape-to-close, focus containment and focus
 * restoration. `initialFocus` is where focus lands on open - the input for a
 * prompt, the confirm button otherwise.
 */
function DialogShell({
  open,
  title,
  description,
  onCancel,
  children,
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onCancel: () => void;
  children: ReactNode;
  initialFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;

    // Where focus came from, so it can go back. Without this, dismissing the
    // dialog drops keyboard focus to the top of the document and the user has
    // to tab all the way back to the row they were on.
    const opener = document.activeElement as HTMLElement | null;
    initialFocusRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;

      // Focus containment. A modal that lets Tab walk out into the page behind
      // it is a modal in appearance only.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onCancel, initialFocusRef]);

  if (!open) return null;

  return (
    <div
      className="animate-scrim-in fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // mousedown, not click: a click that STARTS inside the panel and ends
        // on the scrim (selecting text, dragging off a button) would otherwise
        // dismiss the dialog under the user's hand.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="animate-sheet-in w-full max-w-[440px] rounded-card border border-line bg-raised p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
      >
        <h2 id={titleId} className="font-serif text-h3 leading-[1.25] text-primary text-pretty">
          {title}
        </h2>
        {description && (
          <div id={descId} className="mt-2.5 max-w-[52ch] text-body leading-[1.6] text-muted text-pretty">
            {description}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const CANCEL_BTN =
  "rounded-control border border-line px-4 py-2 text-body text-muted transition-colors duration-fast ease-standard hover:border-line-strong hover:text-primary";

function confirmBtn(destructive: boolean) {
  return destructive
    ? // Destructive confirm carries the loss tone, per the brand rule that red
      // is reserved for exactly this.
      "rounded-control border border-negative/50 bg-negative/10 px-4 py-2 text-body font-semibold text-negative transition-colors duration-fast ease-standard hover:bg-negative/20"
    : "rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]";
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <DialogShell open={open} title={title} description={description} onCancel={onCancel} initialFocusRef={confirmRef}>
      <div className="mt-5 flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={onCancel} className={CANCEL_BTN}>
          {cancelLabel}
        </button>
        <button ref={confirmRef} type="button" onClick={onConfirm} className={confirmBtn(destructive)}>
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}

export function PromptDialog({
  open,
  title,
  description,
  defaultValue = "",
  placeholder,
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
}: PromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  // Re-arm on each open so a previous entry is never inherited. Adjusted
  // during render rather than in an effect - the same pattern TopNav uses to
  // close its menus on navigation - so there is no extra commit showing the
  // stale value before the reset lands.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setValue(defaultValue);
  }

  const trimmed = value.trim();

  return (
    <DialogShell open={open} title={title} description={description} onCancel={onCancel} initialFocusRef={inputRef}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className="mt-4 w-full rounded-control border border-line bg-panel px-3 py-2.5 text-body text-primary placeholder:text-dim focus:border-accent focus:outline-none"
        />
        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <button type="button" onClick={onCancel} className={CANCEL_BTN}>
            {cancelLabel}
          </button>
          {/* Disabled on an empty field rather than accepting it and failing
              later - window.prompt returned "" happily and the caller had to
              guess whether that meant cancel. */}
          <button type="submit" disabled={!trimmed} className={`${confirmBtn(false)} disabled:opacity-40`}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
