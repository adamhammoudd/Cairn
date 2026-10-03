// Who operates Cairn, read from the environment - never written into the code.
//
// The legal notice, the email footers and the withdrawal form all print the
// operator's identity. It is the operator's own real details (name, address,
// enterprise number, contact), and an open decision at the time of writing is
// whose name the business is registered in (audit 2026-10-02, items 3.2 / 3.4).
// So no value is invented or defaulted here: every field is empty until it is
// set in the environment, and anything that needs the identity stays hidden
// (the legal notice page) or says only what is known (email footers) until it
// is complete.
//
// Required (all four, or the identity counts as not set):
//   OPERATOR_NAME              full legal name, or the registered company name
//   OPERATOR_ADDRESS           registered geographic address (a PO box is not enough)
//   OPERATOR_ENTERPRISE_NUMBER Belgian enterprise number (KBO/BCE)
//   OPERATOR_CONTACT_EMAIL     a monitored contact address
// Optional, printed only when set:
//   OPERATOR_LEGAL_FORM        e.g. sole trader, BV, NV
//   OPERATOR_VAT_NUMBER        or a statement that the operator is not VAT registered

export interface OperatorIdentity {
  name: string;
  address: string;
  enterpriseNumber: string;
  contactEmail: string;
  legalForm: string | null;
  vatNumber: string | null;
}

type Env = Record<string, string | undefined>;

// A value that still reads like the old template placeholder is not a value.
const PLACEHOLDER = /\[\s*TO BE COMPLETED|^\s*(todo|tbd|xxx+)\s*$/i;

function clean(v: string | undefined): string | null {
  const s = v?.replace(/\n/g, ", ").trim();
  return s && !PLACEHOLDER.test(s) ? s : null;
}

export function readOperatorIdentity(env: Env = process.env): OperatorIdentity | null {
  const name = clean(env.OPERATOR_NAME);
  const address = clean(env.OPERATOR_ADDRESS);
  const enterpriseNumber = clean(env.OPERATOR_ENTERPRISE_NUMBER);
  const contactEmail = clean(env.OPERATOR_CONTACT_EMAIL);
  if (!name || !address || !enterpriseNumber || !contactEmail) return null;
  return {
    name,
    address,
    enterpriseNumber,
    contactEmail,
    legalForm: clean(env.OPERATOR_LEGAL_FORM),
    vatNumber: clean(env.OPERATOR_VAT_NUMBER),
  };
}

/** Is /legal-notice allowed to be served? Only when the whole identity is set. */
export function legalNoticeLive(env: Env = process.env): boolean {
  return readOperatorIdentity(env) !== null;
}
