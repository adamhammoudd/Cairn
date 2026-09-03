import { LegalShell } from "@/components/legal-shell";
import { TOS_VERSION, legalDateDisplay } from "@/lib/legal-versions";

export const metadata = { title: "Terms of Service - Cairn" };

export default function TermsofServicePage() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" updated={legalDateDisplay(TOS_VERSION)}>
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
          <h2>9. Subscriptions and billing</h2>
          <p>
            Cairn offers a free tier and a paid Premium tier. Premium is billed through Stripe on a
            recurring basis at the price shown at checkout, and renews automatically until
            cancelled. You can cancel at any time from the billing settings or the Stripe customer
            portal; cancellation stops the next renewal and Premium features remain available until
            the end of the period already paid for. If a renewal payment fails, the account is
            downgraded to the free tier rather than losing access to its own data.
          </p>
          <p>
            <strong>Draft clause - flagged for legal review.</strong> Refund policy, proration on
            mid-period tier changes, price-change notice periods, and the treatment of taxes are
            deliberately not stated here and must be drafted alongside the finalized Phase 12
            billing terms before Premium is offered for sale.
          </p>
        </section>
        <section>
          <h2>10. Disclaimers and limitation of liability</h2>
          <p>
            Cairn is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of
            any kind, express or implied, including as to accuracy, completeness, timeliness, or
            fitness for a particular purpose. Market and news data comes from third-party sources
            and may be delayed, incomplete, or wrong. The AI analysis engine produces
            probability-weighted, market-level context that can be mistaken or based on a small
            historical sample; it is not a recommendation and not a substitute for advice from a
            licensed professional. You are solely responsible for any decision you make.
          </p>
          <p>
            <strong>Draft clause - specifically flagged for legal review.</strong> The intent is
            that, to the maximum extent permitted by applicable law, Cairn and the people who build
            it are not liable for indirect, incidental, special, consequential, or punitive
            damages, or for lost profits or investment losses, arising from use of the service; and
            that total liability for any direct damages is capped at the greater of the amount you
            paid Cairn in the twelve months before the claim or a nominal fixed sum. The specific
            cap, the carve-outs that cannot lawfully be excluded (such as for gross negligence,
            fraud, death or personal injury, and non-waivable consumer rights in the EU, UK and
            elsewhere), and the interaction with Section 7&apos;s dispute-resolution clause must be
            drafted or reviewed by a qualified lawyer for each target market. Generic SaaS
            boilerplate must not be relied on here given the analysis engine&apos;s regulatory
            profile.
          </p>
        </section>
        <section>
          <h2>11. Termination</h2>
          <p>
            You may delete your account and its data at any time from Settings → Export &amp;
            delete. Cairn may suspend or terminate an account that violates these terms - in
            particular Section 6 (unlawful, infringing, or market-manipulative content) - or where
            required by law. Where practical and not legally prohibited, Cairn will give notice
            before terminating an account that is not in serious breach, and you will be able to
            export your data first. Sections that by their nature should survive termination -
            including Sections 4, 6, 10, and 12 - continue to apply after your account ends.
          </p>
        </section>
        <section>
          <h2>12. Governing law and disputes</h2>
          <p>
            <strong>Draft clause - flagged for legal review; must not be relied on as written.</strong>{" "}
            The governing law, the courts or forum for disputes, and how this interacts with the
            binding-arbitration and class-waiver intent in Section 7 all depend on the
            jurisdiction(s) in which Cairn actually launches, which is not yet decided. Consumer
            protection law in many jurisdictions (including the EU and UK) gives users the right to
            bring claims in their country of residence under their local law regardless of what
            this section says; any governing-law clause has to be written around that. This section
            will be completed by counsel as part of the pre-launch legal review, together with the
            open items in the jurisdictional checklist.
          </p>
        </section>
        <section>
          <h2>13. Changes to these terms</h2>
          <p>
            Cairn may update these terms. For minor or clarifying changes, the updated version is
            posted here with a new &quot;last updated&quot; date. For material changes - especially
            anything affecting the scope or disclosures of the AI analysis engine, the billing
            terms, or the dispute-resolution and liability clauses - Cairn will give notice through
            the service or by email before the change takes effect, and such changes are flagged
            for legal re-review rather than treated as routine edits. Continuing to use Cairn after
            a change takes effect means you accept the updated terms; if you do not, you can delete
            your account as described in Section 11.
          </p>
        </section>
        <section>
          <h2>14. Contact</h2>
          <p>
            Questions about these terms, and legal or takedown notices under Section 6, go to the
            contact address published on the Privacy Policy page. A dedicated, monitored legal
            contact address will be published here before Cairn accepts paying users.
          </p>
        </section>
    </LegalShell>
  );
}
