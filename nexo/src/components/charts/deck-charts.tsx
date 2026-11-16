"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { compactInr, percent, titleise } from "@/lib/format";
import { IconChevronRight } from "@/components/icons";
import { ACT_AT as T } from "@/app/(app)/act-at";
import type {
  AgeingRow,
  BridgeStep,
  CashCycle,
  CustomerBook,
  FunnelStage,
  GradeCost,
  PriceMove,
  ReceivableRow,
  Trend,
} from "@/app/(app)/metrics";

/**
 * The dashboard's bento cards and the graphics inside them.
 *
 * Rules every card keeps, so fourteen read as one instrument:
 * - **Picture first, words last.** A card is an icon, a name, one number and
 *   one graphic. Any sentence is a single short line, and only when the graphic
 *   cannot say it.
 * - **The act line is drawn, not written.** Where a metric has a threshold
 *   (`act-at.ts`) the chart draws it, and a mark past it turns red. Red means
 *   "somebody acts on this", never decoration.
 * - **One data hue** (the action teal) plus a lighter ramp of it; red and amber
 *   are status only.
 * - **Every graphic ships a screen-reader label or table.**
 */

const INK = "var(--primary)";
const MID = "var(--accent)";
const SOFT = "var(--accent-soft)";
const PALE = "var(--pastel)";
const ACT = "var(--danger)";
const ACT_TEXT = "var(--danger-text)";
const GRID = "var(--faint)";

const cr = (v: number) => compactInr(v).replace("₹ ", "₹");

function useWidth<E extends HTMLElement>(fallback: number) {
  const ref = useRef<E>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ─────────────────────────────────────────────────────────────────────────────
// Card shell
// ─────────────────────────────────────────────────────────────────────────────

/** A bento cell: icon badge, title, an optional corner element, then the graphic. */
export function Card({
  icon,
  title,
  href,
  aside,
  children,
  className = "",
  index = 0,
}: {
  icon: React.ReactNode;
  title: string;
  href?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <section
      className={`card-in flex min-w-0 flex-col rounded-[8px] border border-edge bg-surface shadow-[0_1px_2px_rgba(33,46,48,0.04)] ${className}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      <header className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-pastel text-primary">{icon}</span>
        <h2 className="min-w-0 truncate text-[13px] font-semibold text-ink">{title}</h2>
        <div className="flex-1" />
        {aside}
        {href && (
          <Link href={href} aria-label={`Open ${title}`} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-faint hover:text-primary">
            <IconChevronRight size={14} />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 px-3.5 pb-3.5 pt-2.5">{children}</div>
    </section>
  );
}

/** Small status pill for a card corner. */
export function Pill({ tone, children }: { tone: "act" | "ok" | "slow" | "plain"; children: React.ReactNode }) {
  const c = {
    act: "bg-danger-bg text-danger-text",
    ok: "bg-success-bg text-success-text",
    slow: "bg-warning-bg text-warning-text",
    plain: "bg-faint text-muted",
  }[tone];
  return <span className={`shrink-0 rounded-full px-2 py-[2px] font-num text-[10.5px] font-semibold tabular-nums ${c}`}>{children}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI card — number over an area chart
// ─────────────────────────────────────────────────────────────────────────────

type Unit = "inr" | "pct" | "days";
const fmt = (u: Unit, v: number) => (u === "inr" ? cr(v) : u === "pct" ? `${v.toFixed(1)}%` : `${Math.round(v)} days`);

/**
 * One headline figure and its twelve-month shape. Hovering scrubs the chart and
 * the big number follows; the running month is drawn dashed so a part-month
 * never reads as a fall.
 */
export function KpiChart({ trend, unit, good, deltaUnit }: { trend: Trend; unit: Unit; good: "up" | "down"; deltaUnit: "pct" | "pts" | "days" }) {
  const [ref, W] = useWidth<HTMLDivElement>(260);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const s = trend.series;
  const H = 74;
  const vals = s.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || 1;
  const x = (i: number) => (i / Math.max(1, s.length - 1)) * W;
  const y = (v: number) => 6 + (1 - (v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 10);
  const solid = s.filter((p) => !p.partial);
  const line = solid.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(solid.length - 1)},${H} L0,${H} Z`;
  const tail = s.length > solid.length ? `M${x(solid.length - 1)},${y(solid[solid.length - 1]!.value)} L${x(s.length - 1)},${y(s[s.length - 1]!.value)}` : "";
  const at = hover ?? solid.length - 1;
  const better = good === "up" ? trend.delta > 0 : trend.delta < 0;
  const flat = Math.abs(trend.delta) < 0.05;
  const d =
    deltaUnit === "pct"
      ? percent(trend.delta)
      : `${trend.delta > 0 ? "+" : ""}${deltaUnit === "days" ? `${Math.round(trend.delta)}d` : `${trend.delta.toFixed(1)} pts`}`;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-num text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
          {fmt(unit, hover !== null ? s[hover]!.value : trend.value)}
        </span>
        {hover === null ? (
          <span className={`inline-flex items-center gap-0.5 font-num text-[11.5px] font-semibold tabular-nums ${flat ? "text-muted" : better ? "text-success-text" : "text-danger-text"}`}>
            <svg viewBox="0 0 10 10" className={`h-2.5 w-2.5 ${trend.delta < 0 ? "rotate-180" : ""}`} aria-hidden>
              <path d="M5 1.5 9 7.5H1z" fill="currentColor" />
            </svg>
            {d}
          </span>
        ) : (
          <span className="font-num text-[11px] text-muted">{s[hover]!.label}</span>
        )}
      </div>
      <div ref={ref} className="relative mt-3 h-[74px]">
        <svg
          width={W}
          height={H}
          className="block overflow-visible"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(s.length - 1, Math.round(((e.clientX - r.left) / r.width) * (s.length - 1)))));
          }}
          role="img"
          aria-label={s.map((p) => `${p.label} ${fmt(unit, p.value)}`).join(", ")}
        >
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={INK} stopOpacity="0.22" />
              <stop offset="100%" stopColor={INK} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={INK} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {tail && <path d={tail} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke={SOFT} strokeDasharray="2 2" />}
          <circle cx={x(at)} cy={y(s[at]!.value)} r={4.5} fill={INK} stroke="#fff" strokeWidth={2} />
        </svg>
      </div>
      <div className="mt-1 flex justify-between font-num text-[9.5px] uppercase tracking-[0.08em] text-muted">
        <span>{s[0]!.label}</span>
        <span>{s[s.length - 1]!.label}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash cycle — a gauge with its three parts beneath
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Days of working capital as a dial. The needle is today; the dark tick is
 * month end, so a move reads as a distance. The three parts sit under the dial
 * as the arithmetic they are: receivable + stock − payable.
 */
