"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  disabled = false,
}: {
  children: React.ReactNode;
  /** Extra disable condition ORed with the form's pending state (e.g. an unchecked consent box). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-panel bg-gradient-to-br from-accent-light to-accent-dark py-3.5 text-title font-semibold text-canvas disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
