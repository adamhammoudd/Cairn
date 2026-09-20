// JSON-LD emitted by the public pages (src/lib/site.ts).
//
// Round-trips each block through JSON.parse, checks the fields Google's docs
// require for the type, and pins the types Cairn must never claim: it is
// informational software - not a business with premises, not a financial
// service, not an investment product (see the legal notice and every footer).
//
// Pure and DB-free. Run: npm run test:structured-data

import { organizationJsonLd, softwareApplicationJsonLd } from "@/lib/site";

const SITE = "https://example.test";
const FORBIDDEN_TYPES = [
  "LocalBusiness",
  "FinancialService",
  "InvestmentOrDeposit",
  "InvestmentFund",
  "BankOrCreditUnion",
  "AutomatedTeller",
  "Review",
  "AggregateRating",
];

function typesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => typesIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "@type") out.push(...[v].flat().map(String));
      else typesIn(v, out);
    }
  }
  return out;
}

const failures: string[] = [];
const expect = (ok: boolean, msg: string) => {
  console.log(`${ok ? "pass " : "FAIL "} ${msg}`);
  if (!ok) failures.push(msg);
};

const org = JSON.parse(JSON.stringify(organizationJsonLd(SITE)));
const app = JSON.parse(JSON.stringify(softwareApplicationJsonLd(SITE)));

expect(org["@type"] === "Organization", "Organization has @type Organization");
expect(!!org.name && org.url === `${SITE}/` && org.logo === `${SITE}/cairn-mark.png`, "Organization has name, url, logo built from the site base");
expect(org["@id"] === app.publisher?.["@id"], "SoftwareApplication.publisher points at the Organization @id");
expect(app["@type"] === "SoftwareApplication", "SoftwareApplication has @type SoftwareApplication");
expect(!!app.name && !!app.description && app.url === `${SITE}/welcome`, "SoftwareApplication has name, description, url");
expect(!!app.applicationCategory && !!app.operatingSystem, "SoftwareApplication has applicationCategory and operatingSystem");
expect(app.offers?.["@type"] === "Offer" && app.offers.price === "0" && app.offers.priceCurrency === "EUR", "SoftwareApplication offer is the Free plan (EUR 0)");
expect(!("aggregateRating" in app) && !("review" in app), "no invented rating or review");
for (const [label, doc] of [["Organization", org], ["SoftwareApplication", app]] as const) {
  const bad = typesIn(doc).filter((t) => FORBIDDEN_TYPES.includes(t));
  expect(bad.length === 0, `${label} uses no forbidden schema.org types${bad.length ? ` (found ${bad.join(", ")})` : ""}`);
}

console.log(`\n${failures.length === 0 ? "all" : "NOT all"} structured-data cases passed`);
process.exit(failures.length === 0 ? 0 : 1);
