/**
 * Indian locale throughout — lakh/crore grouping, DD-MM-YYYY dates.
 * Taken from the "₹ 24,75,000" formatting in the supplied palette sheet.
 */

type Num = number | string | { toString(): string } | null | undefined;

const toNum = (v: Num): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
};

const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr3 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** ₹ 24,75,000 */
export function money(v: Num, decimals: 0 | 2 = 0): string {
  const n = toNum(v);
  return `₹ ${(decimals === 2 ? inr2 : inr0).format(n)}`;
}

/** 24,75,000.00 — no symbol, for right-aligned numeric grid columns. */
export function amount(v: Num, decimals: 0 | 2 = 2): string {
  return (decimals === 2 ? inr2 : inr0).format(toNum(v));
}

/** Compact Indian scale: 2.48 Cr / 4.75 L / 24,500 */
export function compactInr(v: Num): string {
  const n = toNum(v);
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹ ${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹ ${(n / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `₹ ${inr0.format(n)}`;
  return `₹ ${inr0.format(n)}`;
}

/** Weight in KG with 3dp, or auto-scaled to MT past a tonne. */
export function kg(v: Num, forceKg = false): string {
  const n = toNum(v);
  if (!forceKg && Math.abs(n) >= 1000) return `${inr2.format(n / 1000)} MT`;
  return `${inr3.format(n)} kg`;
}

export function kgPlain(v: Num): string {
  return inr3.format(toNum(v));
}

export function ratePerKg(v: Num): string {
  return `₹ ${inr2.format(toNum(v))}`;
}

export function percent(v: Num, decimals = 1): string {
  const n = toNum(v);
  return `${n > 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 12-08-2026 */
export function date(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}-${String(dt.getMonth() + 1).padStart(2, "0")}-${dt.getFullYear()}`;
}

/** 12 Aug 2026 */
export function dateLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** 12-08-2026 14:32 */
export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return `${date(dt)} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/** "3 days ago", "in 12 days" — for freshness columns. */
export function relative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  const diff = dt.getTime() - Date.now();
  const days = Math.round(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  const a = Math.abs(days);
  if (a < 31) return `${a} days ago`;
  const m = Math.round(a / 30);
  if (m < 12) return `${m} month${m === 1 ? "" : "s"} ago`;
  const y = (a / 365).toFixed(1);
  return `${y} years ago`;
}

/** SCREAMING_SNAKE enum → "Screaming snake" for display. */
export function humanise(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Enum → Title Case, preserving known acronyms. */
const ACRONYMS = new Set(["PVC", "TDS", "SDS", "COA", "ROHS", "REACH", "GRN", "PO", "QC", "UOM", "HSN", "GST", "MOQ", "FR", "LOI", "MT", "KG"]);
export function titleise(v: string | null | undefined): string {
  if (!v) return "—";
  return v
    .split("_")
    .map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
