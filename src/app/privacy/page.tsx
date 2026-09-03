import { LegalShell } from "@/components/legal-shell";
import { PRIVACY_VERSION, legalDateDisplay } from "@/lib/legal-versions";

export const metadata = { title: "Privacy Policy - Cairn" };

export default function PrivacyPolicyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" updated={legalDateDisplay(PRIVACY_VERSION)}>
<section>
          <h2>What we collect</h2>
          <p>
            Account data (email, hashed password, display name), portfolio data (holdings,
            watchlists), settings, and chat history. We do not collect brokerage credentials or
            bank details - Cairn has no trade-execution feature.
          </p>
        </section>
        {/*
          Waitlist clause added for the pre-launch waitlist page (/waitlist),
          which collects an email before any account exists. Non-lawyer first
          draft - covered by the page-level "Draft - not legal advice" banner
          and needs cfo-legal-advisor / counsel review before launch.
        */}
        <section id="waitlist">
          <h2>Pre-launch waitlist</h2>
          <p>
            If you join the waitlist on our pre-launch page, we collect your email address, and we
            record the IP address, browser user-agent string, and timezone of the signup. The email
            address is used to send you one confirmation link, to notify you when access opens, and
            to administer the founding-member offer. The IP, user-agent, and timezone are used only
            for basic anti-abuse (rate limiting and a manual review of the founding-member list) and
            are not used to build a profile or track you across sites.
          </p>
          <p>
            Waitlist entries are stored in our database (Supabase) and are not shared with anyone
            else. You can ask us to remove your waitlist entry at any time via the contact address
            below; if you never confirm your email, the entry stays unconfirmed and grants nothing.
          </p>
        </section>
        <section>
          <h2>How we use it</h2>
          <p>
            To provide the service, and to rank which stored market/sector/ticker analyses are
            relevant enough to surface in your daily briefing and chat - your holdings/watchlist
            are used for that ranking only, never sent to the AI model as instructions to produce
            advice about your specific position.
          </p>
        </section>
        <section>
          <h2>What we don&apos;t do</h2>
          <p>
            We do not sell personal data. Portfolio data is never included in the prompts used to
            generate market/sector/ticker analyses - that pipeline only ever receives a scope like
            &quot;AAPL&quot; or &quot;semiconductors,&quot; never a user identifier or position.
          </p>
        </section>
        <section>
          <h2>Third parties</h2>
          <p>
            Supabase (database, auth, storage), configured news/market data providers, and Groq -
            a third-party hosted AI model provider. The analysis engine and the assistant are not
            self-hosted: they call Groq over its API, which means the text of your chat messages,
            prior turns in the same session, and the ticker/sector scope used to generate an
            analysis are transmitted to Groq for processing. Groq acts as a processor on Cairn&apos;s
            instructions; Cairn does not send Groq a user identifier, account, email, or position
            size, and does not use your data to train any model.
          </p>
        </section>
        <section>
          <h2>Your data, your control</h2>
          <p>Export your data or delete your account at any time from Settings.</p>
        </section>
        <section id="lawful-basis">
          <h2>Why we are allowed to process your data (lawful basis)</h2>
          <p>
            <strong>Non-lawyer draft - the specific bases below need confirmation by counsel.</strong>{" "}
            For users in the UK and EU, the working position is that Cairn processes account data,
            portfolio data, settings and chat history because it is <em>necessary to perform the
            contract</em> you enter into when you create an account (UK GDPR / GDPR Article 6(1)(b)).
            Anti-abuse handling of waitlist signups (IP, user-agent, timezone) relies on Cairn&apos;s{" "}
            <em>legitimate interest</em> in preventing abuse of the founding-member offer (Article
            6(1)(f)). Cairn does not rely on consent for any core feature and sets no
            consent-requiring cookies, so there is no consent to withdraw for those.
          </p>
        </section>
        <section id="retention">
          <h2>How long we keep it</h2>
          <p>
            Account, portfolio, settings and chat data are kept for as long as your account exists.
            When you delete your account, that data is removed immediately by a cascading delete -
            it is not retained on a timer afterwards. The cascade is designed so that removing the
            account removes everything linked to it; that design is checked by an automated test in
            our build pipeline (see the deletion section below), not re-verified on each individual
            deletion.
          </p>
          <ul>
            <li>Unconfirmed waitlist entries: removed on request, and in any case not carried past
              launch.</li>
            <li>Alert delivery history and daily briefings: kept while the account exists, deleted
              with it.</li>
            <li>The AI scope-guard log (which can contain the text of a rejected AI generation) is
              purged automatically after <strong>90 days</strong> by a scheduled job. It has no
              account identifier, so it is not tied to you specifically; the time limit is what
              bounds how long that text is kept. The 90-day figure is still subject to legal
              review.</li>
            <li>Authentication-attempt logs: kept only as long as needed for rate-limiting and
              abuse detection.</li>
            <li>Backups: Supabase&apos;s managed backups may retain a copy for a short rolling
              window after deletion before they roll off. <strong>The exact window needs to be
              confirmed and stated here.</strong></li>
          </ul>
        </section>
        <section id="gdpr-rights">
          <h2>Your rights (UK / EU GDPR)</h2>
          <p>
            If you are in the UK or EU you have the right to: <strong>access</strong> the personal
            data Cairn holds about you; have inaccurate data <strong>rectified</strong>;{" "}
            <strong>erase</strong> your data (&quot;right to be forgotten&quot;);{" "}
            <strong>restrict</strong> processing; <strong>object</strong> to processing carried out
            on a legitimate-interest basis; and receive your data in a portable, machine-readable
            format (<strong>data portability</strong>). Settings → Export &amp; delete covers
            access, portability and erasure directly; for rectification, restriction or objection,
            or for any request you would rather make in writing, use the contact address below.
          </p>
          <p>
            You also have the right to <strong>lodge a complaint with a data protection
            supervisory authority</strong> - in the UK, the Information Commissioner&apos;s Office
            (ico.org.uk); in the EU, the authority in your country of residence. We would ask that
            you contact us first so we can try to resolve it, but that is your right regardless.
          </p>
          <p>
            <strong>Non-lawyer draft:</strong> whether Cairn needs an EU or UK representative
            (GDPR Article 27) or a Data Protection Officer given the analysis engine is an open
            question flagged for counsel.
          </p>
        </section>
        <section id="ccpa">
          <h2>California privacy rights (CCPA / CPRA)</h2>
          <p>
            If you are a California resident you have the right to know what personal information
            Cairn has collected about you, to request its deletion, and to request correction of
            inaccurate information. Settings → Export &amp; delete covers these; you can also use
            the contact address below.
          </p>
          <p>
            <strong>Do Not Sell or Share My Personal Information.</strong> Cairn does not sell your
            personal information, and does not share it for cross-context behavioural advertising,
            as those terms are used in the CCPA/CPRA. Cairn runs no advertising, analytics or
            attribution pipeline, so there is nothing to opt out of - but if that ever changes, a
            working opt-out mechanism will be added here before any such processing begins. Cairn
            will not deny you service, charge a different price, or give you a lower quality of
            service for exercising any of these rights.
          </p>
        </section>
        <section id="transfers">
          <h2>International data transfers</h2>
          <p>
            Cairn&apos;s database, authentication and storage run on Supabase in the{" "}
            <strong>EU (eu-west-1, Ireland)</strong> region, so account, portfolio, settings and
            chat data is stored in the EU.
          </p>
          <p>
            Chat message text and the ticker/sector scope of an analysis request are sent to{" "}
            <strong>Groq (a US company)</strong> for model inference (see &quot;Third parties&quot;
            above). For UK/EU users this is a transfer outside the UK/EEA.{" "}
            <strong>Non-lawyer draft - open for counsel:</strong> the transfer mechanism (Standard
            Contractual Clauses, the EU-US Data Privacy Framework, or a UK Addendum), Groq&apos;s
            actual processing locations, and whether a transfer impact assessment is required have
            not been confirmed. Until they are, no assurance about Groq&apos;s handling of that
            text is made here beyond what is stated above.
          </p>
          <p>
            Per Groq&apos;s published terms, Groq does not retain inference inputs or outputs by
            default and does not use them to train models; short-lived operational logs age out
            within about 30 days. Because there is no per-record deletion interface, deleting your
            Cairn account does not send a deletion request to Groq - it relies on that
            non-retention. Enabling Groq&apos;s account-level &quot;Zero Data Retention&quot; is a
            pending administrative step.
          </p>
        </section>
        <section id="deletion">
          <h2>Data retention and deletion</h2>
          <p>
            You can export your data as JSON and delete your account at any time from Settings.
            The export includes your profile, settings, holdings, watchlists and their items, chat
            sessions and messages, alerts and their delivery history, saved screens, daily
            briefings, goals, subscription record, and any discussion posts.
          </p>
          <p>
            Deleting your account removes the account itself; every table holding your data is
            linked to it with a cascading foreign key, so holdings, watchlists, chat history,
            alerts, briefings, goals and discussion posts are removed with it. An automated test in
            our build pipeline exercises this: it creates a user across every one of those tables,
            deletes the user, and asserts nothing is left behind, and it also checks that every
            table with a user identifier carries the cascade. That test proves the deletion logic
            is correct; it runs in CI, not against your specific account when you delete it.
          </p>
        </section>
        <section id="ai-disclosure">
          <h2>How the AI assistant handles your data</h2>
          <p>
            <strong>Cairn uses artificial intelligence to generate analysis and chat content.</strong>{" "}
            The research write-ups, the methodology explanations, and every assistant reply are
            produced by a language model. They are not written or reviewed by a human before you
            see them, and they can be wrong.
          </p>
          <p>
            Chat messages are transmitted to a third-party hosted model provider (Groq) for
            processing - they are not processed on Cairn&apos;s own infrastructure. Cairn does not
            use them to train any model. What Groq retains or logs is governed by Groq&apos;s own
            terms, which counsel has not yet reviewed.
          </p>
          <p>
            Probability ranges, confidence levels, and sample sizes are computed statistically in
            code - a Wilson score interval over historical analogs - not generated by the model.
            The model writes only the plain-language explanation of figures the code has already
            computed.
          </p>
          <p>
            Your portfolio and watchlist symbols are read server-side to decide which stored
            analyses are relevant to you. They are not included in the text sent to the model
            beyond the ticker or sector being discussed, and the assistant never advises on your
            personal positions.
          </p>
        </section>
        <section id="cookies">
          <h2>Cookies</h2>
          <p>
            Authentication session cookies only. Cairn runs no analytics, advertising, or tracking
            cookies of any kind, and loads no third-party tracking scripts - so there is nothing to
            consent to beyond the cookies strictly necessary to keep you signed in.
          </p>
        </section>
        <section>
          <h2>Children&apos;s privacy</h2>
          <p>
            Cairn is not intended for anyone under 18. The specific age restriction is pending
            confirmation by counsel given the financial-data handling involved.
          </p>
        </section>
        <section>
          <h2>Changes to this policy</h2>
          <p>
            Material changes - especially to how the AI assistant handles your data - are flagged
            for legal re-review rather than being treated as routine edits.
          </p>
        </section>
        <section id="contact">
          <h2>Contact</h2>
          <p>
            This is the single contact point for privacy questions, data-rights requests
            (access, rectification, erasure, restriction, objection, portability), CCPA requests,
            security reports, accessibility problems, and legal or takedown notices under the Terms
            of Service. The Terms page and the Accessibility statement both point here.
          </p>
          <p>
            <strong>A monitored contact address has not been published yet.</strong> It is blocked
            on the domain decision (the intended address is <code>privacy@</code> and{" "}
            <code>support@</code> on Cairn&apos;s own domain, once that is registered) and is a
            hard requirement before Cairn accepts real users - several of the rights described on
            this page have no route to us without it. Until it is published, this remains a
            pre-launch build with no real users.
          </p>
        </section>
    </LegalShell>
  );
}
