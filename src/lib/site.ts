// Public-site identity shared by metadata, the sitemap and structured data.
//
// Everything that has to emit an ABSOLUTE url (canonical tags, og:image, the
// sitemap, JSON-LD) goes through getSiteUrl() so the base can only be wrong in
// one place.

export const SITE_NAME = "Cairn";

// Root <meta name="description"> - what every page without its own inherits.
export const SITE_DESCRIPTION =
  "Portfolio dashboard, market data, and AI research context. Not investment advice.";

// The /welcome description. Also the SoftwareApplication description in
// structured data: it is already the page's own product copy, kept in one
// place so the schema cannot drift into claiming something the page does not.
export const WELCOME_DESCRIPTION =
  "Cairn is a portfolio-aware research assistant that answers questions about tickers, sectors and markets with its sources, historical analogs and confidence. Informational only - no brokerage, no trade execution, and never a buy/hold/sell call.";

/**
 * Absolute origin of the public site, no trailing slash.
 *
 * Reads NEXT_PUBLIC_SITE_URL. Unset falls back to http://localhost:3000 in dev,
 * but is a hard error in a production build: a fallback there would silently
 * ship `localhost` into every canonical tag, the sitemap and the JSON-LD that
 * real users and crawlers see. Set the variable (Vercel project settings +
 * .env.local) to the production origin before building.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      throw new Error(
        `NEXT_PUBLIC_SITE_URL is not a valid absolute URL: "${raw}". Expected e.g. https://example.com`,
      );
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL is not set. A production build needs it: canonical tags, the sitemap, " +
        "the social share image and structured data all emit absolute URLs from it, and falling back " +
        "to localhost would ship those to real users. Set it to the site's public origin.",
    );
  }
  return "http://localhost:3000";
}

const orgId = (site: string) => `${site}/#organization`;

/** schema.org Organization - emitted from the root layout. */
export function organizationJsonLd(site = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": orgId(site),
    name: SITE_NAME,
    url: `${site}/`,
    logo: `${site}/cairn-mark.png`,
    description: SITE_DESCRIPTION,
  };
}

/**
 * schema.org SoftwareApplication - emitted from /welcome.
 *
 * Only what the page itself says. The Free plan (EUR 0, no card) is printed on
 * /welcome; Premium is "Billed monthly" there with no number, so it is not
 * offered here - structured data has to match visible content. No rating or
 * review fields: there are no ratings or reviews.
 */
export function softwareApplicationJsonLd(site = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: WELCOME_DESCRIPTION,
    url: `${site}/welcome`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    publisher: { "@id": orgId(site) },
    offers: {
      "@type": "Offer",
      name: "Free",
      description: "Free plan, no card required",
      price: "0",
      priceCurrency: "EUR",
    },
  };
}

/**
 * Is /legal-notice allowed to be served?
 *
 * The page still carries "TO BE COMPLETED" placeholders for the operator's
 * legal name, address, KBO/BCE and VAT numbers. Published, it would be a false
 * statement about who the consumer is contracting with, so it is a 404 on the
 * Vercel production deployment (VERCEL_ENV is unset locally, so it stays
 * viewable in dev and `next start`; previews show it too).
 *
 * TO GO LIVE: fill in every placeholder in src/app/legal-notice/page.tsx, then
 * delete this constant and each place that reads it (the page's notFound(), the
 * sitemap entry, the LegalShell footer link) and re-add the line in
 * public/llms.txt. Note the withdrawal instructions on /refunds and Terms
 * section 14 both point at this page.
 */
export const LEGAL_NOTICE_LIVE = process.env.VERCEL_ENV !== "production";
