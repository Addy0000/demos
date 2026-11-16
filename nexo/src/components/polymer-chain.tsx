const CHAIN_Y = [76, 120, 164];
const XS = [24, 48, 72, 96, 120, 144, 168, 192, 216];
const AMP = 11;
/** Three nodes picked out in the action colour, and no more. */
const ACCENT = new Set(["0-3", "1-6", "2-2"]);

export function PolymerChain({ className = "" }: { className?: string }) {
  const line = "rgba(255,255,255,0.16)";

  return (
    /* Cropped to the artwork's own bounds — a viewBox padded with dead space would
       push the wordmark away from the mark it belongs to. */
    <svg viewBox="18 45 204 136" fill="none" className={className} aria-hidden="true">
      {CHAIN_Y.map((cy, ci) => {
        const pts = XS.map((x, i) => [x, cy + (i % 2 === 0 ? -AMP : AMP)] as const);
        return (
          <g key={cy}>
            <polyline
              points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
              stroke={line}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {pts.map(([x, y], i) =>
              i % 2 === 0 ? (
                <line
                  key={`bond-${i}`}
                  x1={x}
                  y1={y}
                  x2={x}
                  y2={y - 15}
                  stroke={line}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              ) : null,
            )}
            {pts.map(([x, y], i) =>
              i % 2 === 0 ? (
                <circle
                  key={`pendant-${i}`}
                  cx={x}
                  cy={y - 15}
                  r={2.5}
                  fill="var(--nav)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1.25}
                />
              ) : null,
            )}
            {pts.map(([x, y], i) => {
              const accent = ACCENT.has(`${ci}-${i}`);
              return (
                <circle
                  key={`node-${i}`}
                  cx={x}
                  cy={y}
                  r={3.5}
                  fill={accent ? "var(--primary)" : "var(--nav)"}
                  stroke={accent ? "var(--accent)" : "rgba(255,255,255,0.28)"}
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
