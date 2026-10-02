import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBillingDetail } from "@/lib/actions/billing";
import { BillingPanel } from "@/components/billing/billing-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing - Cairn" };

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const detail = await getBillingDetail();

  return <BillingPanel detail={detail} />;
}
