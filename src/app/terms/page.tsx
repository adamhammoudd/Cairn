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
            You must be at least 18 years old and able to form a binding contract where you live.
            Account creation requires an email address and a password. You are responsible for
            keeping your password confidential and for activity that happens under your account.
            One person, one account - do not share credentials or let anyone else use your account.
          </p>
          <p>
            Cairn is offered to consumers in the European Economic Area and the United Kingdom. It
            is not offered where doing so would breach local financial-services law, and Cairn may
            decline or close an account on that basis.
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
          <h2>7. Complaints and dispute resolution</h2>
          <p>
            If something goes wrong, contact us first using the address in Section 14. Most problems
            are faster to fix directly than through any formal process, and we aim to acknowledge a
            complaint within five working days and to resolve it within thirty days.
          </p>
          <p>
            If we cannot resolve it between us, you can refer the dispute to the Belgian Consumer
            Mediation Service (Service de Médiation pour le Consommateur / Consumentenombudsdienst),
            which handles out-of-court settlement of consumer disputes with traders established in
            Belgium. Using mediation is voluntary and does not affect your right to go to court.
          </p>
          <p>
            <strong>There is no compulsory arbitration and no class-action waiver in these
            terms.</strong> That is deliberate. Clauses of that kind are treated as unfair, and are
            unenforceable, in consumer contracts across the EU, and including one would not give
            Cairn any protection it could actually rely on. Your right to bring a claim in court,
            individually or as part of a collective action brought by a qualified entity, is
            unaffected by these terms.
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
            <strong>Prices and VAT.</strong> Premium is €12.00 per month excluding VAT. VAT is
            calculated and added at checkout at the rate of the country you are buying from, and
            the total you will be charged is shown before you confirm. If you are a VAT-registered
            business you can enter your VAT number at checkout.
          </p>
          <p>
            <strong>Your 14-day right to cancel, and why it usually will not apply.</strong> As a
            consumer you normally have 14 days to withdraw from a distance contract for no reason.
            Because Premium is a digital service that starts immediately, we ask you at checkout to
            expressly request that it begin straight away and to acknowledge that doing so means you
            lose the 14-day withdrawal right once the service has been fully performed. If you do
            not give that consent, your access begins after the 14 days instead. If you withdraw
            within the 14 days having given that consent but before the period is over, you pay a
            proportionate amount for what you used and we refund the rest.
          </p>
          <p>
            <strong>Refunds after that.</strong> Outside the withdrawal right, monthly payments are
            not refundable pro rata when you cancel mid-month - cancelling stops the next renewal
            and you keep Premium until the end of the period you have already paid for. That is the
            ordinary position and it does not limit your statutory rights: if the service is faulty,
            not as described, or unavailable for a sustained period, you are entitled to a repair,
            a price reduction or a refund under EU digital-content law, and we will apply that in
            good faith. Ask us and we will look at it.
          </p>
          <p>
            <strong>Changing plan.</strong> If you upgrade or downgrade mid-period, Stripe prorates
            the difference automatically: you are credited for the unused part of the old plan and
            charged the prorated cost of the new one.
          </p>
          <p>
            <strong>Price changes.</strong> We will give you at least 30 days&apos; notice by email
            before any price increase takes effect. The new price applies from your next renewal
            after that notice, and you can cancel at any point before it takes effect and not pay
            it. We will not change the price of a period you have already paid for.
          </p>
        </section>
        <section>
          <h2>10. What Cairn does and does not promise</h2>
          <p>
            <strong>What the service is.</strong> Market and news data comes from third-party
            sources and may be delayed, incomplete, or wrong. Prices are generally daily closes, not
            a live feed. The AI analysis engine produces probability-weighted, market-level context
            computed from a historical sample that is sometimes small; it can be mistaken. It is not
            a recommendation, not personal advice, and not a substitute for a licensed professional.
            Every investment decision you make is yours.
          </p>
          <p>
            <strong>What we do promise.</strong> We will supply the service with reasonable care and
            skill, and it should match what is described on this site and in these terms. We do not
            exclude that. If it is faulty, not as described, or unavailable for a sustained period,
            you have statutory remedies and Section 9 explains how we apply them. Nothing in these
            terms removes or limits any right you have as a consumer that cannot lawfully be removed
            or limited - and if any part of this section conflicts with such a right, that right
            wins and the rest of this section still applies.
          </p>
          <p>
            <strong>What we are not liable for.</strong> Cairn is not liable for investment losses,
            lost profits, or trading decisions you make, whether or not Cairn&apos;s output informed
            them, because Cairn provides market-level information and does not advise on your
            position. Cairn is also not liable for loss caused by third-party data being delayed,
            wrong or unavailable, beyond our duty to describe the service accurately.
          </p>
          <p>
            <strong>Cap.</strong> Where Cairn is liable to you, and to the extent the law allows a
            cap, our total liability for all claims in any twelve-month period is limited to the
            greater of the amount you paid Cairn in that period or €100.
          </p>
          <p>
            <strong>What is never capped or excluded.</strong> Nothing in these terms limits or
            excludes liability for death or personal injury caused by negligence, for fraud or
            fraudulent misrepresentation, for gross negligence or wilful misconduct, or for anything
            else that cannot lawfully be limited or excluded.
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
          <h2>12. Governing law and where claims are heard</h2>
          <p>
            These terms are governed by Belgian law, and the courts of Belgium have jurisdiction.
          </p>
          <p>
            <strong>That does not take anything away from you as a consumer.</strong> If you live in
            another EEA country or the UK, you keep the protection of the mandatory consumer rules
            of the country where you habitually live, and choosing Belgian law here cannot deprive
            you of them. You may also bring proceedings against Cairn in the courts of your own
            country, and Cairn may bring proceedings against you only in the courts of the country
            where you live.
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
          <h2>14. Who you are contracting with, and how to reach us</h2>
          <p>
            These terms are between you and the operator of Cairn, whose full identity, registered
            address and enterprise number are set out on the <a href="/legal-notice">Legal notice</a>{" "}
            page.
          </p>
          <p>
            Questions about these terms, complaints under Section 7, billing queries under Section 9,
            and legal or takedown notices under Section 6 all go to the contact address on that page.
          </p>
        </section>
    </LegalShell>
  );
}
