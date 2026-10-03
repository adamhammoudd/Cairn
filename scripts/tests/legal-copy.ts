// Audit 2026-10-02 items 3.3 (typo only), 3.5 (Brave + "Searched the web"),
// 3.6 (data sources page), 3.7 (hCaptcha), 3.8 (terms prices), 3.9 (withdrawal
// form), 3.10 (waitlist removal line), and 3.1's "do not touch the policy text
// until the founder chooses". Source-level: the pages are server components and
// the repo's component renderer cannot run under run-all's react-server condition
// (see item 4.1), so the copy is read from the source.
//
// Everything here is a first-draft statement of what the CODE does; each page
// stays "Pending legal review", and the PR lists all of it for counsel.
//
// Run: npx tsx --conditions=react-server scripts/tests/legal-copy.ts

import fs from "node:fs";
import path from "node:path";
import { webSearchLine } from "../../src/lib/ai/assistant/web-line";
import { withdrawalFormText } from "../../src/components/withdrawal-form";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const text = (p: string) => read(p).replace(/\{" "\}/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

export function runLegalCopySuite(): SuiteResult {
  const { check, result } = makeSuite("Legal pages: disclosures match the code (drafts for counsel)");
  const privacy = text("src/app/privacy/page.tsx");
  const terms = text("src/app/terms/page.tsx");
  const refunds = text("src/app/refunds/page.tsx");

  // 3.3 typo: JSX drops the space where a line break sits before an element.
  const hazard = /[A-Za-z0-9,;:]\n\s+<(?:em|strong|a|code|i|b)[ >]/;
  for (const f of ["privacy", "terms", "refunds", "accessibility", "legal-notice", "data-sources"]) {
    check(`${f}: no word runs into an inline element across a line break ("datafrom")`, !hazard.test(read(`src/app/${f}/page.tsx`)));
  }
  check("privacy: 'data from' now has its space", /Cairn fetches data from these/.test(privacy));

  // 3.1: policy statement about portfolio data untouched until the founder chooses.
  check("privacy: the portfolio-figures statement is untouched (waits for the founder's choice)", /Position sizes, quantities and values are never sent/.test(privacy) && /Cairn does not send Groq a user identifier, account, email, or position size/.test(privacy));

  // 3.5
  check("privacy: Brave Search is listed as a processor with what it receives", /Brave Search\s*\(Brave Software, Inc\.\)/.test(privacy) && /search words it writes \(up to 200 characters/.test(privacy) && /Searched the web/.test(privacy));
  check("privacy: says nothing else about the user is sent to the search provider", /no account, email or portfolio data/.test(privacy));
  const one = webSearchLine({ usage: { calls: 1, promptTokens: 0, completionTokens: 0, webSearches: 1 }, webProvider: "brave" });
  const two = webSearchLine({ usage: { calls: 1, promptTokens: 0, completionTokens: 0, webSearches: 2 }, webProvider: "groq" });
  check("the answer line names the provider when a search ran", one === "Searched the web for this answer. The search words were sent to Brave Search." && !!two && two.includes("2 times") && two.includes("Groq"), `${one} | ${two}`);
  check("no line when no search ran (cannot claim one that did not happen)", webSearchLine({ usage: { calls: 1, promptTokens: 0, completionTokens: 0, webSearches: 0 }, webProvider: null }) === null);
  check("a search with an unknown provider still says so", /a web search provider/.test(webSearchLine({ usage: { calls: 1, promptTokens: 0, completionTokens: 0, webSearches: 1 }, webProvider: null }) ?? ""));
  check("the line is rendered under every answer that has meta", /<WebSearchLine meta=\{meta\} \/>/.test(read("src/components/chat/chat-message.tsx")));
  check("the model's meta records the provider that received the search", /webProvider: usage\.webSearches > 0/.test(read("src/lib/ai/assistant/agent.ts")));

  // 3.6
  const ds = text("src/app/data-sources/page.tsx");
  for (const [name, re] of [["SEC EDGAR", /SEC EDGAR/], ["ECB", /European Central Bank/], ["Yahoo", /Yahoo Finance chart data/], ["CoinGecko", /CoinGecko/], ["Nasdaq", /Nasdaq/], ["news feeds", /MarketWatch[\s\S]*Federal Reserve/], ["Brave", /Brave Search/], ["Groq", /Groq/]] as const) {
    check(`data sources lists ${name}`, re.test(ds));
  }
  check("the page says Yahoo and Nasdaq terms are unconfirmed (no licence claimed)", /terms for use\s+in a paid product have not been confirmed/.test(ds) && !/licen[cs]ed to/i.test(ds));
  check("the page says ESG scores are illustrative samples", /ESG scores[\s\S]*illustrative samples/.test(ds));
  check("data sources is public, in the sitemap, and linked from both footers", /"\/data-sources"/.test(read("src/lib/public-paths.ts")) && /"\/data-sources"/.test(read("src/app/sitemap.ts")) && /href="\/data-sources"/.test(read("src/components/front-door/footer.tsx")) && /href="\/data-sources"/.test(read("src/components/legal-shell.tsx")));

  // 3.7
  check("privacy: hCaptcha entry says what loads (js.hcaptcha.com), when, and that Cairn gets a token", /loads from js\.hcaptcha\.com as soon as one of those forms opens/.test(privacy) && /receives only a pass\/fail token/.test(privacy));
  check("the script URL the policy names is the one the code loads", /https:\/\/js\.hcaptcha\.com\/1\/api\.js/.test(read("src/components/auth/captcha.tsx")));

  // 3.8
  check("terms 10: prices are delayed quotes and daily closes, not 'generally daily closes, not a live feed'", /Prices are delayed quotes and daily closes, not a real-time feed/.test(terms) && !/generally daily closes/.test(terms));

  // 3.9
  const form = withdrawalFormText();
  check("the withdrawal form is a copy-paste block with the blanks a consumer fills in", /^To: /m.test(form) && /withdraw from my contract/.test(form) && /Name: /.test(form) && /Date: /.test(form) && /Email address of my Cairn account: /.test(form));
  check("the form invents no operator details (addresses the published contact until the identity is set)", process.env.OPERATOR_NAME ? true : /^To: cairnai\.business@gmail\.com$/m.test(form), form.split("\n")[0]);
  check("refunds page carries the form and a copy button", /<WithdrawalForm \/>/.test(read("src/app/refunds/page.tsx")) && /id="withdrawal-form"/.test(read("src/components/withdrawal-form.tsx")));
  check("terms section 9 and section 14 link to the form", (terms.match(/refunds#withdrawal-form|sample withdrawal form/g) ?? []).length >= 2 && (read("src/app/terms/page.tsx").match(/href="\/refunds#withdrawal-form"/g) ?? []).length === 2);
  check("refunds page no longer implies withdrawal is by email only", /If it\s+helps, there is a sample form to copy below/.test(refunds));

  // 3.10
  check("privacy: waitlist removal is self-service (link, reply STOP) and no longer 'by email only'", /personal link that takes you off the waitlist without logging in/.test(privacy) && /reply STOP/.test(privacy) && !/remove your waitlist entry at any time via the contact address below/.test(privacy));

  // versions
  check("TOS and privacy versions moved to 2026-10-02 (consent rows then point at the right text)", /TOS_VERSION = "2026-10-02"/.test(read("src/lib/legal-versions.ts")) && /PRIVACY_VERSION = "2026-10-02"/.test(read("src/lib/legal-versions.ts")));
  check("the draft banner is still on (counsel has not signed off)", /draft = true/.test(read("src/components/legal-shell.tsx")) && /Pending legal review/.test(read("src/components/legal-shell.tsx")));
  return result();
}

void runIfMain(import.meta.url, runLegalCopySuite);
