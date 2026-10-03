import { readOperatorIdentity } from "@/lib/operator";
import { CONTACT_EMAIL } from "@/lib/site";
import { CopyButton } from "@/components/copy-button";

// The sample withdrawal form (audit 2026-10-02, item 3.9): a plain block a
// consumer can copy into an email, so withdrawing does not depend on knowing
// what to write. Modelled on the EU model withdrawal form (Directive 2011/83/EU,
// Annex I(B)) in plain words. The recipient lines come from the operator
// identity in the environment (lib/operator.ts) and are never invented: until it
// is set, the form addresses the published contact email only.
//
// A consumer may withdraw by any clear statement; this is a convenience, not a
// requirement - the page says so. Counsel to review before launch.

export function withdrawalFormText(): string {
  const operator = readOperatorIdentity();
  const to = operator ? `${operator.name}, ${operator.address}, ${operator.contactEmail}` : CONTACT_EMAIL;
  return [
    `To: ${to}`,
    "Subject: Withdrawal from my Cairn Premium subscription",
    "",
    "I withdraw from my contract for the Cairn Premium subscription.",
    "",
    "Subscribed on (date): ",
    "Name: ",
    "Email address of my Cairn account: ",
    "Date: ",
  ].join("\n");
}

export function WithdrawalForm() {
  const text = withdrawalFormText();
  return (
    <div id="withdrawal-form" className="mt-4 scroll-mt-24">
      <p>
        <strong>Sample withdrawal form.</strong> You do not have to use it - any clear statement that you
        withdraw is enough - but you can copy this into an email, fill in the blanks and send it.
      </p>
      <pre
        tabIndex={0}
        aria-label="Sample withdrawal form"
        className="mt-3 overflow-x-auto rounded-panel border border-line bg-canvas p-4 font-mono text-caption leading-[1.7] whitespace-pre-wrap text-primary select-all"
      >
        {text}
      </pre>
      <CopyButton text={text} label="Copy the form" />
    </div>
  );
}
