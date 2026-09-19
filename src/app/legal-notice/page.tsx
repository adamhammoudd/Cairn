import { LegalShell } from "@/components/legal-shell";

export const metadata = { title: "Legal notice - Cairn" };

// Trader identification page (imprint / mentions légales).
//
// This is not optional and it is not boilerplate. Articles 5 and 6 of the
// e-Commerce Directive (2000/31/EC), implemented in Belgium in Book XII of the
// Code of Economic Law, require an online service provider to make its
// identity, geographic address and contact details "easily, directly and
// permanently accessible". Book VI adds the pre-contractual information duties
// for distance selling to consumers. A site taking €12/month from EU consumers
// with no identifiable trader behind it is in breach before any other question
// is reached.
//
// EVERY VALUE MARKED "TO BE COMPLETED" BELOW MUST BE FILLED IN WITH REAL
// DETAILS BEFORE THIS PAGE GOES LIVE. A legal notice carrying placeholder or
// invented identity details is worse than no page at all: it is a false
// statement about who the consumer is contracting with.
export default function LegalNoticePage() {
  return (
    <LegalShell eyebrow="Legal" title="Legal notice" updated="19 September 2026">
      <section>
        <h2>Who operates this service</h2>
        <p>
          Cairn is operated by <strong>[TO BE COMPLETED - full legal name: your own name if you
          are trading as a sole trader, or the company&apos;s registered name]</strong>.
        </p>
        <ul>
          <li>
            <strong>Legal form:</strong> [TO BE COMPLETED - e.g. sole trader (personne physique /
            natuurlijke persoon), or SRL/BV, SA/NV]
          </li>
          <li>
            <strong>Registered address:</strong> [TO BE COMPLETED - a real geographic address. A
            PO box is not sufficient.]
          </li>
          <li>
            <strong>Enterprise number (KBO/BCE):</strong> [TO BE COMPLETED - the Belgian enterprise
            number, format 0xxx.xxx.xxx]
          </li>
          <li>
            <strong>VAT number:</strong> [TO BE COMPLETED - BE0xxx.xxx.xxx, or state &quot;not VAT
            registered&quot; if that is accurate and lawful for your turnover]
          </li>
          <li>
            <strong>Email:</strong> [TO BE COMPLETED - a monitored address on your own domain]
          </li>
        </ul>
      </section>

      <section>
        <h2>Supervisory authorities</h2>
        <p>
          Cairn is an information service. It is <strong>not</strong> a broker, not a
          portfolio-management service, and not a provider of investment advice, and it is
          therefore not authorised by the Financial Services and Markets Authority (FSMA). Cairn
          does not hold client assets or money and does not execute orders.
        </p>
        <p>
          For data protection matters, the competent supervisory authority is the Belgian Data
          Protection Authority (Autorité de protection des données / Gegevensbeschermingsautoriteit),
          Rue de la Presse 35, 1000 Brussels. You may also complain to the authority in your own
          country of residence.
        </p>
      </section>

      <section>
        <h2>Consumer disputes</h2>
        <p>
          If you have a complaint, contact us first at the address above. If we cannot resolve it,
          you may refer the matter to the Belgian Consumer Mediation Service (Service de Médiation
          pour le Consommateur / Consumentenombudsdienst), Boulevard du Roi Albert II 8, 1000
          Brussels. Mediation is voluntary and does not affect your right to go to court.
        </p>
      </section>

      <section>
        <h2>Hosting and infrastructure</h2>
        <p>
          The application is hosted by Vercel Inc., with server functions configured to run in the
          EU (Dublin) region. The database, authentication and file storage run on Supabase in the
          EU (eu-west-1, Ireland) region. See the <a href="/privacy">Privacy Policy</a> for the
          complete list of processors and what each one receives.
        </p>
      </section>

      <section>
        <h2>Content and intellectual property</h2>
        <p>
          The Cairn name, the interface, and the text on this site belong to the operator named
          above. Market data, news headlines and filings displayed in the service belong to their
          respective sources and are shown with attribution. Content you enter - your holdings,
          watchlists, chat messages and posts - remains yours, as set out in the{" "}
          <a href="/terms">Terms of Service</a>.
        </p>
        <p>
          To report content you believe infringes your rights, write to the address above with the
          content, where it appears, and the basis of your complaint.
        </p>
      </section>
    </LegalShell>
  );
}
