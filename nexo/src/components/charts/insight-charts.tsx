"use client";

import { useId, useMemo, useState } from "react";
import { compactInr, money, percent, titleise } from "@/lib/format";
import type {
  CostIndex,
  SpendMonth,
} from "@/app/(app)/insights";

/**
 * The dashboard's trend figures.
 *
 * House rules these all follow, so four charts read as one instrument:
 *
 * - **The readout is a fixed strip, not a floating tooltip.** In a pane this
 *   dense a tooltip would cover the marks either side of the one being read,
 *   and the operator comparing two months needs both. Hovering rewrites the
 *   strip in place; leaving restores the standing insight. Nothing moves.
 * - **Marks are thin, gridlines are recessive, labels are selective.** A number
 *   on every column is a table with extra steps; the strip carries the number.
 * - **Colour is single-hue except where the data has a genuine polarity.**
 *   Length already encodes magnitude; a ramp across a ranked bar chart would be
 *   the same fact told twice.
 * - **Every chart ships a screen-reader table.** Identity is never colour-alone
 *   and the figures are reachable without a pointer.
 */

/* Both measure ≥ 3:1 against var(--surface) and are separated by the zero axis and by
   direct counts, so the pair carries in every CVD simulation. */
const UP = "var(--danger-text)"; // a rate the vendor pushed up — the cost side's bad news
const DOWN = "var(--success-text)";
const INK = "var(--primary)"; // the single data hue: the action colour, at chart weight
const GRID = "var(--edge)";
const AXIS = "var(--muted)";

/** A titled figure with a live readout strip above its plot. */
function Figure({
  readout,
  children,
  table,
}: {
  readout: React.ReactNode;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <div className="flex flex-col px-3 pb-2 pt-2.5">
      <p className="mb-1.5 min-h-[30px] text-[11.5px] leading-[1.3] text-muted">{readout}</p>
      {children}
      <div className="sr-only">{table}</div>
    </div>
  );
}

