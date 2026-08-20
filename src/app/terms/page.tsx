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
          <h2>6–10. Billing, liability, termination, governing law, changes</h2>
          <p>Placeholders pending legal review - see the full draft in the repository.</p>
        </section>
    </LegalShell>
  );
}
