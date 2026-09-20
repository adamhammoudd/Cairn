import { LegalShell } from "@/components/legal-shell";

export const metadata = {
  title: "Accessibility - Cairn",
  description:
    "What accessibility checks Cairn runs automatically and by hand, what has not been verified yet, and how to report a problem.",
  alternates: { canonical: "/accessibility" },
};

// Wave 12.5. The brief's own instruction is the hard part here: "Don't let the
// statement overstate what's actually been verified." Most accessibility
// statements claim conformance nobody measured. This one lists the checks that
// actually run in the test suite, names what has NOT been checked, and says so
// in the same voice as the rest of the product.
export default function AccessibilityPage() {
  return (
    <LegalShell eyebrow="Accessibility" title="Accessibility at Cairn" updated="30 August 2026" draft={false}>
      <section>
        <h2>What this page is</h2>
        <p>
          A plain account of the accessibility work that has been done on Cairn and the work that
          has not. It is deliberately specific: a statement claiming full conformance would be
          easy to write and impossible to back up, and Cairn&apos;s whole premise is not making
          claims stronger than the evidence behind them.
        </p>
      </section>

      <section>
        <h2>What is checked automatically</h2>
        <p>
          Colour contrast is enforced by an automated test that runs with the rest of the suite.
          Every foreground/background pairing in the palette - including the green gain accent and
          the red loss accent against the near-black canvas - is asserted against the WCAG 2.1 AA
          contrast thresholds, and the build fails if any pairing regresses. Dark themes are not
          automatically accessible, which is why this is measured rather than assumed.
        </p>
      </section>

      <section>
        <h2>What has been done by hand</h2>
        <ul>
          <li>Meaningful images and icon-only controls carry text alternatives; icons that are
            purely decorative are hidden from assistive technology rather than given filler labels.</li>
          <li>Pages follow a single, descending heading structure, so the heading outline can be
            used for navigation.</li>
          <li>Form fields have associated labels, and validation errors are announced next to the
            field they concern rather than only as colour.</li>
          <li>Gain and loss are never signalled by colour alone - a direction is always carried by
            a sign or an arrow as well, which matters for the most common forms of colour
            blindness.</li>
        </ul>
      </section>

      <section>
        <h2>What has not been verified</h2>
        <p>
          A full automated audit (axe) across every route has <strong>not</strong> been completed,
          and Cairn has not been tested end to end with a screen reader, nor audited by an
          accessibility specialist. No claim of formal WCAG 2.1 AA conformance is being made. The
          charting surfaces in particular are known to be weaker than the rest of the product for
          keyboard-only and screen-reader use.
        </p>
      </section>

      <section>
        <h2>Telling us about a problem</h2>
        <p>
          If something here is unusable for you, that is a defect and we want to hear about it.
          Use the contact address on the{" "}
          <a href="/privacy#contact">Privacy Policy page</a> (the single contact point for the
          product) and describe what you were trying to do, the page you were on, and the
          assistive technology you were using. Reports of this kind are prioritised alongside
          functional bugs, not below them.
        </p>
      </section>
    </LegalShell>
  );
}
