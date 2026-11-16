import { prisma } from "@/lib/prisma";
import { monthWindow } from "./insights";
import { ACT_AT } from "./act-at";

/**
 * The dashboard's altitude layer — the metrics deck ("Metrics that earn a
 * screen"), read against this database.
 *
 * Every figure here has to pass the deck's test: one named owner, a threshold
 * drawn on the chart, a specific next action, a cadence. The thresholds live in
 * `act-at.ts`, shared with the charts that draw them.
 *
 * Like `insights.ts`, nothing here returns a Prisma `Decimal`; every value is
 * converted to a plain number before it crosses into a client component.
 */

const DAY = 86_400_000;
const ageDays = (d: Date | null) => (d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY)) : 0);

// ─────────────────────────────────────────────────────────────────────────────
// Decision maker
// ─────────────────────────────────────────────────────────────────────────────

export type Exception = {
  key: string;
  label: string;
  /** Rupees where the exception carries a value; otherwise a count is the figure. */
  value: number | null;
  count: number;
  unit: string;
  oldestDays: number;
  detail?: string;
  owner: string;
  href: string;
};

/**
 * Deck p21 / p31: every document that should exist and does not, as one value
 * with an age and an owner. The executive screen is a router, not a destination
 * — each row opens the queue that clears it.
 */
export async function exceptions(): Promise<Exception[]> {
  const [unbilled, unposted, unmatched, unreturned, stale, drift] = await Promise.all([
    prisma.$queryRaw<{ n: number; v: number; oldest: Date | null }[]>`
      SELECT COUNT(DISTINCT d.id)::int AS n,
             COALESCE(SUM(l."quantityKg" * l."ratePerKg"), 0)::float AS v,
             MIN(d."dispatchedOn") AS oldest
      FROM "DeliveryChallan" d
      JOIN "DeliveryChallanLine" l ON l."challanId" = d.id
      WHERE d.status IN ('DISPATCHED', 'DELIVERED')
        AND NOT EXISTS (SELECT 1 FROM "SalesInvoice" i WHERE i."challanId" = d.id AND i.status <> 'CANCELLED')
    `,
    prisma.$queryRaw<{ n: number; v: number; oldest: Date | null }[]>`
      SELECT COUNT(DISTINCT g.id)::int AS n,
             COALESCE(SUM(gl."receivedQtyKg" * pl."ratePerKg"), 0)::float AS v,
             MIN(g."receivedOn") AS oldest
      FROM "GoodsReceipt" g
      JOIN "GoodsReceiptLine" gl ON gl."goodsReceiptId" = g.id
      JOIN "PurchaseOrderLine" pl ON pl.id = gl."purchaseOrderLineId"
      WHERE g.status IN ('DRAFT', 'PENDING_QC', 'QC_PASSED')
    `,
    prisma.$queryRaw<{ n: number; v: number; oldest: Date | null }[]>`
      SELECT COUNT(DISTINCT g.id)::int AS n,
             COALESCE(SUM(gl."acceptedQtyKg" * pl."ratePerKg"), 0)::float AS v,
             MIN(g."receivedOn") AS oldest
      FROM "GoodsReceipt" g
      JOIN "GoodsReceiptLine" gl ON gl."goodsReceiptId" = g.id
      JOIN "PurchaseOrderLine" pl ON pl.id = gl."purchaseOrderLineId"
      WHERE g.status IN ('POSTED', 'PARTIALLY_ACCEPTED')
        AND NOT EXISTS (SELECT 1 FROM "VendorBill" b WHERE b."goodsReceiptId" = g.id AND b.status <> 'VOID')
    `,
    prisma.$queryRaw<{ n: number; v: number; oldest: Date | null }[]>`
      SELECT COUNT(DISTINCT g.id)::int AS n,
             COALESCE(SUM(gl."rejectedQtyKg" * pl."ratePerKg"), 0)::float AS v,
             MIN(g."receivedOn") AS oldest
      FROM "GoodsReceipt" g
      JOIN "GoodsReceiptLine" gl ON gl."goodsReceiptId" = g.id
      JOIN "PurchaseOrderLine" pl ON pl.id = gl."purchaseOrderLineId"
      WHERE gl."rejectedQtyKg" > 0
        AND NOT EXISTS (SELECT 1 FROM "VendorRejectionNote" r WHERE r."goodsReceiptId" = g.id AND r.status <> 'CANCELLED')
    `,
    staleAllocations(),
    costDrift(),
  ]);

  const row = (r: { n: number; v: number; oldest: Date | null }[]) => r[0] ?? { n: 0, v: 0, oldest: null };
  const u = row(unbilled), p = row(unposted), m = row(unmatched), j = row(unreturned);
  const diverged = drift.filter((g) => Math.abs(g.driftPct) > ACT_AT.driftPct);
  const staleValue = stale.allocations.reduce((s, a) => s + a.value, 0);

  const out: Exception[] = [
    { key: "unbilled", label: "Despatched, not invoiced", value: u.v, count: u.n, unit: u.n === 1 ? "challan" : "challans", oldestDays: ageDays(u.oldest), owner: "Finance", href: "/sales/dispatch" },
    { key: "unmatched", label: "Received, no vendor bill", value: m.v, count: m.n, unit: m.n === 1 ? "receipt" : "receipts", oldestDays: ageDays(m.oldest), owner: "Finance", href: "/finance/payable" },
    { key: "unposted", label: "Received, GRN not posted", value: p.v, count: p.n, unit: p.n === 1 ? "receipt" : "receipts", oldestDays: ageDays(p.oldest), owner: "Stores", href: "/procurement/grn" },
    { key: "unreturned", label: "Rejected, no debit note", value: j.v, count: j.n, unit: j.n === 1 ? "lot" : "lots", oldestDays: ageDays(j.oldest), owner: "Purchase", href: "/procurement/rejections" },
    { key: "stale", label: "Allocation held by a closed order", value: staleValue, count: stale.allocations.length, unit: stale.allocations.length === 1 ? "allocation" : "allocations", oldestDays: Math.max(0, ...stale.allocations.map((a) => a.days)), owner: "Planning", href: "/planning" },
    {
      key: "drift", label: `Cost sheet diverged past ${ACT_AT.driftPct}%`, value: null, count: diverged.length, unit: diverged.length === 1 ? "grade" : "grades",
      oldestDays: 0, owner: "Finance", href: "/sales/cost-sheets",
      detail: diverged.length ? `widest ${diverged.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct))[0]!.grade}` : undefined,
    },
  ];
  // Clear ones sink; what is open is ranked by what it is worth.
  return out.sort((a, b) => Number(b.count > 0) - Number(a.count > 0) || (b.value ?? 0) - (a.value ?? 0));
}

