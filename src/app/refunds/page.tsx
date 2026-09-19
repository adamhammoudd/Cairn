import { LegalShell } from "@/components/legal-shell";

export const metadata = { title: "Cancellation and refunds - Cairn" };

// Standalone cancellation and refund page.
//
// The substance is also in Terms section 9, deliberately. EU distance-selling
// rules require the withdrawal right and the cancellation terms to be given
// clearly and before the consumer is bound, not buried in a numbered clause
// most people never open - and Stripe's own rules expect a reachable refund
// policy. Keeping one plain-language page and keeping it consistent with
// section 9 is the point; if one changes, change both.
export default function RefundsPage() {
  return (
    <LegalShell eyebrow="Legal" title="Cancellation and refunds" updated="19 September 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Cancel whenever you like, from Settings or the Stripe portal. You keep Premium until the
          end of the period you have already paid for, and you are not charged again. We do not
          refund the unused part of a month you have already started, except in the cases below -
          and if something is actually wrong with the service, ask us, because your statutory
          rights are not affected by any of this.
        </p>
      </section>

      <section>
        <h2>How to cancel</h2>
        <p>
          Go to Settings, then Billing, and cancel there - or open the Stripe customer portal from
          the same page. Cancellation takes effect at the end of the current billing period. No
          notice period, no cancellation fee, no email required.
        </p>
        <p>
          Cancelling Premium does not delete your account or your data. If you want the account
          removed entirely, use Settings, then Export &amp; delete.
        </p>
      </section>

      <section>
        <h2>Your 14-day right of withdrawal</h2>
        <p>
          As a consumer buying at a distance you normally have 14 days to withdraw from the
          contract without giving a reason.
        </p>
        <p>
          Premium is a digital service that begins as soon as you subscribe. So at checkout we ask
          you to expressly request that it start immediately and to confirm that you understand you
          lose the withdrawal right once the service has been fully performed. This is a real
          choice: if you do not give that consent, your subscription simply starts after the 14
          days have passed.
        </p>
        <p>
          If you gave that consent and then withdraw within the 14 days, you pay only for the
          portion you actually had access to, and we refund the rest.
        </p>
        <p>
          To withdraw, email us at the address on the <a href="/legal-notice">Legal notice</a> page.
          Any clear statement is enough - you do not have to use a particular form of words.
        </p>
      </section>

      <section>
        <h2>Refunds outside the withdrawal period</h2>
        <p>
          Monthly payments are not refunded pro rata when you cancel part-way through a month. You
          keep access until the period ends.
        </p>
        <p>
          That is the default, not a waiver of your rights. Under EU law on digital content and
          services, if the service is faulty, not as described, or unavailable for a sustained
          period, you are entitled to have it put right, or to a price reduction or a refund.
          Cairn applies that in good faith. Situations where we will refund include:
        </p>
        <ul>
          <li>A sustained outage that meaningfully deprived you of the service you paid for.</li>
          <li>
            A charge that was duplicated, or taken after you cancelled, or otherwise taken in error.
          </li>
          <li>
            Premium features that did not work as described for a significant part of the period.
          </li>
          <li>
            A subscription you did not intend to start, if you tell us promptly and have not made
            substantial use of it.
          </li>
        </ul>
        <p>
          Email us with your account address and roughly what happened. We aim to acknowledge within
          five working days and to resolve within thirty. Approved refunds go back to the original
          payment method through Stripe, normally within five to ten working days depending on your
          bank.
        </p>
      </section>

      <section>
        <h2>Failed payments</h2>
        <p>
          If a renewal payment fails, Stripe retries it over a short period. If it still does not go
          through, the account moves to the free tier. It is a downgrade, not a deletion - your
          holdings, watchlists and history stay where they are, and resubscribing restores Premium
          access to them.
        </p>
      </section>

      <section>
        <h2>Changing plan</h2>
        <p>
          Upgrades and downgrades mid-period are prorated automatically: you are credited for the
          unused part of the old plan and charged the prorated cost of the new one.
        </p>
      </section>

      <section>
        <h2>Price changes</h2>
        <p>
          We give at least 30 days&apos; notice by email before any price increase. It applies from
          your next renewal after that notice, and you can cancel before it takes effect and never
          pay it. The price of a period you have already paid for does not change.
        </p>
      </section>

      <section>
        <h2>If you are still not happy</h2>
        <p>
          Section 7 of the <a href="/terms">Terms of Service</a> explains the complaints route,
          including referral to the Belgian Consumer Mediation Service and your right to go to court
          in your own country.
        </p>
      </section>
    </LegalShell>
  );
}
