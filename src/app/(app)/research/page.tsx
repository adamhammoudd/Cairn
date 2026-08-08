import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAnalyses } from "@/lib/actions/analysis";
import { RequestForm } from "@/components/analysis/request-form";
import { MethodologyCard } from "@/components/analysis/methodology-card";

export default async function ResearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const analyses = await listAnalyses();

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <RequestForm />

      {analyses.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No analyses yet. Request one above — market, sector, or ticker level only.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {analyses.map((a) => (
            <MethodologyCard key={a.id} analysis={a} />
          ))}
        </div>
      )}
    </div>
  );
}
