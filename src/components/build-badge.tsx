import { getBuildId, getBuildTime } from "@/lib/build-id";

// ui-reset-v2: small, unobtrusive corner marker - check this first before
// assuming a stale render is a design bug. Position/size is functional
// (has to sit in a fixed corner to be checkable), not decorative.
export function BuildBadge() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 4,
        right: 6,
        fontSize: 10,
        opacity: 0.6,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      build {getBuildId()} · {getBuildTime()}
    </div>
  );
}