/** Rounded only at the data end, square on the baseline, as a column should be. */
function columnPath(x: number, y: number, w: number, h: number, r = 3) {
  const rad = Math.min(r, w / 2, h);
  if (h <= 0.5) return `M${x},${y + h} h${w}`;
  return `M${x},${y + h} V${y + rad} a${rad},${rad} 0 0 1 ${rad},${-rad} h${w - rad * 2} a${rad},${rad} 0 0 1 ${rad},${rad} V${y + h} Z`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Purchase spend by month
// ─────────────────────────────────────────────────────────────────────────────

export function SpendChart({ data }: { data: SpendMonth[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const pid = useId();

  const W = 560;
  const H = 152;
  const PAD = { top: 12, right: 6, bottom: 24, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const step = innerW / data.length;
  const barW = Math.max(6, step - 5);

  // The run-rate comparison deliberately excludes the running month — measuring
  // half of August against twelve whole months would report a crash every time.
  const closed = data.filter((d) => !d.partial && d.value > 0);
  const avg = closed.length ? closed.reduce((s, d) => s + d.value, 0) / closed.length : 0;
  const latestClosed = closed[closed.length - 1];
  const vsAvg = avg && latestClosed ? ((latestClosed.value - avg) / avg) * 100 : 0;

  const active = hover !== null ? data[hover] : null;

  return (
    <Figure
      readout={
        active ? (
          <>
            <span className="font-num text-[13px] font-semibold tabular-nums text-ink">
              {compactInr(active.value)}
            </span>{" "}
            <span className="text-ink">
              {active.label} {active.year}
            </span>{" "}
            · {active.orders} order{active.orders === 1 ? "" : "s"}
            {active.partial && " · month still running"}
          </>
        ) : latestClosed ? (
          <>
            <span className="font-num text-[13px] font-semibold tabular-nums text-ink">
              {compactInr(latestClosed.value)}
            </span>{" "}
            committed in {latestClosed.label},{" "}
            <span
              className={`font-num font-semibold tabular-nums ${vsAvg > 0 ? "text-danger-text" : "text-success-text"}`}
            >
              {percent(vsAvg, 0)}
            </span>{" "}
            against the {closed.length}-month average of {compactInr(avg)}.
          </>
        ) : (
          "No purchase orders were raised in this window."
        )
      }
      table={
        <table>
          <caption>Purchase order value committed, by month</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row">{`${d.label} ${d.year}`}</th>
                <td>{money(d.value)}</td>
                <td>{`${d.orders} orders${d.partial ? " (month in progress)" : ""}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H }}
        role="img"
        aria-label={`Purchase order value by month over ${data.length} months, peaking at ${compactInr(max)}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* The provisional fill: a month still being lived through is drawn as
              the screen rather than solid, so a part-month is never read as a fall. */}
          <pattern id={`${pid}-screen`} width="4" height="4" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.95" fill={INK} />
          </pattern>
        </defs>

        {[0, 0.5, 1].map((f) => {
          const y = PAD.top + innerH - f * innerH;
          return (
            <g key={f}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke={GRID}
                strokeWidth={1}
                opacity={f === 0 ? 1 : 0.5}
              />
              <text
                x={PAD.left - 7}
                y={y + 3.5}
                textAnchor="end"
                fill={AXIS}
                fontSize={9.5}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {f === 0 ? "0" : compactInr(max * f).replace("₹ ", "")}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = PAD.left + i * step + (step - barW) / 2;
          const y = PAD.top + innerH - h;
          const on = hover === i;
          return (
            <g key={d.key}>
              <path
                d={columnPath(x, y, barW, h)}
                fill={d.partial ? `url(#${pid}-screen)` : INK}
                opacity={hover === null || on ? 1 : 0.35}
                style={{ transition: "opacity 150ms cubic-bezier(0.16,1,0.3,1)" }}
              />
              {/* A hit target the full height of the plot, so the thin months at
                  the right are as easy to read as the tall ones. */}
              <rect
                x={PAD.left + i * step}
                y={PAD.top}
                width={step}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${d.label} ${d.year}: ${money(d.value)}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                style={{ cursor: "crosshair" }}
              />
              {/* January anchors the year; labelling all twelve would collide. */}
              <text
                x={PAD.left + i * step + step / 2}
                y={H - 8}
                textAnchor="middle"
                fill={on ? "var(--ink)" : AXIS}
                fontSize={9.5}
                fontWeight={on || d.label === "Jan" ? 600 : 400}
              >
                {d.label === "Jan" ? `${d.label} ${String(d.year).slice(2)}` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Raw-material cost index
// ─────────────────────────────────────────────────────────────────────────────

export function CostIndexChart({ data }: { data: CostIndex }) {
  const [hover, setHover] = useState<number | null>(null);
  const pid = useId();
  const { series, basket, drift } = data;

  const W = 380;
  const H = 152;
  const PAD = { top: 14, right: 10, bottom: 24, left: 40 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const { coords, path, area, lo, hi } = useMemo(() => {
    const vals = series.map((s) => s.index);
    const rawLo = Math.min(...vals, 100);
    const rawHi = Math.max(...vals, 100);
    const span = rawHi - rawLo || 4;
    const lo = rawLo - span * 0.25;
    const hi = rawHi + span * 0.25;

    const coords = series.map((s, i) => ({
      x: PAD.left + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
      y: PAD.top + innerH - ((s.index - lo) / (hi - lo)) * innerH,
      ...s,
    }));

    const path = coords.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const base = PAD.top + innerH;
    const area = `${path} L${coords[coords.length - 1]!.x.toFixed(1)},${base} L${coords[0]!.x.toFixed(1)},${base} Z`;

    return { coords, path, area, lo, hi };
  }, [series, innerW, innerH, PAD.left, PAD.top]);

  const y100 = PAD.top + innerH - ((100 - lo) / (hi - lo)) * innerH;
  const active = hover !== null ? coords[hover] : null;

  return (
    <Figure
      readout={
        active ? (
          <>
            <span className="font-num text-[13px] font-semibold tabular-nums text-ink">
              {active.index.toFixed(1)}
            </span>{" "}
            <span className="text-ink">
              {active.label} {active.year}
            </span>{" "}
            ·{" "}
            <span
              className={`font-num tabular-nums ${active.index > 100 ? "text-danger-text" : "text-success-text"}`}
            >
              {percent(active.index - 100)}
            </span>{" "}
            vs base
          </>
        ) : (
          <>
            The basket costs{" "}
            <span
              className={`font-num text-[13px] font-semibold tabular-nums ${drift > 0 ? "text-danger-text" : "text-success-text"}`}
            >
              {percent(drift)}
            </span>{" "}
            more than it did {series[0]?.label} {series[0]?.year}, across {basket} materials
            weighted by what was actually bought.
          </>
        )
      }
      table={
        <table>
          <caption>Raw-material cost index, base 100</caption>
          <tbody>
            {series.map((s) => (
              <tr key={s.key}>
                <th scope="row">{`${s.label} ${s.year}`}</th>
                <td>{s.index.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H }}
        role="img"
        aria-label={`Raw-material cost index, base 100, ending at ${series[series.length - 1]?.index.toFixed(1)}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${pid}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INK} stopOpacity={0.16} />
            <stop offset="100%" stopColor={INK} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {/* The base line is the fact this chart is about — dashed, labelled, and
            the only gridline, because every other value is read against it. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y100}
          y2={y100}
          stroke={GRID}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={PAD.left - 7}
          y={y100 + 3.5}
          textAnchor="end"
          fill={AXIS}
          fontSize={9.5}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          100
        </text>

        <path d={area} fill={`url(#${pid}-fade)`} />
        <path
          d={path}
          fill="none"
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke={AXIS}
            strokeWidth={1}
            opacity={0.4}
          />
        )}

        {coords.map((c, i) => (
          <g key={c.key}>
            {(hover === i || i === coords.length - 1) && (
              <circle
                cx={c.x}
                cy={c.y}
                r={hover === i ? 4.5 : 3.5}
                fill="var(--surface)"
                stroke={INK}
                strokeWidth={2}
              />
            )}
            <rect
              x={c.x - innerW / (coords.length * 2)}
              y={PAD.top}
              width={innerW / coords.length}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${c.label} ${c.year}: index ${c.index.toFixed(1)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              style={{ cursor: "crosshair" }}
            />
          </g>
        ))}

        <text x={PAD.left} y={H - 8} fill={AXIS} fontSize={9.5}>
          {series[0]?.label} {String(series[0]?.year).slice(2)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fill={AXIS} fontSize={9.5}>
          {series[series.length - 1]?.label} {String(series[series.length - 1]?.year).slice(2)}
        </text>
      </svg>
    </Figure>
  );
}
