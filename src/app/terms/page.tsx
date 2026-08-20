import { LegalShell } from "@/components/legal-shell";

export const metadata = { title: "Terms of Service - Cairn" };

export default function TermsofServicePage() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" updated="20 August 2026">
<section>
          <h2>1. What Cairn is</h2>
          <p>
            Cairn is a portfolio-tracking and market-research application. It aggregates market
            and news data, tracks user-entered holdings, and provides an AI analysis engine that
            surfaces probability-weighted, market/sector/ticker-level context.
          </p>
        </section>
        <section>
          <h2>2. What Cairn is not</h2>
          <p>
            Cairn is not a broker-dealer - it does not execute trades, hold custody of assets, or
            connect to brokerage accounts. Cairn is not investment advice: every AI output is
            scoped to a market, sector, or ticker, never to a specific user&apos;s position. Cairn
            is not a registered investment adviser.
          </p>
        </section>
        <section>
          <h2>3. Eligibility and accounts</h2>
          <p>
            Users must be able to form a binding contract in their jurisdiction. Account creation
            requires an email and password.
          </p>
        </section>
        <section>
          <h2>4. User content</h2>
          <p>
            Holdings, watchlists, chat messages, and settings entered by a user remain that
            user&apos;s data, stored to provide the service and never sold. See the Privacy
            Policy.
          </p>
        </section>
        <section>
          <h2>5. AI analysis engine disclosures</h2>
          <p>
            Every probability output is accompanied by its underlying sources and historical
            analogs - never a bare number. Outputs express confidence and uncertainty explicitly.
            A server-side scope guard rejects any generated output resolving to a personal
            directive before it is stored or shown - a technical control, not a guarantee. The
            engine may be wrong or based on an incomplete sample. Always verify sources and
            consult a licensed advisor before making financial decisions.
          </p>
        </section>
        <section>
          <h2>6. User-submitted content and takedown</h2>
          <p>
            Cairn hosts user-submitted text in per-ticker discussion threads. You retain ownership
            of what you post and grant Cairn a non-exclusive licence to display it within the
            service. You are responsible for what you submit, and you must not post content that
            is unlawful, infringes someone else&apos;s rights, or is intended to manipulate the
            price of a security.
          </p>
          <p>
            If you believe content on Cairn infringes your rights or otherwise breaches these
            terms, send us notice identifying the content, its location, and the basis of your
            complaint. We may remove or restrict access to user-submitted content that we
            reasonably believe breaches these terms, and we may suspend accounts that repeatedly
            do so. Current discussion features accept text only; if file or image uploads are
            added later, this clause is intended to cover them as well.
          </p>
        </section>
        <section>
          <h2>7. Dispute resolution and arbitration</h2>
          <p>
            <strong>Draft clause - specifically flagged for legal review.</strong> The intent is
            that disputes arising out of these terms or your use of Cairn are resolved by binding
            individual arbitration rather than in court, and that claims are brought individually
            rather than as part of a class or representative action, with a small-claims carve-out
            and an opt-out window for users who prefer not to be bound by it.
          </p>
          <p>
            Enforceability of arbitration and class-waiver clauses varies substantially by
            jurisdiction, and a clause of this kind can read as sound while being unenforceable or
            void where a user actually lives. The seat, governing rules, allocation of fees, and
            the opt-out mechanism are deliberately left unspecified here rather than guessed at.
            This clause must be drafted or reviewed by a qualified lawyer for each target market
            before Cairn relies on it.
          </p>
        </section>
        <section>
          <h2>8. Use of AI</h2>
          <p>
            Cairn uses artificial intelligence to generate analysis and chat content. Probability
            figures are computed in code from the historical records shown alongside them; the
            model writes the explanatory text around those numbers. AI output can be wrong,
            incomplete, or based on a small sample, and it is never a personal recommendation. See
            the Privacy Policy for what data is involved.
          </p>
        </section>
        <section>
          <h2>9–12. Billing, liability, termination, governing law, changes</h2>
          <p>Placeholders pending legal review - see the full draft in the repository.</p>
        </section>
    </LegalShell>
  );
}