export type Trend = {
  /** The figure as read now (or for the last closed month, where it is a flow). */
  value: number;
  /** Against the comparison point, in the figure's own unit. */
  delta: number;
  series: { label: string; value: number; partial?: boolean }[];
  /** What the delta is measured against, in words. */
  against: string;
  period: string;
};

export type Trends = { revenue: Trend; margin: Trend; cycle: Trend; orderBook: Trend };

export type CashCycle = {
  receivableDays: number;
  inventoryDays: number;
  payableDays: number;
  cycle: number;
  priorCycle: number;
  receivables: number;
  inventory: number;
  payables: number;
};

/**
 * Revenue, gross margin and the order book by month, and the cash conversion
 * cycle read at each month end. One query per measure, each over the same
 * twelve-month window as the trend band below it.
 *
 * The cycle is reconstructed rather than snapshotted: receivables and payables
 * at a month end are what was raised by then less what had been paid by then
 * (from the dated payment postings), and stock is the stock ledger replayed to
 * that instant. So the line is what the books actually said on each date.
 */
export async function trends(): Promise<{ trends: Trends; cycle: CashCycle }> {
  const window = monthWindow();
  const from = new Date(`${window[0]!.key}-01T00:00:00.000Z`);

  const [sales, ends] = await Promise.all([
    prisma.$queryRaw<{ k: string; revenue: number; cogs: number }[]>`
      SELECT to_char(date_trunc('month', i."invoiceDate"), 'YYYY-MM') AS k,
             SUM(i.subtotal)::float AS revenue,
             COALESCE(SUM(c.cost), 0)::float AS cogs
      FROM "SalesInvoice" i
      LEFT JOIN LATERAL (
        SELECT SUM(l."quantityKg" * b."ratePerKg") AS cost
        FROM "DeliveryChallanLine" l JOIN "InventoryBatch" b ON b.id = l."batchId"
        WHERE l."challanId" = i."challanId"
      ) c ON true
      WHERE i."invoiceDate" >= ${from} AND i.status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY 1
    `,
    // One row per month end, plus "now" as the last point.
    prisma.$queryRaw<{ at: Date; ar: number; ap: number; inv: number; rev90: number; cogs90: number; buy90: number; book: number }[]>`
      WITH pts AS (
        SELECT (date_trunc('month', g) + interval '1 month' - interval '1 second') AS at
        FROM generate_series(${from}::timestamp, date_trunc('month', now()) - interval '1 month', interval '1 month') g
        UNION ALL SELECT now()::timestamp
      )
      SELECT pts.at,
        (SELECT COALESCE(SUM("totalValue"), 0) FROM "SalesInvoice" WHERE status NOT IN ('DRAFT','CANCELLED') AND "invoiceDate" <= pts.at)
          - (SELECT COALESCE(SUM(lp.amount), 0) FROM "LedgerPosting" lp JOIN "ChartOfAccount" a ON a.id = lp."accountId"
             WHERE a.code = '1100' AND lp.side = 'CREDIT' AND lp."sourceType" IN ('PAYMENT', 'CREDIT_NOTE') AND lp."postedAt" <= pts.at) AS ar,
        (SELECT COALESCE(SUM("totalValue"), 0) FROM "VendorBill" WHERE status <> 'VOID' AND "billDate" <= pts.at)
          - (SELECT COALESCE(SUM(lp.amount), 0) FROM "LedgerPosting" lp JOIN "ChartOfAccount" a ON a.id = lp."accountId"
             WHERE a.code = '2000' AND lp.side = 'DEBIT' AND lp."sourceType" IN ('PAYMENT', 'DEBIT_NOTE') AND lp."postedAt" <= pts.at) AS ap,
        (SELECT COALESCE(SUM(m."quantityKg" * b."ratePerKg"), 0) FROM "StockMovement" m JOIN "InventoryBatch" b ON b.id = m."batchId"
         WHERE m."occurredAt" <= pts.at) AS inv,
        (SELECT COALESCE(SUM(subtotal), 0) FROM "SalesInvoice" WHERE status NOT IN ('DRAFT','CANCELLED')
         AND "invoiceDate" > pts.at - interval '90 days' AND "invoiceDate" <= pts.at) AS rev90,
        (SELECT COALESCE(SUM(l."quantityKg" * b."ratePerKg"), 0) FROM "DeliveryChallan" d
         JOIN "DeliveryChallanLine" l ON l."challanId" = d.id JOIN "InventoryBatch" b ON b.id = l."batchId"
         WHERE d."dispatchedOn" > pts.at - interval '90 days' AND d."dispatchedOn" <= pts.at) AS cogs90,
        (SELECT COALESCE(SUM(subtotal), 0) FROM "VendorBill" WHERE status <> 'VOID'
         AND "billDate" > pts.at - interval '90 days' AND "billDate" <= pts.at) AS buy90,
        (SELECT COALESCE(SUM(subtotal), 0) FROM "SalesOrder" WHERE status NOT IN ('DRAFT','CANCELLED','PENDING_APPROVAL') AND "orderedOn" <= pts.at)
          - (SELECT COALESCE(SUM(l."quantityKg" * l."ratePerKg"), 0) FROM "DeliveryChallan" d
             JOIN "DeliveryChallanLine" l ON l."challanId" = d.id JOIN "SalesOrder" o ON o.id = d."salesOrderId"
             WHERE d."dispatchedOn" <= pts.at AND o.status NOT IN ('DRAFT','CANCELLED')) AS book
      FROM pts ORDER BY pts.at
    `,
  ]);

  const byKey = new Map(sales.map((s) => [s.k, s]));
  const months = window.map((m, i) => ({
    label: m.label,
    revenue: byKey.get(m.key)?.revenue ?? 0,
    cogs: byKey.get(m.key)?.cogs ?? 0,
    partial: i === window.length - 1,
  }));
  const closed = months.filter((m) => !m.partial);
  const last = closed[closed.length - 1]!;
  const prev = closed[closed.length - 2]!;
  const marginOf = (m: { revenue: number; cogs: number }) => (m.revenue ? ((m.revenue - m.cogs) / m.revenue) * 100 : 0);

  const pts = ends.map((e) => {
    const n = (v: number) => Number(v);
    const dso = n(e.rev90) ? (n(e.ar) / n(e.rev90)) * 90 : 0;
    const dio = n(e.cogs90) ? (n(e.inv) / n(e.cogs90)) * 90 : 0;
    const dpo = n(e.buy90) ? (n(e.ap) / n(e.buy90)) * 90 : 0;
    return { at: e.at, dso, dio, dpo, cycle: dso + dio - dpo, ar: n(e.ar), ap: n(e.ap), inv: n(e.inv), book: n(e.book) };
  });
  // The first months of the window have no 90-day history behind them; the cycle starts where it is honest.
  const cyclePts = pts.slice(3);
  const now = pts[pts.length - 1]!;
  const monthAgo = pts[pts.length - 2]!;
  const label = (d: Date, i: number, arr: unknown[]) =>
    i === arr.length - 1 ? "Now" : new Date(d).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });

  return {
    trends: {
      revenue: {
        value: last.revenue, delta: prev.revenue ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : 0,
        series: months.map((m) => ({ label: m.label, value: m.revenue, partial: m.partial })),
        against: `vs ${prev.label}`, period: last.label,
      },
      margin: {
        value: marginOf(last), delta: marginOf(last) - marginOf(prev),
        series: months.map((m) => ({ label: m.label, value: marginOf(m), partial: m.partial })),
        against: `pts vs ${prev.label}`, period: last.label,
      },
      cycle: {
        value: now.cycle, delta: now.cycle - monthAgo.cycle,
        series: cyclePts.map((p, i, a) => ({ label: label(p.at, i, a), value: p.cycle })),
        against: "days vs month end", period: "today",
      },
      orderBook: {
        value: now.book, delta: monthAgo.book ? ((now.book - monthAgo.book) / monthAgo.book) * 100 : 0,
        series: pts.map((p, i, a) => ({ label: label(p.at, i, a), value: p.book })),
        against: "vs month end", period: "today",
      },
    },
    cycle: {
      receivableDays: now.dso, inventoryDays: now.dio, payableDays: now.dpo, cycle: now.cycle, priorCycle: monthAgo.cycle,
      receivables: now.ar, inventory: now.inv, payables: now.ap,
    },
  };
}

