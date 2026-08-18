"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark py-3.5 text-[15px] font-semibold text-canvas disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
