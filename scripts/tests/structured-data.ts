// JSON-LD emitted by the public pages (src/lib/site.ts).
//
// Round-trips each block through JSON.parse, checks the fields Google's docs
// require for the type, and pins the types Cairn must never claim: it is
// informational software - not a business with premises, not a financial
// service, not an investment product (see the legal notice and every footer).
//
// Pure and DB-free. Run: npm run test:structured-data

import { getSiteUrl, organizationJsonLd, softwareApplicationJsonLd } from "@/lib/site";

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

// getSiteUrl(): which origin each kind of build gets. process.env is swapped
// per case and restored, so the order of cases does not matter.
function siteUrlWith(env: Record<string, string | undefined>): string {
  const keys = ["NEXT_PUBLIC_SITE_URL", "VERCEL_ENV", "VERCEL_URL", "NODE_ENV"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const vars = process.env as Record<string, string | undefined>;
  for (const k of keys) {
    if (env[k] === undefined) delete vars[k];
    else vars[k] = env[k];
  }
  try {
    return getSiteUrl();
  } catch {
    return "THROWS";
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete vars[k];
      else vars[k] = saved[k];
    }
  }
}
expect(siteUrlWith({ NEXT_PUBLIC_SITE_URL: "https://cairn.example/", NODE_ENV: "production" }) === "https://cairn.example", "site URL: the configured origin wins, trailing slash dropped");
expect(siteUrlWith({ NODE_ENV: "production" }) === "THROWS", "site URL: a production build with no origin set refuses to build");
expect(siteUrlWith({ NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_URL: "cairn-abc.vercel.app" }) === "https://cairn-abc.vercel.app", "site URL: a Vercel preview build uses its own deployment URL");
expect(siteUrlWith({ NODE_ENV: "production", VERCEL_ENV: "production", VERCEL_URL: "cairn-abc.vercel.app" }) === "THROWS", "site URL: a Vercel production build never falls back to the deployment URL");
expect(siteUrlWith({ NODE_ENV: "development" }) === "http://localhost:3000", "site URL: dev falls back to localhost");

console.log(`\n${failures.length === 0 ? "all" : "NOT all"} structured-data cases passed`);
process.exit(failures.length === 0 ? 0 : 1);
