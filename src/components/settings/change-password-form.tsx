"use client";

import { useActionState, useState } from "react";
import { changePassword } from "@/lib/actions/settings";
import { SubmitButton } from "@/components/auth/submit-button";

export function ChangePasswordForm() {
  const [open, setOpen] = useState(false);
  const [result, formAction] = useActionState(changePassword, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
 >
        Change password
      </button>
    );
  }

  return (
    <form action={formAction}>
      <input
        type="password"
        name="password"
        placeholder="New password"
        required
        minLength={8}
 />
      <div>
        <SubmitButton>Update password</SubmitButton>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {result === "saved" && <span>Password updated.</span>}
      {result && result !== "saved" && <span>{result}</span>}
    </form>
  );
}
