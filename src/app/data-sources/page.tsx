import { LegalShell } from "@/components/legal-shell";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Data sources - Cairn",
  description:
    "Where every number, headline and filing in Cairn comes from, what each source is used for, and the credit each one is given.",
  alternates: { canonical: "/data-sources" },
};

// One list of every outside source Cairn reads, with the credit it carries.
// Written from the code (what the ingest jobs and the app actually call), not
// from memory of what a source permits: nothing here claims a licence Cairn has
// not been given. Where the terms of a source have not been checked, the page
// says so - that is counsel's and the founder's to settle, not this page's.
// Keep it in step with supabase/functions/*, src/lib/market-data/* and
// supabase/seed/providers.sql (audit 2026-10-02, item 3.6).
export default function DataSourcesPage() {
  return (
    <LegalShell eyebrow="Legal" title="Data sources" updated="2 October 2026">
      <section>
        <h2>The short version</h2>
        <p>
          Cairn does not produce market data. It reads it from the sources below, shows the date
          each figure is as of, and credits the source. Prices are delayed quotes and daily
          closes, not a real-time feed. If a source here is wrong about something, so is Cairn -
          tell us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>

      <section>
        <h2>Prices and charts</h2>
        <ul>
          <li>
            <strong>Yahoo Finance chart data</strong> - daily prices for shares, funds, indices and
            currency pairs, and the one-day and one-week intraday charts. Credit shown: &quot;Yahoo
            Finance chart data&quot;. Cairn reads this through a public, undocumented endpoint, not
            a licensed data feed. Cairn is not affiliated with Yahoo. The terms for using this
            data in a paid product have not yet been confirmed (see the open items below).
          </li>
          <li>
            <strong>CoinGecko</strong> - coin prices, market caps and rankings. Credit shown:
            &quot;CoinGecko&quot;. Crypto figures are CoinGecko&apos;s rolling 24-hour numbers.
          </li>
        </ul>
      </section>

      <section>
        <h2>Company financials and filings</h2>
        <ul>
          <li>
            <strong>U.S. Securities and Exchange Commission - EDGAR</strong> (sec.gov) - revenue,
            profit, cash flow, debt, share counts, the business descriptions and the 10-K and 10-Q
            filings behind them. Credit shown: &quot;SEC EDGAR&quot;, with a link to the filing
            where there is one. These are public filings.
          </li>
          <li>
            <strong>Nasdaq</strong> (api.nasdaq.com) - the earnings, dividend and split calendars
            and past earnings results. Credit shown: &quot;Nasdaq&quot;. Like the Yahoo data, this
            is a public endpoint rather than a licensed feed, and its terms have not yet been
            confirmed.
          </li>
        </ul>
      </section>

      <section>
        <h2>Exchange rates</h2>
        <ul>
          <li>
            <strong>European Central Bank</strong> - the euro foreign exchange reference rates,
            used to convert your own money into the currency you pick in Settings. The rate and its
            date are shown wherever a converted figure is. Credit shown: &quot;European Central Bank&quot;. The ECB
            publishes these once a working day, so a weekend uses Friday&apos;s rate.
          </li>
        </ul>
      </section>

      <section>
        <h2>News</h2>
        <ul>
          <li>
            <strong>Headlines from news feeds</strong> - the feeds Cairn is set up to read are
            MarketWatch top stories (Dow Jones), Yahoo Finance news, and the U.S. Federal Reserve
            press releases. Cairn shows the headline, the publisher&apos;s name and a link to the
            original; it does not republish the articles. The live list is whatever is switched on
            in the admin settings.
          </li>
        </ul>
      </section>

      <section>
        <h2>The assistant</h2>
        <ul>
          <li>
            <strong>Groq</strong> - the language model that writes the plain-language explanation
            of figures Cairn has already computed. See the <a href="/privacy">Privacy Policy</a>.
          </li>
          <li>
            <strong>Brave Search</strong> (or Groq&apos;s own search, when that is chosen instead) -
            only when web search is switched on and the question needs something recent. An answer
            that used it says &quot;Searched the web&quot;, and any page it cites is listed with
            its link.
          </li>
        </ul>
      </section>

      <section>
        <h2>What is not real data</h2>
        <ul>
          <li>
            <strong>ESG scores</strong> shown for a few companies are illustrative samples entered
            by hand. They are labelled that way where they appear and are not from an ESG rating
            provider.
          </li>
        </ul>
      </section>

      <section>
        <h2>Open items</h2>
        <p>
          Two sources above - the Yahoo Finance chart endpoint and the Nasdaq calendar endpoint -
          are public endpoints that Cairn reads without a licence agreement. Their terms for use
          in a paid product have not been confirmed. This page will be updated when they have.
        </p>
      </section>
    </LegalShell>
  );
}
