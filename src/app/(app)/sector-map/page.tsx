import { getSectorHeatmap } from "@/lib/actions/sector-map";
import { getUserSettings } from "@/lib/actions/settings";
import { SectorTreemap } from "@/components/sector-map/sector-treemap";

import { guardReads } from "@/components/data-unavailable";

// A failed market-data read renders the panel instead of throwing into a
// minified React error; anything else propagates as before.
export default async function SectorMapPage() {
  return guardReads(SectorMapBody);
}


async function SectorMapBody() {
  const [heatmap, settings] = await Promise.all([getSectorHeatmap(), getUserSettings()]);

  // Settings > Display > "Sector map focus". Null (the default) leaves the
  // map's own largest-first ordering alone; a chosen sector is pulled to the
  // front and marked, so the page opens on the sector the reader actually
  // watches rather than whichever happens to be biggest that day.
  //
  // Reordering rather than filtering: hiding the other sectors would turn a
  // heat map into a single card and lose the comparison the page exists for.
  const focus = settings?.sector_map_default_sector ?? null;
  const focusedSector = focus && heatmap.some((s) => s.name === focus) ? focus : null;
  const data = focusedSector
    ? [...heatmap].sort((a, b) => (a.name === focusedSector ? -1 : b.name === focusedSector ? 1 : 0))
    : heatmap;

  // Coverage is stated on the page rather than left to be inferred from the
  // tiles: classification comes from SEC EDGAR sicDescription, which is SIC
  // industry classification, not GICS. Anything EDGAR does not classify (ETF
  // trusts, non-US listings) lands in "Unclassified" and is named as a gap.
  const classified = data.filter((s) => s.name !== "Unclassified");
  const unclassified = data.find((s) => s.name === "Unclassified");

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Markets · Sector map</div>
        <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
          Sector map
        </h1>
        <p className="mt-2 max-w-[560px] text-[13.5px] leading-[1.55] text-muted text-pretty">
          Tile area is market cap; saturation is the size of today&apos;s move. Symbols with no SEC-classified sector
          show under &quot;Unclassified.&quot;
          {focusedSector && <> Opening on {focusedSector} - your focus sector, set in Settings.</>}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-h3 text-primary">No ground mapped yet</div>
          <p className="mx-auto mt-2 max-w-[400px] text-body text-muted text-pretty">
            Once price data lands for your tracked symbols, they&apos;ll group into sectors here.
          </p>
        </div>
      ) : (
        <>
          <SectorTreemap data={data} focusedSector={focusedSector} />
          <p className="mt-4 max-w-[720px] text-caption leading-relaxed text-dim text-pretty">
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
