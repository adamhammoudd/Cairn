import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBillingSummary } from "@/lib/actions/billing";
import { BillingPanel } from "@/components/billing/billing-panel";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const summary = await getBillingSummary();

  return <BillingPanel summary={summary} />;
}