export type CustomerPoint = { id: string; name: string; revenue: number; margin: number };
export type CustomerBook = { points: CustomerPoint[]; top5Share: number; priorTop5Share: number };

/**
 * Deck p9: "biggest customer" and "best customer" are different charts. Revenue
 * against realised gross margin per account over twelve months, and the share
 * of the top five against the six months before the latest six.
 */
export async function customerBook(): Promise<CustomerBook> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; revenue: number; cogs: number; recent: number; prior: number }[]>`
    SELECT cu.id, cu.name,
           SUM(i.subtotal)::float AS revenue,
           COALESCE(SUM(c.cost), 0)::float AS cogs,
           COALESCE(SUM(i.subtotal) FILTER (WHERE i."invoiceDate" > now() - interval '6 months'), 0)::float AS recent,
           COALESCE(SUM(i.subtotal) FILTER (WHERE i."invoiceDate" <= now() - interval '6 months'), 0)::float AS prior
    FROM "SalesInvoice" i
    JOIN "Customer" cu ON cu.id = i."customerId"
    LEFT JOIN LATERAL (
      SELECT SUM(l."quantityKg" * b."ratePerKg") AS cost
      FROM "DeliveryChallanLine" l JOIN "InventoryBatch" b ON b.id = l."batchId"
      WHERE l."challanId" = i."challanId"
    ) c ON true
    WHERE i."invoiceDate" > now() - interval '12 months' AND i.status NOT IN ('DRAFT', 'CANCELLED')
    GROUP BY cu.id, cu.name
    HAVING SUM(i.subtotal) > 0
  `;
  const share = (key: "recent" | "prior") => {
    const total = rows.reduce((s, r) => s + r[key], 0);
    const top = [...rows].sort((a, b) => b[key] - a[key]).slice(0, 5).reduce((s, r) => s + r[key], 0);
    return total ? (top / total) * 100 : 0;
  };
  return {
    points: rows
      .map((r) => ({ id: r.id, name: r.name, revenue: r.revenue, margin: r.revenue ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue),
    top5Share: share("recent"),
    priorTop5Share: share("prior"),
  };
}

export type BridgeStep = { label: string; value: number; kind: "total" | "step" };

/**
 * Deck p16: twelve months from revenue to what the operation contributed, each
 * deduction drawn as its own step. Cost of goods is the batch cost of what was
 * despatched against those invoices; overheads are the expense ledger.
 */
export async function profitBridge(): Promise<BridgeStep[]> {
  const [rev, exp] = await Promise.all([
    prisma.$queryRaw<{ revenue: number; cogs: number }[]>`
      SELECT COALESCE(SUM(i.subtotal), 0)::float AS revenue, COALESCE(SUM(c.cost), 0)::float AS cogs
      FROM "SalesInvoice" i
      LEFT JOIN LATERAL (
        SELECT SUM(l."quantityKg" * b."ratePerKg") AS cost
        FROM "DeliveryChallanLine" l JOIN "InventoryBatch" b ON b.id = l."batchId"
        WHERE l."challanId" = i."challanId"
      ) c ON true
      WHERE i."invoiceDate" > now() - interval '12 months' AND i.status NOT IN ('DRAFT', 'CANCELLED')
    `,
    prisma.$queryRaw<{ code: string; name: string; v: number }[]>`
      SELECT a.code, a.name, COALESCE(SUM(CASE WHEN lp.side = 'DEBIT' THEN lp.amount ELSE -lp.amount END), 0)::float AS v
      FROM "ChartOfAccount" a
      JOIN "LedgerPosting" lp ON lp."accountId" = a.id AND lp."postedAt" > now() - interval '12 months'
      WHERE a.type = 'EXPENSE' AND a.code <> '5000'
      GROUP BY 1, 2 ORDER BY 1
    `,
  ]);
  const r = rev[0] ?? { revenue: 0, cogs: 0 };
  const gross = r.revenue - r.cogs;
  const overheads = exp.filter((e) => e.v > 0);
  const contribution = gross - overheads.reduce((s, e) => s + e.v, 0);
  return [
    { label: "Revenue", value: r.revenue, kind: "total" },
    { label: "Cost of goods", value: -r.cogs, kind: "step" },
    { label: "Gross profit", value: gross, kind: "total" },
    ...overheads.map((e) => ({ label: e.name.replace(/ Expense$/, ""), value: -e.v, kind: "step" as const })),
    { label: "Contribution", value: contribution, kind: "total" },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager
// ─────────────────────────────────────────────────────────────────────────────

export type FunnelStage = { label: string; count: number; rate: number | null; trailing: number | null };

/**
 * Deck p10: per-stage conversion against that stage's own trailing rate. The
 * last ninety days' enquiries are the cohort; the six months before them set
 * the bar. A funnel in counts hides its own answer.
 */
export async function funnel(): Promise<FunnelStage[]> {
  const rows = await prisma.$queryRaw<{ recent: boolean; enq: number; quoted: number; accepted: number; ordered: number }[]>`
    SELECT (si."receivedOn" > now() - interval '90 days') AS recent,
           COUNT(*)::int AS enq,
           COUNT(*) FILTER (WHERE q.any_q)::int AS quoted,
           COUNT(*) FILTER (WHERE q.accepted)::int AS accepted,
           COUNT(*) FILTER (WHERE q.ordered)::int AS ordered
    FROM "SalesInquiry" si
    LEFT JOIN LATERAL (
      SELECT bool_or(sq.status <> 'DRAFT') AS any_q,
             bool_or(sq.status = 'ACCEPTED') AS accepted,
             bool_or(EXISTS (SELECT 1 FROM "SalesOrder" so WHERE so."quotationId" = sq.id AND so.status <> 'CANCELLED')) AS ordered
      FROM "SalesQuotation" sq WHERE sq."inquiryId" = si.id
    ) q ON true
    WHERE si."receivedOn" > now() - interval '270 days' AND si.status <> 'DRAFT'
    GROUP BY 1
  `;
  const recent = rows.find((r) => r.recent) ?? { enq: 0, quoted: 0, accepted: 0, ordered: 0 };
  const trail = rows.find((r) => !r.recent) ?? { enq: 0, quoted: 0, accepted: 0, ordered: 0 };
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);
  return [
    { label: "Enquiry", count: recent.enq, rate: null, trailing: null },
    { label: "Quoted", count: recent.quoted, rate: pct(recent.quoted, recent.enq), trailing: pct(trail.quoted, trail.enq) },
    { label: "Accepted", count: recent.accepted, rate: pct(recent.accepted, recent.quoted), trailing: pct(trail.accepted, trail.quoted) },
    { label: "Ordered", count: recent.ordered, rate: pct(recent.ordered, recent.accepted), trailing: pct(trail.ordered, trail.accepted) },
  ];
}

export type ReceivableRow = {
  id: string;
  name: string;
  buckets: [number, number, number, number, number];
  total: number;
  limit: number;
};
export const AGE_BUCKETS = ["Not due", "1–30", "31–60", "61–90", "90+"] as const;

/** Deck p16: open receivables per customer by days past due, with the credit limit beside them. */
export async function receivables(): Promise<ReceivableRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; lim: number; b0: number; b1: number; b2: number; b3: number; b4: number }[]>`
    WITH open AS (
      SELECT i."customerId", (i."totalValue" - i."paidAmount") AS due,
             GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(i."dueOn", i."invoiceDate")))::int AS late,
             COALESCE(i."dueOn", i."invoiceDate") > now() AS not_due
      FROM "SalesInvoice" i
      WHERE i.status NOT IN ('DRAFT', 'CANCELLED', 'PAID') AND i."totalValue" > i."paidAmount"
    )
    SELECT c.id, c.name, c."creditLimit"::float AS lim,
           COALESCE(SUM(due) FILTER (WHERE not_due), 0)::float AS b0,
           COALESCE(SUM(due) FILTER (WHERE NOT not_due AND late <= 30), 0)::float AS b1,
           COALESCE(SUM(due) FILTER (WHERE NOT not_due AND late BETWEEN 31 AND 60), 0)::float AS b2,
           COALESCE(SUM(due) FILTER (WHERE NOT not_due AND late BETWEEN 61 AND 90), 0)::float AS b3,
           COALESCE(SUM(due) FILTER (WHERE NOT not_due AND late > 90), 0)::float AS b4
    FROM open JOIN "Customer" c ON c.id = open."customerId"
    GROUP BY c.id, c.name, c."creditLimit"
  `;
  return rows
    .map((r) => {
      const buckets: ReceivableRow["buckets"] = [r.b0, r.b1, r.b2, r.b3, r.b4];
      return { id: r.id, name: r.name, buckets, total: buckets.reduce((s, v) => s + v, 0), limit: r.lim };
    })
    // Ranked by what is overdue, not by what is merely open.
    .sort((a, b) => b.buckets[4] - a.buckets[4] || b.total - b.buckets[0] - (a.total - a.buckets[0]))
    .slice(0, 8);
}

