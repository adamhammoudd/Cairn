import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata = { title: "Privacy Policy — Cairn" };

export default function PrivacyPage() {
  return (
    <div>
      <div>
        <Logo size={30} />
      </div>

      <div>
        <span>Draft — not legal advice.</span> This is a first-pass,
        non-lawyer draft. It has not been reviewed by a licensed attorney and is not launch-ready.
      </div>

      <h1>Privacy Policy</h1>

      <div>
        <section>
          <h2>What we collect</h2>
          <p>
            Account data (email, hashed password, display name), portfolio data (holdings,
            watchlists), settings, and chat history. We do not collect brokerage credentials or
            bank details — Cairn has no trade-execution feature.
          </p>
        </section>
        <section>
          <h2>How we use it</h2>
          <p>
            To provide the service, and to rank which stored market/sector/ticker analyses are
            relevant enough to surface in your daily briefing and chat — your holdings/watchlist
            are used for that ranking only, never sent to the AI model as instructions to produce
            advice about your specific position.
          </p>
        </section>
        <section>
          <h2>What we don&apos;t do</h2>
          <p>
            We do not sell personal data. Portfolio data is never included in the prompts used to
            generate market/sector/ticker analyses — that pipeline only ever receives a scope like
            &quot;AAPL&quot; or &quot;semiconductors,&quot; never a user identifier or position.
          </p>
        </section>
        <section>
          <h2>Third parties</h2>
          <p>
            Supabase (database, auth, storage) and configured news/market data providers. No
            third-party AI provider: the analysis engine and assistant run on a model hosted on our
            own infrastructure, so your chat messages are never sent to an external model service.
          </p>
        </section>
        <section>
          <h2>Your data, your control</h2>
          <p>Export your data or delete your account at any time from Settings.</p>
        </section>
      </div>

      <Link href="/login">
        ← Back to sign in
      </Link>
    </div>
  );
}
