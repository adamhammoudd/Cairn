import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCryptoOverview } from "@/lib/actions/crypto";
import { CryptoTable } from "@/components/crypto/crypto-table";

export default async function CryptoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await getCryptoOverview();

  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <p className="text-[13px] text-muted">
        Ranked by market cap. Volatility regimes derived from this price history feed the AI engine&apos;s
        crypto analogs — see a ticker&apos;s Analysis tab for details.
      </p>
      <CryptoTable rows={rows} />
    </div>
  );
}
