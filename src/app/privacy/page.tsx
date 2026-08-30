import { LegalShell } from "@/components/legal-shell";

export const metadata = { title: "Privacy Policy - Cairn" };

export default function PrivacyPolicyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" updated="30 August 2026">
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
            alerts, briefings, goals and discussion posts are removed with it. This is verified by
            an automated test that deletes a user and asserts nothing is left behind.
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
        <section>
          <h2>Contact</h2>
          <p>
            A support and privacy contact address will be published here before Cairn accepts real
            users. Until then this is a pre-launch build.
          </p>
        </section>
    </LegalShell>
  );
}