export type PriceMove = { id: string; name: string; changePct: number; impact: number; monthlyKg: number };

/**
 * Deck p12: the same price moves, ranked two ways. Percentage tells you what
 * moved; rupees — the move times what this plant actually buys a month — tell
 * you what it cost. Only one of those is a decision.
 */
export async function priceImpact(): Promise<PriceMove[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; now_rate: number; then_rate: number | null; kg: number }[]>`
    SELECT m.id, m.name, m."currentPricePerKg"::float AS now_rate,
      (SELECT p."pricePerKg"::float FROM "MaterialPrice" p
       WHERE p."materialId" = m.id AND p.status IN ('APPROVED', 'SUPERSEDED') AND p."effectiveFrom" <= now() - interval '90 days'
       ORDER BY p."effectiveFrom" DESC LIMIT 1) AS then_rate,
      COALESCE((SELECT SUM(l."quantityKg") FROM "PurchaseOrderLine" l JOIN "PurchaseOrder" o ON o.id = l."purchaseOrderId"
       WHERE l."materialId" = m.id AND o.status NOT IN ('DRAFT', 'CANCELLED') AND o."orderedOn" > now() - interval '6 months'), 0)::float / 6 AS kg
    FROM "RawMaterial" m
    WHERE m."isActive" AND m."itemType" = 'RAW_MATERIAL' AND m."currentPricePerKg" IS NOT NULL
  `;
  return rows
    .filter((r) => r.then_rate && r.now_rate !== r.then_rate)
    .map((r) => ({
      id: r.id, name: r.name, monthlyKg: r.kg,
      changePct: ((r.now_rate - r.then_rate!) / r.then_rate!) * 100,
      impact: (r.now_rate - r.then_rate!) * r.kg,
    }));
}

