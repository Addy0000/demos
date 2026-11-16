"use client";

import type { TenantKey } from "@/lib/tenants";
import { TENANTS } from "@/lib/tenants";

/**
 * Each company's mark and wordmark. Marks are authored for this demo from each
 * company's own trade: a line touching a circle for Tangent, two offset sheets
 * for Duplast, a hex nut for Trident, a three-bar plan for Raj, a sun over
 * furrows for Harvest Grove, a meridian through a globe for Meridian, a roof
 * truss for Kestrel and a woven square for Loomcraft. They are drawn in
 * currentColor with one accent, so they sit on any palette.
 */

const MARK_FONT: Record<TenantKey, string> = {
  tangent: "var(--font-sans)",
  duplast: "var(--font-mark-duplast), var(--font-sans)",
  trident: "var(--font-mark-trident), var(--font-sans)",
  raj: "var(--font-mark-raj), var(--font-sans)",
  harvest: "var(--font-mark-harvest), Georgia, serif",
  meridian: "var(--font-mark-meridian), var(--font-sans)",
  kestrel: "var(--font-mark-kestrel), var(--font-sans)",
  loomcraft: "var(--font-mark-loomcraft), Georgia, serif",
};

const MARK_WEIGHT: Record<TenantKey, number> = {
  tangent: 600, duplast: 600, trident: 700, raj: 600, harvest: 400, meridian: 700, kestrel: 600, loomcraft: 600,
};
const MARK_UPPER = new Set<TenantKey>(["trident", "kestrel"]);

const MARK_TRACK: Record<TenantKey, string> = {
  tangent: "-0.035em",
  duplast: "-0.03em",
  trident: "0.02em",
  raj: "-0.01em",
  harvest: "0em",
  meridian: "-0.025em",
  kestrel: "0.06em",
  loomcraft: "-0.005em",
};

export function BrandMark({
  tenant,
  size = 24,
  accent = "rgb(var(--c-brand))",
  className = "",
}: {
  tenant: TenantKey;
  size?: number;
  accent?: string;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    "aria-hidden": true as const,
    className,
  };
  switch (tenant) {
    case "tangent":
      return (
        <svg {...common}>
          <circle cx="13" cy="18" r="9" stroke="currentColor" strokeWidth="2.4" />
          <path d="M4.6 6.2 29 14.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="17.3" y="8.4" width="4.2" height="4.2" transform="rotate(19 19.4 10.5)" fill={accent} />
        </svg>
      );
    case "duplast":
      return (
        <svg {...common}>
          <rect x="3.5" y="9.5" width="17" height="17" rx="3.5" fill={accent} opacity="0.9" />
          <rect x="11.5" y="5.5" width="17" height="17" rx="3.5" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      );
    case "trident":
      return (
        <svg {...common}>
          <path d="M16 3.2 27.1 9.6v12.8L16 28.8 4.9 22.4V9.6Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="16" cy="16" r="5.2" stroke={accent} strokeWidth="2.4" />
        </svg>
      );
    case "raj":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="25" height="25" rx="5" stroke="currentColor" strokeWidth="2.2" />
          <path d="M9 11h8M12.5 16h10.5M9 21h6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="22.6" cy="11" r="1.9" fill={accent} />
        </svg>
      );
    case "harvest":
      return (
        <svg {...common}>
          <path d="M6.5 18.5a9.5 9.5 0 0 1 19 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M3.5 23h25M8 28h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="16" cy="18.5" r="3.6" fill={accent} />
        </svg>
      );
    case "meridian":
      return (
        <svg {...common}>
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.4" />
          <ellipse cx="16" cy="16" rx="5.2" ry="12" stroke="currentColor" strokeWidth="2.2" />
          <path d="M4.6 16h22.8" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "kestrel":
      return (
        <svg {...common}>
          <path d="M3.5 25.5 16 6l12.5 19.5Z" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M9.8 25.5 16 15.8l6.2 9.7M16 15.8v9.7" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
          <circle cx="16" cy="6" r="2.6" fill={accent} />
        </svg>
      );
    case "loomcraft":
      return (
        <svg {...common}>
          <path d="M11 4v24M21 4v24" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M4 11h5M13 11h6M23 11h5M4 21h5M13 21h6M23 21h5" stroke={accent} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
  }
}

export function Wordmark({
  tenant,
  className = "",
  short = false,
}: {
  tenant: TenantKey;
  className?: string;
  short?: boolean;
}) {
  const t = TENANTS[tenant];
  const text = short ? t.short : t.name;
  return (
    <span
      className={`${MARK_UPPER.has(tenant) ? "uppercase" : ""} ${className}`}
      style={{ fontFamily: MARK_FONT[tenant], letterSpacing: MARK_TRACK[tenant], fontWeight: MARK_WEIGHT[tenant] }}
    >
      {text}
    </span>
  );
}

/** Mark and wordmark together, as the lockup the company would sign with. */
export function Lockup({
  tenant,
  size = 24,
  className = "",
  textClass = "text-[16px]",
  short = false,
}: {
  tenant: TenantKey;
  size?: number;
  className?: string;
  textClass?: string;
  short?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark tenant={tenant} size={size} className="shrink-0" />
      <Wordmark tenant={tenant} className={`leading-none ${textClass}`} short={short} />
    </span>
  );
}
