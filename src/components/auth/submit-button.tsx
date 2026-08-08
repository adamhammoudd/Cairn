"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[10px] py-3.5 text-[15px] font-semibold text-canvas disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
