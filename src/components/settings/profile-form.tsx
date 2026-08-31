"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/settings";
import { SubmitButton } from "@/components/auth/submit-button";

// The mockup's Profile block: a two-column name / email grid (one column
// under 700px), each field always editable, with a verified/unverified chip on
// the email. Saved inline - `updateProfile` sends the email-change confirmation
// link when the address actually changes.

const LABEL = "mb-2 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";
const FIELD =
  "w-full rounded-[10px] border border-line bg-[#0B0B0B] px-3.25 py-2.75 text-[13px] text-primary outline-none transition-colors duration-fast ease-standard focus:border-accent";

export function ProfileForm({
  displayName,
  email,
  emailVerified,
}: {
  displayName: string;
  email: string;
  emailVerified: boolean;
}) {
  const [result, formAction] = useActionState(updateProfile, null);

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <div className={LABEL}>Display name</div>
          <input type="text" name="display_name" defaultValue={displayName} maxLength={80} className={FIELD} />
          <div className="mt-1.75 text-[11px] text-dim">Shown in the header and on anything you share.</div>
        </div>
        <div>
          <div className={LABEL}>Email</div>
          <input type="email" name="email" defaultValue={email} required className={FIELD} />
          <div className="mt-1.75 flex items-center gap-1.75">
            <span className="text-[11px] text-dim">Used for sign-in and alert delivery.</span>
            <span
              className={`font-mono text-[9px] tracking-[0.1em] uppercase ${emailVerified ? "text-accent" : "text-warning"}`}
            >
              {emailVerified ? "Verified" : "Unverified"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4.5 flex flex-wrap items-center gap-3">
        <SubmitButton>Save profile</SubmitButton>
        {result === "saved" && <span className="text-[12px] text-accent">Profile updated.</span>}
        {result === "email_pending" && (
          <span className="max-w-[46ch] text-[12px] text-warning text-pretty">
            Name saved. Your email won&rsquo;t change until you follow the confirmation link sent to the new address.
          </span>
        )}
        {result && result !== "saved" && result !== "email_pending" && (
          <span className="text-[12px] text-negative">{result}</span>
        )}
      </div>
    </form>
  );
}