export type AgeingRow = { category: string; buckets: [number, number, number, number]; total: number };
export const STOCK_AGES = ["0–30 days", "31–60", "61–90", "90+"] as const;

/** Deck p13: stock value by category and age. The 90+ band is the only one anybody acts on. */
export async function inventoryAgeing(): Promise<AgeingRow[]> {
  const rows = await prisma.$queryRaw<{ category: string; b0: number; b1: number; b2: number; b3: number }[]>`
    SELECT CASE WHEN m."itemType" = 'FINISHED_GOOD' THEN 'FINISHED_COMPOUND' ELSE m.category::text END AS category,
           COALESCE(SUM(v) FILTER (WHERE age <= 30), 0)::float AS b0,
           COALESCE(SUM(v) FILTER (WHERE age BETWEEN 31 AND 60), 0)::float AS b1,
           COALESCE(SUM(v) FILTER (WHERE age BETWEEN 61 AND 90), 0)::float AS b2,
           COALESCE(SUM(v) FILTER (WHERE age > 90), 0)::float AS b3
    FROM (
      SELECT b."materialId", b."availableQtyKg" * b."ratePerKg" AS v, EXTRACT(DAY FROM now() - b."receivedOn")::int AS age
      FROM "InventoryBatch" b WHERE b.status = 'AVAILABLE' AND b."availableQtyKg" > 0
    ) x JOIN "RawMaterial" m ON m.id = x."materialId"
    GROUP BY 1
  `;
  return rows
    .map((r) => {
      const buckets: AgeingRow["buckets"] = [r.b0, r.b1, r.b2, r.b3];
      return { category: r.category, buckets, total: buckets.reduce((s, v) => s + v, 0) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type GradeCost = {
  id: string;
  costSheetId: string;
  grade: string;
  name: string;
  frozen: number;
  today: number;
  driftPct: number;
  conversion: number;
  overheadPct: number;
  sellingRate: number;
  inputs: { name: string; cost: number; frozenCost: number }[];
};

/**
 * Deck p15 / p28: every approved cost sheet re-costed at today's approved
 * rates. The frozen figure is what sales is quoting from; the gap is margin
 * the plant believes it earns and does not.
 */
export async function costDrift(): Promise<GradeCost[]> {
  const sheets = await prisma.costSheet.findMany({
    where: { status: "APPROVED" },
    orderBy: { approvedAt: "desc" },
    include: {
      formulation: { include: { project: { select: { id: true, name: true } } } },
      lines: { include: { material: { select: { name: true, currentPricePerKg: true } } }, orderBy: { lineNo: "asc" } },
    },
  });
  const seen = new Set<string>();
  const out: GradeCost[] = [];
  for (const s of sheets) {
    // The latest approved sheet per formulation is the one in force.
    if (seen.has(s.formulationId)) continue;
    seen.add(s.formulationId);
    const inputs = s.lines.map((l) => ({
      name: l.material.name,
      frozenCost: Number(l.costPerKg),
      cost: Number(l.fractionKg) * Number(l.material.currentPricePerKg ?? l.ratePerKg),
    }));
    const frozen = Number(s.materialCostPerKg);
    const today = inputs.reduce((t, i) => t + i.cost, 0);
    const [grade, ...rest] = s.formulation.project.name.split(" · ");
    out.push({
      id: s.formulation.project.id, costSheetId: s.id, grade: grade!, name: rest.join(" · ") || grade!,
      frozen, today, driftPct: frozen ? ((today - frozen) / frozen) * 100 : 0,
      conversion: Number(s.conversionPerKg), overheadPct: Number(s.overheadPct), sellingRate: Number(s.sellingRatePerKg),
      inputs: inputs.sort((a, b) => b.cost - a.cost),
    });
  }
  return out.sort((a, b) => b.driftPct - a.driftPct);
}

// ─────────────────────────────────────────────────────────────────────────────
// Engineer, operator
// ─────────────────────────────────────────────────────────────────────────────

export const DOC_TYPES = ["TDS", "SDS", "COA", "ROHS", "REACH"] as const;
export type DocRow = { id: string; code: string; name: string; stage: string; has: boolean[]; blocked: boolean };

/**
 * Deck p17: a compound with a finished formulation and no RoHS declaration is
 * not late — it is blocked. Stage decides, not count: a project in development
 * missing four documents is fine; one at trial missing one cannot ship.
 */
export async function docMatrix(): Promise<DocRow[]> {
  const projects = await prisma.project.findMany({
    where: { stage: { notIn: ["DROPPED", "ENQUIRY"] } },
    include: { documents: { where: { isCurrent: true }, select: { type: true } } },
    orderBy: { code: "asc" },
  });
  const releasing = new Set(["SAMPLE_WITH_CUSTOMER", "PLANT_TRIAL", "APPROVED", "IN_PRODUCTION"]);
  const rows = projects.map((p) => {
    const types = new Set(p.documents.map((d) => d.type as string));
    const has = DOC_TYPES.map((t) => types.has(t));
    return { id: p.id, code: p.code, name: p.name, stage: p.stage, has, blocked: releasing.has(p.stage) && has.some((h) => !h) };
  });
  // Blocked first; then whatever is closest to release.
  const order = ["IN_PRODUCTION", "APPROVED", "PLANT_TRIAL", "SAMPLE_WITH_CUSTOMER", "LAB_TRIAL", "FORMULATION", "ON_HOLD"];
  return rows.sort((a, b) => Number(b.blocked) - Number(a.blocked) || order.indexOf(a.stage) - order.indexOf(b.stage));
}

export type BacklogRow = { id: string; code: string; customer: string; grade: string; kg: number; value: number; days: number };

/** Deck p11: confirmed and not allocated; allocated and not despatched. */
export async function salesBacklog(): Promise<{ unallocated: BacklogRow[]; waiting: BacklogRow[] }> {
  const rows = await prisma.$queryRaw<(BacklogRow & { kind: "u" | "w"; since: Date })[]>`
    SELECT o.id, o.code, c.name AS customer, split_part(p.name, ' · ', 1) AS grade,
           CASE WHEN l."allocatedKg" < l."quantityKg" THEN 'u' ELSE 'w' END AS kind,
           (CASE WHEN l."allocatedKg" < l."quantityKg" THEN l."quantityKg" - l."allocatedKg" ELSE l."allocatedKg" - l."dispatchedKg" END)::float AS kg,
           ((CASE WHEN l."allocatedKg" < l."quantityKg" THEN l."quantityKg" - l."allocatedKg" ELSE l."allocatedKg" - l."dispatchedKg" END) * l."ratePerKg")::float AS value,
           COALESCE(
             (SELECT MAX(a."createdAt") FROM "StockAllocation" a WHERE a."salesOrderLineId" = l.id AND a."isActive"),
             o."approvedAt", o."orderedOn") AS since
    FROM "SalesOrderLine" l
    JOIN "SalesOrder" o ON o.id = l."salesOrderId"
    JOIN "Customer" c ON c.id = o."customerId"
    JOIN "Project" p ON p.id = l."projectId"
    WHERE o.status IN ('CONFIRMED', 'PARTIALLY_DISPATCHED')
      AND (l."allocatedKg" < l."quantityKg" OR l."allocatedKg" > l."dispatchedKg")
  `;
  const shape = (kind: "u" | "w") =>
    rows
      .filter((r) => r.kind === kind)
      .map(({ kind: _k, since, ...r }) => ({ ...r, days: ageDays(since) }))
      .sort((a, b) => b.days - a.days || b.value - a.value);
  return { unallocated: shape("u"), waiting: shape("w") };
}

export type SlipRow = { id: string; code: string; party: string; detail: string; value: number; days: number; href: string };

/** Deck p12: requisitions approved and not converted; orders past their promised date. */
export async function procurementSlippage(): Promise<{ requisitions: SlipRow[]; overdue: SlipRow[] }> {
  const [prs, pos] = await Promise.all([
    prisma.$queryRaw<{ id: string; code: string; items: string; value: number; at: Date | null }[]>`
      SELECT r.id, r.code, string_agg(m.name, ', ') AS items,
             SUM((l."quantityKg" - l."orderedKg") * COALESCE(m."currentPricePerKg", 0))::float AS value,
             r."approvedAt" AS at
      FROM "PurchaseRequisition" r
      JOIN "PurchaseRequisitionLine" l ON l."requisitionId" = r.id
      JOIN "RawMaterial" m ON m.id = l."materialId"
      WHERE r.status IN ('APPROVED', 'PARTIALLY_ORDERED') AND l."orderedKg" < l."quantityKg"
      GROUP BY r.id, r.code, r."approvedAt"
    `,
    prisma.$queryRaw<{ id: string; code: string; vendor: string; items: string; value: number; at: Date }[]>`
      SELECT o.id, o.code, v.name AS vendor, string_agg(m.name, ', ') AS items,
             SUM((l."quantityKg" - l."receivedKg") * l."ratePerKg")::float AS value,
             o."expectedOn" AS at
      FROM "PurchaseOrder" o
      JOIN "Vendor" v ON v.id = o."vendorId"
      JOIN "PurchaseOrderLine" l ON l."purchaseOrderId" = o.id
      JOIN "RawMaterial" m ON m.id = l."materialId"
      WHERE o.status IN ('APPROVED', 'PARTIALLY_RECEIVED') AND o."expectedOn" < now() AND l."receivedKg" < l."quantityKg"
      GROUP BY o.id, o.code, v.name, o."expectedOn"
    `,
  ]);
  return {
    requisitions: prs
      .map((r) => ({ id: r.id, code: r.code, party: r.items, detail: "approved, no order", value: r.value, days: ageDays(r.at), href: `/procurement/requisitions/${r.id}` }))
      .sort((a, b) => b.value - a.value),
    overdue: pos
      .map((o) => ({ id: o.id, code: o.code, party: o.vendor, detail: o.items, value: o.value, days: ageDays(o.at), href: `/procurement/orders/${o.id}` }))
      .sort((a, b) => b.value - a.value),
  };
}

export type DormantRow = { id: string; name: string; lastOrder: Date; days: number; l12m: number };

/** Deck p9: accounts with no order in ninety days, ranked by what they were worth. */
export async function dormantCustomers(): Promise<DormantRow[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; last: Date; l12m: number }[]>`
    SELECT c.id, c.name, MAX(o."orderedOn") AS last,
           COALESCE(SUM(o.subtotal) FILTER (WHERE o."orderedOn" > now() - interval '12 months'), 0)::float AS l12m
    FROM "Customer" c
    JOIN "SalesOrder" o ON o."customerId" = c.id AND o.status NOT IN ('DRAFT', 'CANCELLED')
    WHERE c.status = 'ACTIVE'
    GROUP BY c.id, c.name
    HAVING MAX(o."orderedOn") < now() - make_interval(days => ${ACT_AT.dormantDays}::int)
  `;
  return rows
    .map((r) => ({ id: r.id, name: r.name, lastOrder: r.last, days: ageDays(r.last), l12m: r.l12m }))
    .sort((a, b) => b.l12m - a.l12m);
}

export type StaleAllocation = { id: string; ref: string; material: string; kg: number; value: number; reason: string; days: number; href: string };
export type Shortage = { id: string; ref: string; material: string; kg: number; days: number };

/**
 * Deck p27: material committed to a job that no longer exists. Free stock
 * reads lower than it is, so the next order is quoted long or bought twice.
 */
export async function staleAllocations(): Promise<{ allocations: StaleAllocation[]; shortages: Shortage[] }> {
  const [planning, sales, shortages] = await Promise.all([
    prisma.$queryRaw<{ id: string; ref: string; material: string; kg: number; value: number; status: string; at: Date }[]>`
      SELECT a.id, w.code AS ref, m.name AS material, a."quantityKg"::float AS kg,
             (a."quantityKg" * b."ratePerKg")::float AS value, w.status::text AS status, w."updatedAt" AS at
      FROM "PlanningAllocation" a
      JOIN "PlanningWorkOrder" w ON w.id = a."pwoId"
      JOIN "RawMaterial" m ON m.id = a."materialId"
      JOIN "InventoryBatch" b ON b.id = a."batchId"
      WHERE w.status IN ('CANCELLED', 'COMPLETED', 'REJECTED')
    `,
    prisma.$queryRaw<{ id: string; ref: string; orderId: string; material: string; kg: number; value: number; status: string; at: Date }[]>`
      SELECT a.id, o.code AS ref, o.id AS "orderId", m.name AS material, a."quantityKg"::float AS kg,
             (a."quantityKg" * b."ratePerKg")::float AS value, o.status::text AS status, o."updatedAt" AS at
      FROM "StockAllocation" a
      JOIN "SalesOrderLine" l ON l.id = a."salesOrderLineId"
      JOIN "SalesOrder" o ON o.id = l."salesOrderId"
      JOIN "InventoryBatch" b ON b.id = a."batchId"
      JOIN "RawMaterial" m ON m.id = b."materialId"
      WHERE a."isActive" AND o.status IN ('CANCELLED', 'CLOSED', 'INVOICED')
    `,
    prisma.$queryRaw<{ id: string; ref: string; material: string; kg: number; at: Date }[]>`
      SELECT s.id, w.code AS ref, m.name AS material, s."shortageQtyKg"::float AS kg, s."createdAt" AS at
      FROM "PlanningShortage" s
      JOIN "PlanningWorkOrder" w ON w.id = s."pwoId"
      JOIN "RawMaterial" m ON m.id = s."materialId"
      WHERE w.status IN ('APPROVED', 'IN_PROGRESS') AND s."shortageQtyKg" > 0
    `,
  ]);
  const word = (s: string) => s.toLowerCase();
  return {
    allocations: [
      ...planning.map((a) => ({ id: a.id, ref: a.ref, material: a.material, kg: a.kg, value: a.value, reason: `work order ${word(a.status)}`, days: ageDays(a.at), href: "/planning" })),
      ...sales.map((a) => ({ id: a.id, ref: a.ref, material: a.material, kg: a.kg, value: a.value, reason: `order ${word(a.status)}`, days: ageDays(a.at), href: `/sales/orders/${a.orderId}` })),
    ].sort((a, b) => b.value - a.value),
    shortages: shortages.map((s) => ({ id: s.id, ref: s.ref, material: s.material, kg: s.kg, days: ageDays(s.at) })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The flow map
// ─────────────────────────────────────────────────────────────────────────────

export type FlowStats = {
  enquiries: number;
  orders: number;
  despatched: number;
  invoiced: number;
  collected: number;
  requisitions: number;
  purchased: number;
  received: number;
  billed: number;
  paid: number;
  stock: number;
};

/**
 * Thirty days through each document in the two chains — what the flow map
 * draws on its nodes and how dense it makes the current between them.
 * Enquiries and requisitions are counts; everything else is rupees.
 */
export async function flowStats(): Promise<FlowStats> {
  const [r] = await prisma.$queryRaw<FlowStats[]>`
    SELECT
      (SELECT COUNT(*) FROM "SalesInquiry" WHERE "receivedOn" > now() - interval '30 days' AND status <> 'DRAFT')::float AS enquiries,
      (SELECT COALESCE(SUM(subtotal), 0) FROM "SalesOrder" WHERE "orderedOn" > now() - interval '30 days' AND status NOT IN ('DRAFT', 'CANCELLED'))::float AS orders,
      (SELECT COALESCE(SUM(l."quantityKg" * l."ratePerKg"), 0) FROM "DeliveryChallan" d JOIN "DeliveryChallanLine" l ON l."challanId" = d.id
        WHERE d."dispatchedOn" > now() - interval '30 days' AND d.status IN ('DISPATCHED', 'DELIVERED'))::float AS despatched,
      (SELECT COALESCE(SUM(subtotal), 0) FROM "SalesInvoice" WHERE "invoiceDate" > now() - interval '30 days' AND status NOT IN ('DRAFT', 'CANCELLED'))::float AS invoiced,
      (SELECT COALESCE(SUM(lp.amount), 0) FROM "LedgerPosting" lp JOIN "ChartOfAccount" a ON a.id = lp."accountId"
        WHERE a.code = '1100' AND lp.side = 'CREDIT' AND lp."sourceType" = 'PAYMENT' AND lp."postedAt" > now() - interval '30 days')::float AS collected,
      (SELECT COUNT(*) FROM "PurchaseRequisition" WHERE "createdAt" > now() - interval '30 days' AND status NOT IN ('DRAFT', 'CANCELLED'))::float AS requisitions,
      (SELECT COALESCE(SUM(subtotal), 0) FROM "PurchaseOrder" WHERE "orderedOn" > now() - interval '30 days' AND status NOT IN ('DRAFT', 'CANCELLED'))::float AS purchased,
      (SELECT COALESCE(SUM(gl."receivedQtyKg" * pl."ratePerKg"), 0) FROM "GoodsReceipt" g
        JOIN "GoodsReceiptLine" gl ON gl."goodsReceiptId" = g.id JOIN "PurchaseOrderLine" pl ON pl.id = gl."purchaseOrderLineId"
        WHERE g."receivedOn" > now() - interval '30 days')::float AS received,
      (SELECT COALESCE(SUM(subtotal), 0) FROM "VendorBill" WHERE "billDate" > now() - interval '30 days' AND status <> 'VOID')::float AS billed,
      (SELECT COALESCE(SUM(lp.amount), 0) FROM "LedgerPosting" lp JOIN "ChartOfAccount" a ON a.id = lp."accountId"
        WHERE a.code = '2000' AND lp.side = 'DEBIT' AND lp."sourceType" = 'PAYMENT' AND lp."postedAt" > now() - interval '30 days')::float AS paid,
      (SELECT COALESCE(SUM("availableQtyKg" * "ratePerKg"), 0) FROM "InventoryBatch" WHERE status = 'AVAILABLE')::float AS stock
  `;
  return r!;
}
