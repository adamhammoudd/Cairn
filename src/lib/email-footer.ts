// The footer every outgoing email carries: who is sending it, where to reach
// them, and how to stop (audit 2026-10-02, items 3.4 / 3.10).
//
// Appended in ONE place - sendEmail() in lib/waitlist.ts - so no message type,
// present or future, can reach the provider without it. The identity comes from
// lib/operator.ts; nothing here is invented. While the operator identity is not
// set, the footer says only what is known (the published contact address and the
// stop line) and sending can be made to refuse outright with
// EMAIL_REQUIRE_IDENTITY=1 (turn that on at launch).

import type { OperatorIdentity } from "@/lib/operator";

export interface FooterInput {
  operator: OperatorIdentity | null;
  /** Published contact address, used when the operator identity is not set. */
  fallbackContact: string;
  /** Personal one-click removal link for this recipient, when one exists. */
  removalUrl: string | null;
}

export interface Footer {
  text: string;
  html: string;
}

/** The exact stop line. Reply works only where inbound mail is wired (see /api/email/inbound); the link always works. */
export function stopLine(removalUrl: string | null): string {
  return removalUrl
    ? `Reply STOP, or open this link, and we won't email you again: ${removalUrl}`
    : "Reply STOP and we won't email you again.";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildEmailFooter({ operator, fallbackContact, removalUrl }: FooterInput): Footer {
  const identity = operator
    ? `${operator.name}, ${operator.address}. Enterprise number ${operator.enterpriseNumber}${operator.vatNumber ? `. VAT ${operator.vatNumber}` : ""}.`
    : null;
  const contact = operator?.contactEmail ?? fallbackContact;

  const textLines = ["", "--", "Cairn", ...(identity ? [identity] : []), `Contact: ${contact}`, stopLine(removalUrl)];

  const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const stopHtml = removalUrl
    ? `Reply STOP, or <a href="${esc(removalUrl)}" style="color:#71717a;text-decoration:underline;">open this link</a>, and we won&rsquo;t email you again.`
    : "Reply STOP and we won&rsquo;t email you again.";
  const html =
    `<div data-cairn-footer="1" style="max-width:480px;margin:0 auto;padding:16px 32px 32px;font-family:${SANS};font-size:12px;line-height:1.6;color:#71717a;">` +
    `<strong>Cairn</strong><br>` +
    (identity ? `${esc(identity)}<br>` : "") +
    `Contact: <a href="mailto:${esc(contact)}" style="color:#71717a;">${esc(contact)}</a><br>` +
    `${stopHtml}</div>`;

  return { text: textLines.join("\n"), html };
}

/** Marker used by tests, and to keep a message from being footed twice. */
export const FOOTER_MARKER = "Reply STOP";

export function appendFooter<M extends { text: string; html: string }>(message: M, footer: Footer): M {
  if (message.text.includes(FOOTER_MARKER) && message.html.includes('data-cairn-footer="1"')) return message;
  const html = /<\/body>/i.test(message.html)
    ? message.html.replace(/<\/body>/i, `${footer.html}</body>`)
    : `${message.html}${footer.html}`;
  return { ...message, text: `${message.text.replace(/\s+$/, "")}\n${footer.text}`, html };
}