export function CycleGauge({ cycle }: { cycle: CashCycle }) {
  const max = Math.max(90, Math.ceil((Math.max(cycle.cycle, cycle.priorCycle) * 1.35) / 10) * 10);
  const W = 220;
  const cx = W / 2;
  const cy = 104;
  const r = 86;
  const ang = (d: number) => Math.PI * (1 - Math.min(Math.max(d, 0), max) / max);
  const pt = (d: number, rr = r) => ({ x: cx + rr * Math.cos(ang(d)), y: cy - rr * Math.sin(ang(d)) });
  const arc = (a: number, b: number) => {
    const p = pt(a);
    const q = pt(b);
    return `M${p.x},${p.y} A${r},${r} 0 0 1 ${q.x},${q.y}`;
  };
  const moved = Math.abs(cycle.cycle - cycle.priorCycle) >= T.cycleMoveDays;
  const needle = pt(cycle.cycle, r - 22);
  const ghost = [pt(cycle.priorCycle, r - 10), pt(cycle.priorCycle, r + 10)];
  const parts = [
    { label: "Receivable", d: cycle.receivableDays, sign: "", c: INK },
    { label: "Stock", d: cycle.inventoryDays, sign: "+", c: SOFT },
    { label: "Payable", d: cycle.payableDays, sign: "−", c: "var(--scroll)" },
  ];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} 118`} className="h-auto w-full max-w-[250px]" role="img" aria-label={`Cash cycle ${Math.round(cycle.cycle)} days, month end ${Math.round(cycle.priorCycle)}`}>
        <path d={arc(0, max)} stroke={GRID} strokeWidth={14} fill="none" strokeLinecap="round" />
        <path d={arc(0, cycle.cycle)} stroke={moved ? ACT : INK} strokeWidth={14} fill="none" strokeLinecap="round" />
        <line x1={ghost[0]!.x} y1={ghost[0]!.y} x2={ghost[1]!.x} y2={ghost[1]!.y} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="var(--ink)" />
        <text x={cx} y={cy - 26} textAnchor="middle" className="font-num" fontSize="28" fontWeight={600} fill="var(--ink)" letterSpacing="-0.5">
          {Math.round(cycle.cycle)}
        </text>
        <text x={cx} y={cy - 11} textAnchor="middle" fontSize="10" fill="var(--muted)">days</text>
        <text x={pt(0).x} y={cy + 14} textAnchor="middle" fontSize="9" fill="var(--muted)" className="font-num">0</text>
        <text x={pt(max).x} y={cy + 14} textAnchor="middle" fontSize="9" fill="var(--muted)" className="font-num">{max}</text>
      </svg>
      <div className="mt-2 grid w-full grid-cols-3 gap-1.5">
        {parts.map((p) => (
          <div key={p.label} className="rounded-[6px] bg-canvas/70 px-2 py-1.5 text-center">
            <div className="flex items-center justify-center gap-1">
              <i className="h-2 w-2 rounded-full" style={{ background: p.c }} />
              <span className="text-[10.5px] text-muted">{p.label}</span>
            </div>
            <div className="font-num text-[14px] font-semibold tabular-nums text-ink">
              {p.sign}
              {Math.round(p.d)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Donut
// ─────────────────────────────────────────────────────────────────────────────

function Donut({ parts, size = 128, thickness = 16, center, sub }: { parts: { v: number; c: string; label: string }[]; size?: number; thickness?: number; center: string; sub: string }) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const gap = 2.5;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={parts.map((p) => `${p.label} ${cr(p.v)}`).join(", ")}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={GRID} strokeWidth={thickness} fill="none" />
      {parts.map((p) => {
        const len = (p.v / total) * C;
        const start = off;
        off += len;
        return p.v > 0 ? (
          <circle
            key={p.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={p.c}
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
            strokeDashoffset={-start}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null;
      })}
      <text x="50%" y="49%" textAnchor="middle" className="font-num" fontSize="16" fontWeight={600} fill="var(--ink)" letterSpacing="-0.4">
        {center}
      </text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="10" fill="var(--muted)">{sub}</text>
    </svg>
  );
}

function Legend({ items }: { items: { c: string; label: string; value?: string; strong?: boolean }[] }) {
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2 text-[11.5px]">
          <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: i.c }} />
          <span className={`min-w-0 flex-1 truncate ${i.strong ? "font-semibold text-ink" : "text-muted"}`}>{i.label}</span>
          {i.value && <span className={`font-num tabular-nums ${i.strong ? "font-semibold text-danger-text" : "text-ink"}`}>{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customers — bubbles on revenue × margin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each account a bubble sized by revenue, placed by revenue and margin. The two
 * act lines cut the plot into four corners; only the re-price corner (big and
 * thin) is painted, because only it has a meeting attached.
 */
export function CustomerBubbles({ book }: { book: CustomerBook }) {
  const [ref, W] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<string | null>(null);
  const pid = useId();
  const pts = book.points;
  const H = 250;
  const P = { top: 14, right: 18, bottom: 24, left: 34 };
  const iw = W - P.left - P.right;
  const ih = H - P.top - P.bottom;
  const maxRev = Math.max(...pts.map((p) => p.revenue), T.repriceRevenue * 1.4);
  const mLo = Math.floor(Math.min(...pts.map((p) => p.margin), T.repriceMarginPct - 4));
  const mHi = Math.ceil(Math.max(...pts.map((p) => p.margin), T.repriceMarginPct + 4));
  const xs = (v: number) => P.left + (Math.sqrt(v) / Math.sqrt(maxRev)) * iw;
  const ys = (v: number) => P.top + (1 - (v - mLo) / (mHi - mLo)) * ih;
  const rs = (v: number) => 5 + Math.sqrt(v / maxRev) * 15;
  const tx = xs(T.repriceRevenue);
  const ty = ys(T.repriceMarginPct);
  const reprice = (p: { revenue: number; margin: number }) => p.revenue >= T.repriceRevenue && p.margin < T.repriceMarginPct;
  const active = pts.find((p) => p.id === hover);

  // Label placement: biggest and re-price accounts first, each trying right,
  // left, above, below, and skipped if every spot would collide with a label
  // already set or another bubble. Hover always shows the name in the tooltip.
  const labels = useMemo(() => {
    type Box = { x: number; y: number; w: number; h: number };
    const hitBox = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const placed: Box[] = [];
    const circles = pts.map((p) => {
      const r = rs(p.revenue);
      return { id: p.id, box: { x: xs(p.revenue) - r, y: ys(p.margin) - r, w: r * 2, h: r * 2 } };
    });
    const out = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
    const order = [...pts].sort((a, b) => Number(reprice(b)) - Number(reprice(a)) || b.revenue - a.revenue);
    for (const p of order) {
      const r = rs(p.revenue);
      const cx = xs(p.revenue);
      const cy = ys(p.margin);
      const w = p.name.length * 6.1;
      const h = 13;
      const tries: { x: number; y: number; anchor: "start" | "end" | "middle"; box: Box }[] = [
        { x: cx + r + 5, y: cy + 4, anchor: "start", box: { x: cx + r + 5, y: cy - 8, w, h } },
        { x: cx - r - 5, y: cy + 4, anchor: "end", box: { x: cx - r - 5 - w, y: cy - 8, w, h } },
        { x: cx, y: cy - r - 5, anchor: "middle", box: { x: cx - w / 2, y: cy - r - 5 - 11, w, h } },
        { x: cx, y: cy + r + 13, anchor: "middle", box: { x: cx - w / 2, y: cy + r + 2, w, h } },
      ];
      const fit = tries.find(
        (t) =>
          t.box.x >= 2 &&
          t.box.x + t.box.w <= W - 2 &&
          t.box.y >= 0 &&
          t.box.y + t.box.h <= H - 18 &&
          !placed.some((b) => hitBox(b, t.box)) &&
          !circles.some((c) => c.id !== p.id && hitBox(c.box, t.box)),
      );
      if (fit) {
        placed.push(fit.box);
        out.set(p.id, fit);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, W]);

  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} className="block" onPointerLeave={() => setHover(null)} role="img" aria-label="Customers by revenue and margin">
        <defs>
          <pattern id={`${pid}-h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={ACT} strokeOpacity="0.16" strokeWidth="2.5" />
          </pattern>
        </defs>
        <rect x={tx} y={ty} width={W - P.right - tx} height={P.top + ih - ty} fill={`url(#${pid}-h)`} rx={4} />
        <line x1={tx} x2={tx} y1={P.top} y2={P.top + ih} stroke="var(--ink)" strokeDasharray="3 3" />
        <line x1={P.left} x2={W - P.right} y1={ty} y2={ty} stroke="var(--ink)" strokeDasharray="3 3" />
        <line x1={P.left} x2={W - P.right} y1={P.top + ih} y2={P.top + ih} stroke={GRID} />
        {[
          ["Grow", P.left + 6, P.top + 10, "start", "var(--muted)"],
          ["Defend", W - P.right - 6, P.top + 10, "end", "var(--muted)"],
          ["Leave", P.left + 6, P.top + ih - 6, "start", "var(--muted)"],
          ["Re-price", W - P.right - 6, P.top + ih - 6, "end", ACT_TEXT],
        ].map(([t, x, y, a, c]) => (
          <text key={t as string} x={x as number} y={y as number} textAnchor={a as "start" | "end"} fontSize="10.5" fontWeight={600} fill={c as string}>
            {t}
          </text>
        ))}
        {[mLo, T.repriceMarginPct, mHi].map((m) => (
          <text key={m} x={P.left - 6} y={ys(m) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)" className="font-num">{m}%</text>
        ))}
        <text x={tx} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--ink)" className="font-num">{cr(T.repriceRevenue)}</text>
        {[...pts].sort((a, b) => b.revenue - a.revenue).map((p) => {
          const hit = reprice(p);
          const on = hover === p.id;
          const r = rs(p.revenue);
          const lab = labels.get(p.id);
          return (
            <Link key={p.id} href={`/customers/${p.id}`} onPointerEnter={() => setHover(p.id)} onFocus={() => setHover(p.id)} aria-label={`${p.name}, ${cr(p.revenue)}, ${p.margin.toFixed(1)}% margin`}>
              <circle
                cx={xs(p.revenue)}
                cy={ys(p.margin)}
                r={on ? r + 2 : r}
                fill={hit ? ACT : INK}
                fillOpacity={hover && !on ? 0.25 : hit ? 0.85 : 0.7}
                stroke="var(--surface)"
                strokeWidth={2}
                style={{ transition: "r 180ms cubic-bezier(0.16,1,0.3,1), fill-opacity 180ms" }}
              />
              {lab && (
                <text
                  x={lab.x}
                  y={lab.y}
                  textAnchor={lab.anchor}
                  fontSize="11"
                  fontWeight={hit || on ? 600 : 500}
                  fill={hit ? ACT_TEXT : "var(--ink)"}
                  fillOpacity={hover && !on ? 0.35 : 1}
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                >
                  {p.name}
                </text>
              )}
            </Link>
          );
        })}
      </svg>
      {active && (
        <div className="pointer-events-none absolute left-10 top-1 rounded-[6px] border border-edge bg-surface px-2.5 py-1.5 shadow-pop">
          <div className="text-[12px] font-semibold text-ink">{active.name}</div>
          <div className="font-num text-[11px] tabular-nums text-muted">
            {cr(active.revenue)} · <span className={reprice(active) ? "font-semibold text-danger-text" : "text-ink"}>{active.margin.toFixed(1)}% margin</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The top-five share as a ring, with the act line marked on it. */
export function ConcentrationRing({ share }: { share: number }) {
  const r = 12;
  const C = 2 * Math.PI * r;
  const hot = share > T.concentrationPct;
  const tick = (T.concentrationPct / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <span className="flex items-center gap-1.5" title={`Top five customers carry ${share.toFixed(0)}% of revenue`}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden>
        <circle cx="15" cy="15" r={r} stroke={GRID} strokeWidth="4" fill="none" />
        <circle cx="15" cy="15" r={r} stroke={hot ? ACT : INK} strokeWidth="4" fill="none" strokeDasharray={`${(share / 100) * C} ${C}`} transform="rotate(-90 15 15)" strokeLinecap="round" />
        <line x1={15 + (r - 4) * Math.cos(tick)} y1={15 + (r - 4) * Math.sin(tick)} x2={15 + (r + 4) * Math.cos(tick)} y2={15 + (r + 4) * Math.sin(tick)} stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
      <span className="leading-tight">
        <span className={`block font-num text-[12px] font-semibold tabular-nums ${hot ? "text-danger-text" : "text-ink"}`}>{share.toFixed(0)}%</span>
        <span className="block text-[9.5px] text-muted">top 5</span>
      </span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Receivables — donut by age + the accounts that matter
// ─────────────────────────────────────────────────────────────────────────────

const AR = [
  { label: "Not due", c: PALE },
  { label: "1–30 days", c: SOFT },
  { label: "31–60 days", c: MID },
  { label: "61–90 days", c: INK },
  { label: "90+ days", c: ACT },
];

export function ReceivablesDonut({ rows }: { rows: ReceivableRow[] }) {
  const sums = AR.map((_, i) => rows.reduce((s, r) => s + r.buckets[i]!, 0));
  const total = sums.reduce((a, b) => a + b, 0);
  const overdue = total - sums[0]!;
  const flagged = rows.filter((r) => r.buckets[4] > T.receivable90 || r.total > r.limit).slice(0, 3);
  const maxRow = Math.max(...flagged.map((r) => Math.max(r.total, r.limit)), 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Donut parts={AR.map((a, i) => ({ v: sums[i]!, c: a.c, label: a.label }))} center={cr(overdue)} sub="overdue" />
        <Legend items={AR.map((a, i) => ({ c: a.c, label: a.label, value: cr(sums[i]!), strong: i === 4 && sums[4]! > 0 }))} />
      </div>
      {flagged.length > 0 && (
        <ul className="flex flex-col gap-2.5 border-t border-edge/70 pt-3">
          {flagged.map((r) => (
            <li key={r.id}>
              <Link href={`/customers/${r.id}`} className="group block">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="truncate font-medium text-ink group-hover:underline">{r.name}</span>
                  <span className="font-num font-semibold tabular-nums text-danger-text">{cr(r.total)}</span>
                </div>
                <div className="relative mt-1 h-[6px] rounded-full bg-canvas">
                  <div className="flex h-full gap-[2px] overflow-hidden rounded-full" style={{ width: `${(r.total / maxRow) * 100}%` }}>
                    {r.buckets.map((b, i) => (b > 0 ? <span key={i} style={{ flexGrow: b, flexBasis: 0, background: AR[i]!.c }} /> : null))}
                  </div>
                  <span className="absolute -top-[3px] h-[12px] w-[2px] rounded-full bg-ink" style={{ left: `${(r.limit / maxRow) * 100}%` }} title="credit limit" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Funnel — a shape, not a bar list
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stages as stacked trapezoids, each as wide as its count. The rate beside each
 * is this quarter against its own trailing rate; the stage that fell is red.
 */
export function FunnelShape({ stages }: { stages: FunnelStage[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(300);
  const max = Math.max(stages[0]?.count ?? 1, 1);
  const rowH = 40;
  const funnelW = Math.max(120, Math.min(W - 110, 240));
  const half = (c: number) => Math.max(16, (c / max) * funnelW) / 2;
  const cx = funnelW / 2;
  const leak = (s: FunnelStage) => s.rate !== null && s.trailing !== null && s.trailing - s.rate >= T.funnelDropPts;

  return (
    <div ref={ref} className="flex gap-3">
      <svg width={funnelW} height={stages.length * rowH} className="shrink-0" role="img" aria-label={stages.map((s) => `${s.label} ${s.count}`).join(", ")}>
        {stages.map((s, i) => {
          const top = half(s.count);
          const bot = half(stages[i + 1]?.count ?? s.count * 0.85);
          const y = i * rowH;
          const hit = leak(s);
          return (
            <g key={s.label}>
              <path d={`M${cx - top},${y + 1} L${cx + top},${y + 1} L${cx + bot},${y + rowH - 2} L${cx - bot},${y + rowH - 2} Z`} fill={hit ? ACT : ([INK, MID, SOFT, PALE][i] ?? PALE)} />
              <text x={cx} y={y + rowH / 2 + 4} textAnchor="middle" className="font-num" fontSize="12" fontWeight={600} fill={i < 2 || hit ? "#fff" : "var(--ink)"}>
                {s.count}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col">
        {stages.map((s) => {
          const hit = leak(s);
          return (
            <li key={s.label} className="flex flex-col justify-center" style={{ height: rowH }}>
              <span className={`truncate text-[11.5px] ${hit ? "font-semibold text-danger-text" : "text-ink"}`}>{s.label}</span>
              {s.rate !== null ? (
                <span className="font-num text-[10.5px] tabular-nums text-muted">
                  <span className={`font-semibold ${hit ? "text-danger-text" : "text-ink"}`}>{s.rate.toFixed(0)}%</span>
                  {s.trailing !== null && <> · was {s.trailing.toFixed(0)}%</>}
                </span>
              ) : (
                <span className="text-[10.5px] text-muted">last 90 days</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Price moves — the list that inverts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The same price moves ranked by rupees a month or by %. Switching re-sorts the
 * rows in place (compositor-only translates) so the reader watches the list
 * invert: what moved most is rarely what cost most.
 */
export function PriceImpact({ moves }: { moves: PriceMove[] }) {
  const [mode, setMode] = useState<"inr" | "pct">("inr");
  const ROW = 25;
  const list = useMemo(() => moves.slice().sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 8), [moves]);
  const ranked = useMemo(
    () => [...list].sort((a, b) => (mode === "pct" ? Math.abs(b.changePct) - Math.abs(a.changePct) : Math.abs(b.impact) - Math.abs(a.impact))),
    [list, mode],
  );
  const rank = new Map(ranked.map((m, i) => [m.id, i]));
  const key = (m: PriceMove) => (mode === "pct" ? m.changePct : m.impact);
  const max = Math.max(...list.map((m) => Math.abs(key(m))), mode === "inr" ? T.priceImpactMonthly * 1.1 : 1);
  const scale = (v: number) => (Math.abs(v) / max) * 68;

  return (
    <div>
      <div role="radiogroup" aria-label="Rank by" className="mb-3 inline-flex rounded-full bg-canvas p-[3px]">
        {(["inr", "pct"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-[3px] text-[11px] font-semibold transition-colors duration-150 ${mode === m ? "bg-surface text-ink shadow-[0_1px_2px_rgba(33,46,48,0.16)]" : "text-muted hover:text-ink"}`}
          >
            {m === "inr" ? "₹ a month" : "% change"}
          </button>
        ))}
      </div>
      <div className="relative" style={{ height: list.length * ROW }}>
        {list.map((m) => {
          const v = key(m);
          const hot = mode === "inr" && m.impact > T.priceImpactMonthly;
          return (
            <div
              key={m.id}
              className="absolute inset-x-0 grid grid-cols-[minmax(0,104px)_1fr] items-center gap-2 transition-transform duration-500 ease-out motion-reduce:transition-none"
              style={{ height: ROW, transform: `translateY(${(rank.get(m.id) ?? 0) * ROW}px)` }}
            >
              <span className={`truncate text-right text-[11.5px] ${hot ? "font-semibold text-ink" : "text-muted"}`}>{m.name}</span>
              <div className="flex items-center gap-1.5">
                <div
                  className="h-[12px] rounded-r-[4px] transition-[width,background-color] duration-500 ease-out"
                  style={{ width: `${Math.max(1.5, scale(v))}%`, background: v < 0 ? PALE : hot ? ACT : mode === "inr" ? MID : INK }}
                />
                <span className="whitespace-nowrap font-num text-[10.5px] font-semibold tabular-nums text-ink">{mode === "pct" ? percent(m.changePct) : cr(m.impact)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <tbody>{list.map((m) => <tr key={m.id}><td>{m.name}</td><td>{percent(m.changePct)}</td><td>{cr(m.impact)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profit bridge — columns stepping down
// ─────────────────────────────────────────────────────────────────────────────

export function BridgeColumns({ steps: raw }: { steps: BridgeStep[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(300);
  // Overheads under 2% of revenue would be hairline bars with crowded labels:
  // they fold into one "Other costs" step so every bar left is readable.
  const steps = useMemo(() => {
    const rev = Math.abs(raw[0]?.value ?? 1);
    const small = raw.filter((s, i) => s.kind === "step" && i > 1 && Math.abs(s.value) < rev * 0.02);
    if (small.length < 2) return raw;
    const other = small.reduce((t, s) => t + s.value, 0);
    const kept = raw.filter((s) => !small.includes(s));
    const at = kept.length - 1;
    return [...kept.slice(0, at), { label: "Other costs", value: other, kind: "step" as const }, ...kept.slice(at)];
  }, [raw]);
  const H = 176;
  const top = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  const base = H - 22;
  const y = (v: number) => base - (v / top) * (base - 18);
  const n = steps.length;
  const slot = W / n;
  const bw = Math.min(34, slot * 0.62);
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === "total") {
      run = s.value;
      return { ...s, lo: Math.min(0, s.value), hi: Math.max(0, s.value), end: s.value };
    }
    const from = run;
    run += s.value;
    return { ...s, lo: Math.min(from, run), hi: Math.max(from, run), end: run };
  });
  const short = (l: string) =>
    l === "Cost of goods" ? "Goods" : l === "Gross profit" ? "Gross" : l === "Contribution" ? "Net" : l === "Other costs" ? "Other" : l.split(/[ &]/)[0]!;

  return (
    <div ref={ref}>
      <svg width={W} height={H} className="block" role="img" aria-label={steps.map((s) => `${s.label} ${cr(s.value)}`).join(", ")}>
        <line x1={0} x2={W} y1={base} y2={base} stroke={GRID} />
        {bars.map((b, i) => {
          const x = i * slot + (slot - bw) / 2;
          const y1 = y(b.hi);
          const y2 = y(b.lo);
          const total = b.kind === "total";
          const prev = bars[i - 1];
          return (
            <g key={b.label}>
              {prev && <line x1={(i - 1) * slot + (slot + bw) / 2} x2={x} y1={y(prev.end)} y2={y(prev.end)} stroke="var(--scroll)" strokeDasharray="2 2" />}
              <rect x={x} y={y1} width={bw} height={Math.max(2, y2 - y1)} rx={3} fill={total ? (b.value < 0 ? ACT : INK) : PALE} />
              <text x={x + bw / 2} y={y1 - 5} textAnchor="middle" className="font-num" fontSize="9.5" fontWeight={total ? 600 : 400} fill={total ? "var(--ink)" : "var(--muted)"}>
                {(Math.abs(b.value) / 1e7).toFixed(1)}
              </text>
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={total ? "var(--ink)" : "var(--muted)"} fontWeight={total ? 600 : 400}>
                {short(b.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock ageing — donut by age, bars by category
// ─────────────────────────────────────────────────────────────────────────────

const AGES = [
  { label: "0–30 days", c: INK },
  { label: "31–60 days", c: MID },
  { label: "61–90 days", c: SOFT },
  { label: "90+ days", c: ACT },
];

export function StockAgeing({ rows }: { rows: AgeingRow[] }) {
  const sums = AGES.map((_, i) => rows.reduce((s, r) => s + r.buckets[i]!, 0));
  const total = sums.reduce((a, b) => a + b, 0);
  const aged = sums[3]!;
  const max = Math.max(...rows.map((r) => r.total), 1);
  const name = (c: string) => (c === "FINISHED_COMPOUND" ? "Finished" : titleise(c));
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className="flex shrink-0 items-center gap-3 md:w-[300px]">
        <Donut parts={AGES.map((a, i) => ({ v: sums[i]!, c: a.c, label: a.label }))} center={`${total ? Math.round((aged / total) * 100) : 0}%`} sub="past 90 days" />
        <Legend items={AGES.map((a, i) => ({ c: a.c, label: a.label, value: cr(sums[i]!), strong: i === 3 }))} />
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-[7px]">
        {rows.slice(0, 7).map((r) => {
          const hot = r.buckets[3] > T.aged90;
          return (
            <li key={r.category} className="grid grid-cols-[90px_1fr_52px] items-center gap-2">
              <span className={`truncate text-right text-[11px] ${hot ? "font-semibold text-ink" : "text-muted"}`}>{name(r.category)}</span>
              <div className="flex h-[10px] gap-[2px]" style={{ width: `${Math.max(3, (r.total / max) * 100)}%` }}>
                {r.buckets.map((b, i) => (b > 0 ? <span key={i} className="h-full first:rounded-l-[3px] last:rounded-r-[3px]" style={{ flexGrow: b, flexBasis: 0, minWidth: 2, background: AGES[i]!.c }} /> : null))}
              </div>
              <span className={`text-right font-num text-[10.5px] tabular-nums ${hot ? "font-semibold text-danger-text" : "text-muted"}`}>{cr(hot ? r.buckets[3] : r.total)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost sheet drift — dumbbells
// ─────────────────────────────────────────────────────────────────────────────

export function CostDrift({ grades }: { grades: GradeCost[] }) {
  const lo = Math.min(...grades.map((g) => Math.min(g.frozen, g.today))) * 0.95;
  const hi = Math.max(...grades.map((g) => Math.max(g.frozen, g.today))) * 1.03;
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <div>
      <ul className="flex flex-col">
        {grades.map((g) => {
          const hot = Math.abs(g.driftPct) > T.driftPct;
          const l = Math.min(x(g.frozen), x(g.today));
          const r = Math.max(x(g.frozen), x(g.today));
          return (
            <li key={g.costSheetId}>
              <Link href={`/sales/cost-sheets/${g.costSheetId}`} className="grid h-[26px] grid-cols-[66px_1fr_44px] items-center gap-2 rounded-[4px] px-1 transition-colors duration-150 hover:bg-faint">
                <span className={`truncate font-num text-[10.5px] tabular-nums ${hot ? "font-semibold text-ink" : "text-muted"}`}>{g.grade}</span>
                <div className="relative h-full">
                  <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: `${l}%`, width: `${r - l}%`, background: hot ? ACT : SOFT }} />
                  <span className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted/70 bg-surface" style={{ left: `${x(g.frozen)}%` }} />
                  <span className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(g.today)}%`, background: hot ? ACT : INK }} />
                </div>
                <span className={`text-right font-num text-[10.5px] font-semibold tabular-nums ${hot ? "text-danger-text" : "text-muted"}`}>{percent(g.driftPct)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex gap-3 text-[10.5px] text-muted">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border-2 border-muted/70" />frozen</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: INK }} />today</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A kilo's cost — one bar per grade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One grade's kilo as a single bar cut into what it is made of and the margin
 * left over. Switching grade re-cuts the bar in place. The input carrying over
 * 40% of cost is the one a second source would move, so it is the one in red.
 */
export function KiloCost({ grades }: { grades: GradeCost[] }) {
  const [sel, setSel] = useState(0);
  const g = grades[sel] ?? grades[0];
  if (!g) return null;
  const material = g.inputs.reduce((s, i) => s + i.cost, 0);
  const overhead = (material + g.conversion) * (g.overheadPct / 100);
  const total = material + g.conversion + overhead;
  const margin = g.sellingRate - total;
  const span = Math.max(g.sellingRate, total);
  const main = g.inputs[0]!;
  const share = (main.cost / total) * 100;
  const parts = [
    { label: main.name, v: main.cost, c: share > T.inputSharePct ? ACT : INK },
    { label: "Other inputs", v: material - main.cost, c: MID },
    { label: "Conversion", v: g.conversion, c: SOFT },
    { label: "Overhead", v: overhead, c: PALE },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1" role="radiogroup" aria-label="Grade">
        {grades.map((x, i) => (
          <button
            key={x.costSheetId}
            type="button"
            role="radio"
            aria-checked={i === sel}
            onClick={() => setSel(i)}
            className={`rounded-full px-2 py-[2px] font-num text-[10.5px] font-medium tabular-nums transition-colors duration-150 ${i === sel ? "bg-primary text-surface" : "bg-canvas text-muted hover:text-ink"}`}
          >
            {x.grade}
          </button>
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-num text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
          ₹{g.sellingRate.toFixed(0)}
          <span className="text-[12px] font-normal text-muted">/kg</span>
        </span>
        <span className={`font-num text-[12px] font-semibold tabular-nums ${margin < 0 ? "text-danger-text" : "text-success-text"}`}>₹{margin.toFixed(1)} margin</span>
      </div>
      <div className="mt-2 flex h-[22px] gap-[2px] overflow-hidden rounded-[5px]">
        {parts.map((p) => (
          <span key={p.label} className="h-full transition-[flex-grow] duration-500 ease-out" style={{ flexGrow: Math.max(0, p.v) / span, flexBasis: 0, background: p.c }} title={`${p.label} ₹${p.v.toFixed(1)}`} />
        ))}
        <span className="screen h-full text-success transition-[flex-grow] duration-500 ease-out" style={{ flexGrow: Math.max(0, margin) / span, flexBasis: 0 }} title={`Margin ₹${margin.toFixed(1)}`} />
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[11px]">
            <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.c }} />
            <span className="min-w-0 flex-1 truncate text-muted">{p.label}</span>
            <span className="font-num tabular-nums text-ink">{((p.v / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
