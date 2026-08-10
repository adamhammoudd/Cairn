import { getSectorHeatmap } from "@/lib/actions/sector-map";
import { SectorTreemap } from "@/components/sector-map/sector-treemap";

export default async function SectorMapPage() {
  const data = await getSectorHeatmap();

  return (
    <div className="flex max-w-[900px] flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl text-primary">Sector Map</h2>
        <p className="mt-1 text-[13px] text-muted">
          Box size is market cap, color is today&apos;s % change. Symbols with no SEC-classified sector show under
          &quot;Unclassified.&quot;
        </p>
      </div>

      {data.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No price data available yet.
        </div>
      ) : (
        <SectorTreemap data={data} />
      )}
    </div>
  );
}
