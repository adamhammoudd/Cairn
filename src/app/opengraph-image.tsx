import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Social share card (og:image; Twitter falls back to it). Generated from the
// existing brand lockup and the colour tokens in globals.css - no new artwork.
// First pass: uses the default sans rather than the site's Newsreader serif,
// because loading that font here would mean a network fetch at build time.
export const alt =
  "Cairn - market analysis that shows its work. Every answer comes with its sources, historical analogs and confidence.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CANVAS = "#0a0a0a";
const ACCENT = "#2fc685";
const ACCENT_LIGHT = "#5ee6a6";

export default async function Image() {
  const lockup = await readFile(join(process.cwd(), "public", "cairn-lockup.png"));
  const lockupSrc = `data:image/png;base64,${lockup.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: CANVAS,
          backgroundImage: "radial-gradient(900px 420px at 88% -10%, rgba(47,198,133,0.22), transparent 70%)",
          color: "#f5f5f5",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders to PNG; next/image does not apply */}
        <img src={lockupSrc} alt="Cairn" width={296} height={100} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 84, lineHeight: 1.06, letterSpacing: -2 }}>
            <span>Market analysis that&nbsp;</span>
            <span style={{ color: ACCENT_LIGHT }}>shows its work.</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "#9a9a9a", maxWidth: 900 }}>
            Every answer comes with the sources it read, the historical cases it compared, and how confident it is.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: "#8a8a8a" }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: ACCENT, marginRight: 14 }} />
          Informational only - not a broker, not investment advice.
        </div>
      </div>
    ),
    size,
  );
}
