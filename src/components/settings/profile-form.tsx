"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/lib/actions/settings";
import { SubmitButton } from "@/components/auth/submit-button";

const FIELD =
  "w-full rounded-lg border border-line bg-active px-3.5 py-2.5 text-[13px] text-primary outline-none transition-colors duration-fast ease-standard focus:border-[#3A3A3A]";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Name and email, editable in place.
 *
 * These were read-only text before - the Account panel printed the name and
 * address next to an avatar with no way to change either, so a display name
 * chosen at sign-up was permanent.
 */
export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(updateProfile, null);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-light to-accent-dark text-[15px] font-semibold text-canvas">
            {initialsOf(displayName)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] text-primary">{displayName}</div>
            <div className="truncate text-[13px] text-muted">{email}</div>
            {result === "saved" && <div className="mt-1 text-[12px] text-accent">Profile updated.</div>}
            {result === "email_pending" && (
              <div className="mt-1 max-w-[46ch] text-[12px] text-warning text-pretty">
                Name saved. Your email won&rsquo;t change until you follow the confirmation link we just sent to the
                new address.
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg border border-line px-4 py-2 text-[12.5px] text-primary transition-colors duration-fast ease-standard hover:bg-active"
        >
          Edit profile
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Display name</span>
        <input type="text" name="display_name" defaultValue={displayName} maxLength={80} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">Email</span>
        <input type="email" name="email" defaultValue={email} required className={FIELD} />
        <span className="text-[11.5px] leading-relaxed text-muted text-pretty">
          Changing this sends a confirmation link to the new address. Your sign-in email stays the old one until that
          link is followed.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <SubmitButton>Save profile</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted">
          Cancel
        </button>
      </div>
      {result && result !== "saved" && result !== "email_pending" && (
        <span className="text-[13px] text-negative">{result}</span>
      )}
    </form>
  );
}
