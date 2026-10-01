import type { ConfirmationMessage } from "@/lib/waitlist";

// The beta invite and its one reminder. Pure: the caller supplies the link,
// the dates and the site origin, so the copy is testable without a send.
//
// The code appears in the link and nowhere else - not in the subject, not as
// visible text. The plain-text part has to carry the URL (there is no button
// in plain text), so it does, once.
//
// Same light transactional template as the waitlist confirmation
// (src/lib/waitlist.ts confirmationEmailHtml): a dark email renders
// unpredictably and trips spam heuristics.

export const INVITE_SUBJECT = "You're in: your Cairn beta invite";
export const REMINDER_SUBJECT = "Reminder: your Cairn beta invite";
export const NOT_ADVICE_LINE = "Cairn explains markets, it never tells you to buy or sell.";

export interface InviteEmailInput {
  kind: "invite" | "reminder";
  link: string;
  expiresAt: Date;
  /** Formatted BETA_PREMIUM_UNTIL ("31 December 2026"), or null when beta Premium is off. */
  premiumUntil: string | null;
  /** Site origin, for the logo and the privacy link. */
  origin: string;
}

export function formatInviteDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function paragraph(input: InviteEmailInput): string {
  const premium = input.premiumUntil ? ` The beta includes full Premium until ${input.premiumUntil}, at no cost.` : "";
  return input.kind === "reminder"
    ? `A week ago we sent you a personal invite to the Cairn beta, and it hasn't been used yet. Here is a fresh link - the one in our first email no longer works.${premium}`
    : `Your place on the waitlist has come up. Cairn is a market research assistant that explains what is moving and why, with its sources shown. This link is yours alone and creates one account for this email address.${premium}`;
}

export function buildInviteEmail(input: InviteEmailInput): ConfirmationMessage {
  const expires = formatInviteDate(input.expiresAt);
  const privacy = `${input.origin}/privacy`;
  const intro = paragraph(input);

  const text = [
    input.kind === "reminder" ? "Your Cairn beta invite is still waiting." : "You're in: your Cairn beta invite.",
    "",
    intro,
    "",
    `Create your account: ${input.link}`,
    "",
    `This link works once and expires on ${expires}.`,
    "Need help? Reply to this email - it comes straight to the Cairn team.",
    "",
    NOT_ADVICE_LINE,
    "You're getting this because you joined the Cairn waitlist and confirmed your email. We send at most one reminder about this invite.",
    `Privacy Policy: ${privacy}`,
    "Cairn is informational only - not a broker and not investment advice.",
  ].join("\n");

  return {
    subject: input.kind === "reminder" ? REMINDER_SUBJECT : INVITE_SUBJECT,
    text,
    html: inviteEmailHtml(input, intro, expires, privacy),
  };
}

const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function inviteEmailHtml(input: InviteEmailInput, intro: string, expires: string, privacy: string): string {
  const heading = input.kind === "reminder" ? "Your beta invite is still waiting" : "You&rsquo;re in";
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;">
          <tr>
            <td style="padding:32px 32px 0;">
              <img src="${input.origin}/cairn-lockup.png" alt="Cairn" width="148" height="50" style="display:block;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#18181b;">
              ${heading}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;font-family:${SANS};font-size:14px;line-height:1.6;color:#3f3f46;">
              ${escapeHtml(intro)}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#2FC685;">
                    <a href="${input.link}" style="display:inline-block;padding:12px 24px;font-family:${SANS};font-size:14px;font-weight:600;color:#0A0A0A;text-decoration:none;border-radius:8px;">
                      Create your account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#3f3f46;">
              This link works once and expires on <strong>${expires}</strong>.<br>
              Need help? Reply to this email - it comes straight to the Cairn team.
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;font-family:${SANS};font-size:13px;line-height:1.6;color:#3f3f46;">
              ${NOT_ADVICE_LINE}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 32px;font-family:${SANS};font-size:12px;line-height:1.6;color:#a1a1aa;">
              You&rsquo;re getting this because you joined the Cairn waitlist and confirmed your email. We send at most one reminder about this invite.
              <a href="${privacy}" style="color:#71717a;text-decoration:underline;">Privacy Policy</a><br>
              Cairn is informational only - not a broker and not investment advice.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&rsquo;");
}
