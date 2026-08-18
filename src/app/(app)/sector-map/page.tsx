import { getSectorHeatmap } from "@/lib/actions/sector-map";
import { SectorTreemap } from "@/components/sector-map/sector-treemap";

export default async function SectorMapPage() {
  const data = await getSectorHeatmap();

  return (
    <div>
      <div>
        <div>Markets · Sector map</div>
        <h1>Sector map</h1>
        <p>
          Tile area is market cap; saturation is the size of today&apos;s move. Symbols with no SEC-classified sector
          show under &quot;Unclassified.&quot;
        </p>
      </div>

      {data.length === 0 ? (
        <div>
          <div>No ground mapped yet</div>
          <p>
            Once price data lands for your tracked symbols, they&apos;ll group into sectors here.
          </p>
        </div>
      ) : (
        <SectorTreemap data={data} />
      )}
    </div>
  );
}
