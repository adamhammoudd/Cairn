// Pure validation for the two security-sensitive Settings actions, split out
// of lib/actions/settings.ts so it is testable without a Next.js request
// context (that module imports next/navigation).
//
// Audit 2026-09-04, finding #7: changePassword required only a live session,
// not the current password; deleteAccount's "type DELETE" confirmation was
// enforced client-side only.

/** The word the account-deletion form makes the user type. */
export const DELETE_CONFIRMATION = "DELETE";

/**
 * Whether a password change is allowed to proceed to re-authentication.
 * Returns an error string for the form, or null to continue.
 */
export function passwordChangeError(currentPassword: string, newPassword: string): string | null {
  if (!currentPassword) return "Enter your current password.";
  if (newPassword.length < 8) return "New password must be at least 8 characters.";
  if (newPassword === currentPassword) return "The new password must be different from the current one.";
  return null;
}

/**
 * Whether account deletion is confirmed. Enforced on the server because
 * deleteAccount is a plain callable server action - the client-side "type
 * DELETE" gate is a convenience, not a control.
 */
export function deleteConfirmationError(confirmation: string | undefined | null): string | null {
  return confirmation === DELETE_CONFIRMATION ? null : "Type DELETE to confirm account deletion.";
}
