"use client";

import { useMemo, useState } from "react";
import { ratePerKg, date } from "@/lib/format";

type Point = { date: string; price: number; vendor: string };

/**
 * Rate history as a real chart, drawn from the approved price rows. Hovering a
 * point reads out the rate, the date and which vendor set it — a sparkline
 * standing in for the data would say less than the numbers already on the page.
 */
export function PriceTrend({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = 168;
  const PAD = { top: 14, right: 16, bottom: 26, left: 56 };

  const { path, area, coords, min, max, ticks } = useMemo(() => {
    const prices = points.map((p) => p.price);
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const span = rawMax - rawMin || rawMax * 0.1 || 1;
    const lo = rawMin - span * 0.15;
    const hi = rawMax + span * 0.15;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const coords = points.map((p, i) => ({
      x: PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
      y: PAD.top + innerH - ((p.price - lo) / (hi - lo)) * innerH,
      ...p,
    }));

    const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const area =
      coords.length > 1
        ? `${path} L${coords[coords.length - 1]!.x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${coords[0]!.x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
        : "";

    const ticks = [lo, (lo + hi) / 2, hi].map((v) => ({
      v,
      y: PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH,
    }));

    return { path, area, coords, min: rawMin, max: rawMax, ticks };
  }, [points]);

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const overall = ((last.price - first.price) / first.price) * 100;
  const active = hover !== null ? coords[hover] : null;

  return (
    <div className="py-1">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11.5px]">
        <span className="text-muted">
          Low <span className="font-num font-medium tabular-nums text-ink">{ratePerKg(min)}</span>
        </span>
        <span className="text-muted">
          High <span className="font-num font-medium tabular-nums text-ink">{ratePerKg(max)}</span>
        </span>
        <span className="text-muted">
          Movement over period{" "}
          <span className={`font-num font-semibold tabular-nums ${overall > 0 ? "text-danger" : "text-success"}`}>
            {overall > 0 ? "+" : ""}{overall.toFixed(1)}%
          </span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H }}
        role="img"
        aria-label={`Rate history from ${ratePerKg(first.price)} to ${ratePerKg(last.price)}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} stroke="#D5E0E6" strokeWidth={1} strokeDasharray={i === 1 ? "3 3" : undefined} />
            <text x={PAD.left - 8} y={t.y + 3.5} textAnchor="end" fill="#71818B" fontSize={10} style={{ fontVariantNumeric: "tabular-nums" }}>
              {t.v.toFixed(0)}
            </text>
          </g>
        ))}

        {area && <path d={area} fill="#DCEAF2" opacity={0.65} />}
        <path d={path} fill="none" stroke="#315B7D" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={hover === i ? 4.5 : 2.75} fill={hover === i ? "#315B7D" : "var(--surface)"} stroke="#315B7D" strokeWidth={1.5} />
            <rect
              x={c.x - 14} y={PAD.top} width={28} height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "crosshair" }}
            />
          </g>
        ))}

        <text x={PAD.left} y={H - 8} fill="#71818B" fontSize={10}>{date(first.date)}</text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fill="#71818B" fontSize={10}>{date(last.date)}</text>
      </svg>

      <p className="mt-1 min-h-[18px] text-[11.5px] text-muted">
        {active ? (
          <>
            <span className="font-num font-semibold tabular-nums text-ink">{ratePerKg(active.price)}</span>
            {" from "}
            {date(active.date)}
            {" · set by "}
            <span className="text-ink">{active.vendor}</span>
          </>
        ) : (
          "Hover a point to read the rate, its effective date and the vendor that set it."
        )}
      </p>
    </div>
  );
}
