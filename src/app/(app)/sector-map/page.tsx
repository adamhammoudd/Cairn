import { getSectorHeatmap } from "@/lib/actions/sector-map";
import { SectorTreemap } from "@/components/sector-map/sector-treemap";

export default async function SectorMapPage() {
  const data = await getSectorHeatmap();

  // Coverage is stated on the page rather than left to be inferred from the
  // tiles: classification comes from SEC EDGAR sicDescription, which is SIC
  // industry classification, not GICS. Anything EDGAR does not classify (ETF
  // trusts, non-US listings) lands in "Unclassified" and is named as a gap.
  const classified = data.filter((s) => s.name !== "Unclassified");
  const unclassified = data.find((s) => s.name === "Unclassified");

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Markets · Sector map</div>
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Sector map</h1>
        <p className="mt-1.75 max-w-[540px] text-[13.5px] text-muted text-pretty">
          Tile area is market cap; saturation is the size of today&apos;s move. Symbols with no SEC-classified sector
          show under &quot;Unclassified.&quot;
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-[21px] text-primary">No ground mapped yet</div>
          <p className="mx-auto mt-2 max-w-[400px] text-[13px] text-muted text-pretty">
            Once price data lands for your tracked symbols, they&apos;ll group into sectors here.
          </p>
        </div>
      ) : (
        <>
          <SectorTreemap data={data} />
          <p className="mt-4 max-w-[720px] text-[12px] leading-relaxed text-dim text-pretty">
            Coverage: {classified.length} classified {classified.length === 1 ? "sector" : "sectors"} from SEC EDGAR
            (SIC industry classification, not GICS)
            {classified.length > 0 && <> - {classified.map((s) => s.name).join(", ")}</>}.
            {unclassified && (
              <>
                {" "}
                {unclassified.children.length}{" "}
                {unclassified.children.length === 1 ? "symbol has" : "symbols have"} no EDGAR sector: ETF trusts and
                crypto are not covered by SIC, so they stay unclassified rather than being assigned a sector Cairn
                cannot source.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}
