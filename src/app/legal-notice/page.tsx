import { notFound } from "next/navigation";
import { LegalShell } from "@/components/legal-shell";
import { readOperatorIdentity } from "@/lib/operator";

export const metadata = {
  title: "Legal notice - Cairn",
  description:
    "Who operates Cairn, the supervisory authorities, how to raise a consumer dispute, and where the service is hosted.",
  alternates: { canonical: "/legal-notice" },
};

// Trader identification page (imprint / mentions légales).
//
// This is not optional and it is not boilerplate. Articles 5 and 6 of the
// e-Commerce Directive (2000/31/EC), implemented in Belgium in Book XII of the
// Code of Economic Law, require an online service provider to make its
// identity, geographic address and contact details "easily, directly and
// permanently accessible". Book VI adds the pre-contractual information duties
// for distance selling to consumers.
//
// The identity is read from the environment (lib/operator.ts), never written
// here. The page is served only when ALL of the operator's name, address,
// enterprise number and contact are set; until then it is a 404 and is not
// linked or in the sitemap. A legal notice carrying placeholder or invented
// identity details is worse than no page: it is a false statement about who
// the consumer is contracting with.
export default function LegalNoticePage() {
  const operator = readOperatorIdentity();
  if (!operator) notFound();

  return (
    <LegalShell eyebrow="Legal" title="Legal notice" updated="2 October 2026">
      <section>
        <h2>Who operates this service</h2>
        <p>
          Cairn is operated by <strong>{operator.name}</strong>.
        </p>
        <ul>
          {operator.legalForm ? (
            <li>
              <strong>Legal form:</strong> {operator.legalForm}
            </li>
          ) : null}
          <li>
            <strong>Registered address:</strong> {operator.address}
          </li>
          <li>
            <strong>Enterprise number (KBO/BCE):</strong> {operator.enterpriseNumber}
          </li>
          {operator.vatNumber ? (
            <li>
              <strong>VAT:</strong> {operator.vatNumber}
            </li>
          ) : null}
          <li>
            <strong>Email:</strong> <a href={`mailto:${operator.contactEmail}`}>{operator.contactEmail}</a>
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
