"use client";

import { useFormStatus } from "react-dom";
import { BUTTON_PRIMARY } from "@/components/front-door/styles";

// The app's settings, watchlist and holding forms keep the gradient button
// they were built with; the auth pages pass `frontDoor` to take the front
// door's primary (flat green, 44px, 8px corners) so they match /waitlist.
const APP_LOOK =
  "w-full rounded-panel bg-gradient-to-br from-accent-light to-accent-dark py-3.5 text-title font-semibold text-canvas disabled:opacity-60";

export function SubmitButton({
  children,
  disabled = false,
  frontDoor = false,
}: {
  children: React.ReactNode;
  /** Extra disable condition ORed with the form's pending state (e.g. an unchecked consent box). */
  disabled?: boolean;
  frontDoor?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={frontDoor ? `${BUTTON_PRIMARY} w-full` : APP_LOOK}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}
