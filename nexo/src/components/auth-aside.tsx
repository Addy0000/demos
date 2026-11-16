"use client";

import Link from "next/link";
import { useTenant } from "@/components/appearance";
import { BrandMark, Wordmark } from "@/components/brand";
import { PolymerChain } from "@/components/polymer-chain";
import type { TenantKey } from "@/lib/tenants";

/**
 * The left rail of every sign-in screen: the company the person is signing in
 * to, drawn in its own palette, with a motif from its own trade. The mark and
 * name carry the same view-transition names as the company picker, so the
 * company you chose travels here rather than reappearing.
 */
export function AuthAside() {
  const t = useTenant();
  return (
    <aside className="relative flex flex-col items-center justify-center gap-10 overflow-hidden bg-nav-deep px-6 py-6 lg:px-12 lg:py-12">
      <Motif tenant={t.key} className="hidden w-[min(300px,72%)] lg:block" />
      <div className="flex flex-col items-center text-center">
        <span style={{ viewTransitionName: "brand-mark" }} className="text-white">
          <BrandMark tenant={t.key} size={64} className="h-11 w-11 lg:h-16 lg:w-16" />
        </span>
        <span style={{ viewTransitionName: "brand-name" }} className="mt-4 text-white">
          <Wordmark tenant={t.key} className="block text-[26px] leading-none lg:text-[34px]" />
        </span>
        <p className="mt-3 hidden max-w-[34ch] text-[12.5px] leading-relaxed text-nav-text lg:block">{t.descriptor}</p>
      </div>
      <Link
        href="/select"
        className="absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded px-2 py-1 text-[11.5px] text-nav-dim underline-offset-4 transition-colors duration-150 hover:text-white hover:underline lg:block"
      >
        Not {t.short}? Choose another company
      </Link>
    </aside>
  );
}

/** A small drawing of what the company actually does. */
function Motif({ tenant, className }: { tenant: TenantKey; className: string }) {
  if (tenant === "tangent" || tenant === "duplast") return <PolymerChain className={className} />;
  if (tenant === "trident") {
    // Rows of hex nuts, three of them in the action colour: a heat lot pulled for inspection.
    const hex = (cx: number, cy: number, r: number) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
    const picked = new Set(["0-2", "1-5", "2-1"]);
    return (
      <svg viewBox="0 0 220 132" fill="none" className={className} aria-hidden>
        {[0, 1, 2].map((r) =>
          Array.from({ length: 7 }, (_, c) => {
            const cx = 20 + c * 30 + (r % 2 ? 15 : 0);
            const cy = 24 + r * 42;
            const on = picked.has(`${r}-${c}`);
            return (
              <g key={`${r}-${c}`}>
                <polygon points={hex(cx, cy, 12)} stroke={on ? "var(--accent)" : "rgba(255,255,255,0.22)"} strokeWidth={1.5} fill={on ? "var(--primary)" : "none"} />
                <circle cx={cx} cy={cy} r={4.6} stroke={on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.18)"} strokeWidth={1.4} />
              </g>
            );
          }),
        )}
      </svg>
    );
  }
  if (tenant === "harvest") {
    // Cartons on a pallet, each stamped with its batch; one batch is nearing its best-before date.
    return (
      <svg viewBox="0 0 220 132" fill="none" className={className} aria-hidden>
        {[0, 1, 2].map((r) =>
          Array.from({ length: 5 }, (_, c) => {
            const x = 14 + c * 40 + (r === 1 ? 20 : 0);
            const y = 12 + r * 38;
            if (r === 1 && c === 4) return null;
            const on = r === 2 && c === 1;
            return (
              <g key={`${r}-${c}`}>
                <rect x={x} y={y} width={34} height={30} rx={2} stroke={on ? "var(--accent)" : "rgba(255,255,255,0.22)"} strokeWidth={1.5} fill={on ? "var(--primary)" : "none"} />
                <path d={`M${x + 6} ${y + 20}h22M${x + 6} ${y + 24}h14`} stroke={on ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.18)"} strokeWidth={1.4} />
              </g>
            );
          }),
        )}
      </svg>
    );
  }
  if (tenant === "meridian") {
    // A hub and its branches, with one route out for delivery today.
    const nodes = [[110, 66], [36, 26], [184, 22], [196, 100], [40, 108], [110, 14], [150, 120]] as const;
    return (
      <svg viewBox="0 0 220 132" fill="none" className={className} aria-hidden>
        {nodes.slice(1).map(([x, y], i) => (
          <line key={i} x1={110} y1={66} x2={x} y2={y} stroke={i === 2 ? "var(--accent)" : "rgba(255,255,255,0.2)"} strokeWidth={i === 2 ? 2 : 1.4} strokeDasharray={i === 2 ? "4 4" : undefined} />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 11 : 6} fill={i === 0 ? "var(--primary)" : "none"} stroke={i === 3 ? "var(--accent)" : "rgba(255,255,255,0.4)"} strokeWidth={1.6} />
        ))}
      </svg>
    );
  }
  if (tenant === "loomcraft") {
    // Warp and weft, with one pick of the weft dyed in the action colour.
    return (
      <svg viewBox="0 0 220 132" fill="none" className={className} aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`w${i}`} x1={14 + i * 19} x2={14 + i * 19} y1={4} y2={128} stroke="rgba(255,255,255,0.16)" strokeWidth={5} />
        ))}
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 11 }, (_, c) =>
            (r + c) % 2 ? null : (
              <rect key={`${r}-${c}`} x={6 + c * 19} y={12 + r * 20} width={16} height={7} rx={1} fill={r === 3 ? "var(--primary)" : "rgba(255,255,255,0.3)"} />
            ),
          ),
        )}
      </svg>
    );
  }
  // Raj and Kestrel: an engagement plan, bars across weeks, today's line through it.
  const bars = [
    [8, 70, 0.9], [40, 90, 0.6], [70, 64, 0.3], [24, 120, 0.75], [110, 80, 0.15], [96, 100, 0.45],
  ] as const;
  return (
    <svg viewBox="0 0 220 132" fill="none" className={className} aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1={8 + i * 28} x2={8 + i * 28} y1={4} y2={128} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}
      {bars.map(([x, w, done], i) => (
        <g key={i}>
          <rect x={x} y={10 + i * 20} width={w} height={9} rx={2} fill="rgba(255,255,255,0.12)" />
          <rect x={x} y={10 + i * 20} width={w * done} height={9} rx={2} fill={i === 3 ? "var(--primary)" : "rgba(255,255,255,0.32)"} />
        </g>
      ))}
      <line x1={128} x2={128} y1={2} y2={130} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 3" />
    </svg>
  );
}
