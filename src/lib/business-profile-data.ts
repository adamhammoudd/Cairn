// Server glue for "What it does" (feat/business-profile): read the stored
// profile and revenue split, and write the plain-English description once per
// 10-K. The words come from ./business-profile.ts, where they are checked.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDescription, revenueSplits, type DescriptionFailure, type RevenueSplitView, type SegmentRow } from "@/lib/business-profile";

export interface BusinessProfileView {
  symbol: string;
  name: string;
  sic: string | null;
  sicDescription: string | null;
  oneLiner: string;
  paragraph: string;
  /** "model": plain English written from the filing and checked; "template": the SEC class and the company's own words. */
  source: "model" | "template";
  filing: { form: string; filed: string | null; accn: string; url: string };
  segmentStatus: "split" | "single_segment" | "none";
  segmentReason: string | null;
  splits: RevenueSplitView[];
}

/** Failures that say nothing about the text: retried on the next view instead of cached. */
const TRANSIENT: DescriptionFailure[] = ["model_error", "model_unusable"];

/**
 * Null when no profile is stored (a fund, a coin, a company not yet read by
 * ingest-business-profile, or migration 0062 not applied).
 */
export async function loadBusinessProfile(symbol: string, name: string): Promise<BusinessProfileView | null> {
  const db = createAdminClient();
  const [{ data: p }, { data: segs }] = await Promise.all([
    db.from("company_profiles").select("*").eq("symbol", symbol).maybeSingle(),
    db.from("company_segments").select("axis, label, revenue, total, fiscal_year_end, accn, filed").eq("symbol", symbol),
  ]);
  if (!p) return null;

  let oneLiner = p.plain_one_liner;
  let paragraph = p.plain_paragraph;
  let source = (p.plain_source as "model" | "template" | null) ?? "template";
  if (!oneLiner || !paragraph || p.plain_accn !== p.accn) {
    const d = await generateDescription({ name, sicDescription: p.sic_description, excerpt: p.business_excerpt ?? "" });
    oneLiner = d.oneLiner;
    paragraph = d.paragraph;
    source = d.source;
    // Cached per filing; a model outage is not cached, so it is written once the model is back.
    if (!d.failure || !TRANSIENT.includes(d.failure)) {
      await db
        .from("company_profiles")
        .update({
          plain_one_liner: d.oneLiner,
          plain_paragraph: d.paragraph,
          plain_source: d.source,
          plain_failure: d.failure ? `${d.failure}${d.evidence ? `: ${d.evidence}` : ""}`.slice(0, 500) : null,
          plain_accn: p.accn,
          plain_generated_at: new Date().toISOString(),
        })
        .eq("symbol", symbol)
        .eq("accn", p.accn);
    }
  }

  return {
    symbol,
    name,
    sic: p.sic,
    sicDescription: p.sic_description,
    oneLiner,
    paragraph,
    source,
    filing: { form: p.form, filed: p.filed, accn: p.accn, url: p.source_url },
    segmentStatus: p.segment_status as BusinessProfileView["segmentStatus"],
    segmentReason: p.segment_reason,
    splits: revenueSplits((segs ?? []) as unknown as SegmentRow[]),
  };
}
