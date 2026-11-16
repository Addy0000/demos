import { prisma } from "@/lib/prisma";

/**
 * The dashboard's trend layer.
 *
 * Everything here answers a question the queue panels underneath cannot: they
 * show what is waiting now, these show which way it has been moving. Each
 * function returns plain numbers — Prisma `Decimal` never crosses into a client
 * component, so the conversion happens here rather than at four call sites.
 *
 * The window is twelve months throughout, so the four figures are read against
 * the same period without the operator having to check four different ranges.
 */

export const MONTHS = 12;

export type MonthPoint = { key: string; label: string; year: number };

/** The last `MONTHS` calendar months, oldest first, ending with the current one. */
export function monthWindow(now = new Date()): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short", timeZone: "UTC" }),
      year: d.getUTCFullYear(),
    });
  }
  return out;
}

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Purchase spend by month
// ─────────────────────────────────────────────────────────────────────────────

export type SpendMonth = {
  key: string;
  label: string;
  year: number;
  value: number;
  orders: number;
  /** The month still being lived through. Drawn provisionally, never as a fall. */
  partial: boolean;
};

export async function spendByMonth(): Promise<SpendMonth[]> {
  const window = monthWindow();
  const from = new Date(`${window[0]!.key}-01T00:00:00.000Z`);

  const rows = await prisma.$queryRaw<{ k: string; total: number; orders: bigint }[]>`
    SELECT to_char(date_trunc('month', "orderedOn"), 'YYYY-MM') AS k,
           COALESCE(SUM("totalValue"), 0)::float AS total,
           COUNT(*) AS orders
    FROM "PurchaseOrder"
    WHERE "orderedOn" >= ${from}
      AND status NOT IN ('CANCELLED', 'DRAFT')
    GROUP BY 1
  `;

  const byKey = new Map(rows.map((r) => [r.k, r]));
  const current = monthKey(new Date());

  return window.map((m) => ({
    ...m,
    value: byKey.get(m.key)?.total ?? 0,
    orders: Number(byKey.get(m.key)?.orders ?? 0),
    partial: m.key === current,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Raw-material cost index
// ─────────────────────────────────────────────────────────────────────────────

export type IndexMonth = { key: string; label: string; year: number; index: number };

export type CostIndex = {
  series: IndexMonth[];
  /** How many materials the basket actually priced. */
  basket: number;
  /** Percent drift from the first month to the last. */
  drift: number;
};

/**
 * A fixed-basket (Laspeyres) index over the approved rate base, rebased to 100
 * at the start of the window.
 *
 * Weighting matters here and a simple mean would mislead: resin is roughly two
 * thirds of what this plant actually buys, so a pigment doubling would move an
 * equal-weighted average about as much as resin moving a few percent — and the
 * operator would read a cost shock that the business never felt. The basket is
 * therefore weighted by the quantity of each material actually purchased over
 * the window, which is the quantity the price is paid on.
 */
export async function costIndex(): Promise<CostIndex> {
  const window = monthWindow();
  const from = new Date(`${window[0]!.key}-01T00:00:00.000Z`);

  const [prices, weights] = await Promise.all([
    // Every rate that has ever been live, including the ones since superseded —
    // the superseded rows ARE the history this index is drawn from.
    prisma.materialPrice.findMany({
      where: { status: { in: ["APPROVED", "SUPERSEDED"] } },
      select: { materialId: true, pricePerKg: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    }),
    prisma.$queryRaw<{ materialId: string; qty: number }[]>`
      SELECT l."materialId", SUM(l."quantityKg")::float AS qty
      FROM "PurchaseOrderLine" l
      JOIN "PurchaseOrder" p ON p.id = l."purchaseOrderId"
      WHERE p."orderedOn" >= ${from}
        AND p.status NOT IN ('CANCELLED', 'DRAFT')
      GROUP BY 1
    `,
  ]);

  const weight = new Map(weights.map((w) => [w.materialId, w.qty]));

  // Flatten to one rate per material per point in time, cheapest to scan.
  const history = prices.map((p) => ({
    materialId: p.materialId,
    price: Number(p.pricePerKg),
    at: p.effectiveFrom.getTime(),
  }));

  /** The rate in force for each weighted material at the end of a given month. */
  function basketAt(endOfMonth: number) {
    const latest = new Map<string, number>();
    for (const h of history) {
      if (h.at <= endOfMonth && weight.has(h.materialId)) latest.set(h.materialId, h.price);
    }
    return latest;
  }

  const ends = window.map((m) => {
    const [y, mo] = m.key.split("-").map(Number);
    return Date.UTC(y!, mo!, 0, 23, 59, 59, 999); // last instant of that month
  });

  const baseline = basketAt(ends[0]!);
  // Only materials priced in the FIRST month can be indexed — one joining later
  // would otherwise arrive as a step change that is not a price movement at all.
  const members = [...baseline.keys()].filter((id) => (weight.get(id) ?? 0) > 0);

  const baseCost = members.reduce((s, id) => s + baseline.get(id)! * weight.get(id)!, 0);

  const series: IndexMonth[] = window.map((m, i) => {
    if (!baseCost) return { ...m, index: 100 };
    const live = basketAt(ends[i]!);
    const cost = members.reduce(
      (s, id) => s + (live.get(id) ?? baseline.get(id)!) * weight.get(id)!,
      0,
    );
    return { ...m, index: (cost / baseCost) * 100 };
  });

  const last = series[series.length - 1]!.index;
  return { series, basket: members.length, drift: last - 100 };
}
