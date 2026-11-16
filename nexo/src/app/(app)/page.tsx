import { Role, PriceStatus, GrnStatus, PoStatus, ApprovalTier } from "@prisma/client";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getTenant } from "@/lib/tenant-server";
import { ServicesDashboard } from "./_services/dashboard";
import { can, approvalLimit, type Permission } from "@/lib/rbac";
import { money, ratePerKg, date, dateLong, relative, titleise, compactInr } from "@/lib/format";
import { Panel, QueueRow, EmptyLine, Figure } from "@/components/ui/panel";
import { KpiStrip, LensBoard, AlertsBoard, type Kpi, type Lens, type LensPanel, type Need, type AlertGroup } from "@/components/dashboard/command";
import { Chip, priceStatusTone, poStatusTone } from "@/components/ui/chip";
import {
  IconAlert,
  IconApprove,
  IconBridge,
  IconClock,
  IconCustomers,
  IconDocument,
  IconFactory,
  IconFlask,
  IconFunnel,
  IconGauge,
  IconInventory,
  IconLayers,
  IconLink,
  IconMoon,
  IconOrder,
  IconProcurement,
  IconTag,
  IconTrend,
  IconTruck,
  IconWallet,
  IconCart,
} from "@/components/icons";
import { spendByMonth, costIndex } from "./insights";
import {
  exceptions,
  trends,
  customerBook,
  profitBridge,
  funnel,
  receivables,
  priceImpact,
  inventoryAgeing,
  costDrift,
  docMatrix,
  salesBacklog,
  procurementSlippage,
  dormantCustomers,
  staleAllocations,
  DOC_TYPES,
} from "./metrics";
import { ACT_AT } from "./act-at";
import { SpendChart, CostIndexChart } from "@/components/charts/insight-charts";
import {
  Card,
  Pill,
  KpiChart,
  CycleGauge,
  CustomerBubbles,
  ConcentrationRing,
  ReceivablesDonut,
  FunnelShape,
  PriceImpact,
  BridgeColumns,
  StockAgeing,
  CostDrift,
  KiloCost,
} from "@/components/charts/deck-charts";
/** Value sitting between two documents where it should not be. */
type Leak = { on: string; value: number; label: string; severity: "missing" | "slow"; href: string };

export const dynamic = "force-dynamic";

const cr = (v: number) => compactInr(v).replace("₹ ", "₹");

/**
 * The dashboard: one picture of the business, then the numbers behind it.
 *
 * The top is the flow map — what is sold and what is bought as two pipes, with
 * every missing or slow document drawn as a leak with its rupee value. Below
 * it, four bands of cards (money, customers, buying, stock), each an icon, one
 * number and one graphic. Words are labels; the graphics carry the meaning.
 */
export default async function Dashboard() {
  const user = await requireSession();

  if (user.role === Role.VENDOR) return <VendorDashboard vendorId={user.vendorId} name={user.name} />;
  const tenant = await getTenant();
  if (tenant.kind === "services") return <ServicesDashboard name={user.name} />;

  const may = (p: Permission) => can(user.role, p);
  /** Fetch only what this role will be shown. */
  const when = <T,>(ok: boolean, f: () => Promise<T>) => (ok ? f() : Promise.resolve(null));
  const money$ = may("invoice:read");

  const [
    pendingPrices, pendingGrn, pendingPo, lowStock,
    spendSeries, costIdx,
    exc, trend, book, bridge, stages, ar, moves, ageing, grades, docs, backlog, slip, dormant, stale,
  ] = await Promise.all([
    prisma.materialPrice.count({ where: { status: PriceStatus.PENDING_APPROVAL } }),
    prisma.goodsReceipt.count({ where: { status: { in: [GrnStatus.PENDING_QC, GrnStatus.DRAFT] } } }),
    prisma.purchaseOrder.count({
      where: {
        status: PoStatus.PENDING_APPROVAL,
        // Only what this signer can actually action.
        ...(approvalLimit(user.role) === Number.POSITIVE_INFINITY ? {} : { approvalTier: ApprovalTier.HEAD }),
      },
    }),
    lowStockRows(),
    when(may("po:read"), spendByMonth),
    when(may("price:read"), costIndex),
    when(may("report:read"), exceptions),
    when(money$, trends),
    when(money$ && may("customer:read"), customerBook),
    when(money$, profitBridge),
    when(may("sales:read"), funnel),
    when(money$ && may("customer:read"), receivables),
    when(may("price:read"), priceImpact),
    when(may("inventory:read"), inventoryAgeing),
    when(may("costsheet:read"), costDrift),
    when(may("document:read"), docMatrix),
    when(may("so:read"), salesBacklog),
    when(may("po:read") || may("req:read"), procurementSlippage),
    when(may("customer:read") && may("so:read"), dormantCustomers),
    when(may("inventory:read"), staleAllocations),
  ]);

  // ── The leaks on the flow map ──────────────────────────────────────────────
  const ex = (k: string) => exc?.find((e) => e.key === k);
  const sum = <T,>(xs: T[] | undefined, f: (x: T) => number) => (xs ?? []).reduce((s, x) => s + f(x), 0);
  const leaks: Leak[] = [
    { on: "despatch-invoice", value: ex("unbilled")?.value ?? 0, label: "not invoiced", severity: "missing", href: "/sales/dispatch" },
    { on: "receipt-bill", value: ex("unmatched")?.value ?? 0, label: "no bill", severity: "missing", href: "/finance/payable" },
    { on: "receipt-stock", value: ex("unposted")?.value ?? 0, label: "GRN not posted", severity: "missing", href: "/procurement/grn" },
    { on: "bill-paid", value: ex("unreturned")?.value ?? 0, label: "no debit note", severity: "missing", href: "/procurement/rejections" },
    { on: "invoice-cash", value: sum(ar ?? undefined, (r) => r.buckets[4]), label: "90+ days late", severity: "slow", href: "/finance/receivable" },
    { on: "order-despatch", value: sum(backlog?.unallocated, (o) => o.value), label: "not allocated", severity: "slow", href: "/sales/orders" },
    { on: "requisition-po", value: sum(slip?.requisitions, (r) => r.value), label: "not ordered", severity: "slow", href: "/procurement/requisitions" },
    { on: "po-receipt", value: sum(slip?.overdue, (o) => o.value), label: "vendor late", severity: "slow", href: "/procurement/orders" },
    { on: "stock-despatch", value: sum(stale?.allocations, (a) => a.value), label: "held, order closed", severity: "slow", href: "/planning" },
  ].filter((l) => l.value > 0) as Leak[];

  const drifted = grades?.filter((g) => Math.abs(g.driftPct) > ACT_AT.driftPct).length ?? 0;

  // ── The figures across the top ─────────────────────────────────────────────
  const owed = sum(ar ?? undefined, (r) => r.buckets.reduce((s, b) => s + b, 0));
  const overdue = sum(ar ?? undefined, (r) => r.buckets.slice(1).reduce((s, b) => s + b, 0));
  const late90 = sum(ar ?? undefined, (r) => r.buckets[4]);
  const waiting =
    (may("price:approve") ? pendingPrices : 0) + (may("po:approve") ? pendingPo : 0) + (may("grn:read") ? pendingGrn : 0) + (may("inventory:read") ? lowStock.length : 0);
  const kpis: Kpi[] = [];
  if (trend) {
    const t = trend.trends;
    kpis.push(
      { key: "rev", label: `Revenue, ${t.revenue.period}`, value: t.revenue.value, unit: "inr", delta: t.revenue.delta, deltaUnit: "pct", good: "up", against: t.revenue.against, href: "/sales/invoices" },
      { key: "margin", label: "Gross margin", value: t.margin.value, unit: "pct", delta: t.margin.delta, deltaUnit: "pts", good: "up", against: t.margin.against },
      { key: "book", label: "Order book", value: t.orderBook.value, unit: "inr", delta: t.orderBook.delta, deltaUnit: "pct", good: "up", against: t.orderBook.against, href: "/sales/orders" },
    );
  }
  if (ar) kpis.push({ key: "overdue", label: "Overdue from customers", value: overdue, unit: "inr", note: `of ${cr(owed)} owed${late90 ? `, ${cr(late90)} past 90 days` : ""}`, alert: late90 > 0, href: "/finance/receivable" });
  if (trend) kpis.push({ key: "cycle", label: "Cash cycle", value: trend.cycle.cycle, unit: "days", suffix: "days", delta: trend.cycle.cycle - trend.cycle.priorCycle, deltaUnit: "days", good: "down", against: "vs a quarter ago", href: "/finance/receivable" });
  kpis.push({ key: "waiting", label: "Waiting on you", value: waiting, unit: "count", note: "approvals, QC and reorders", alert: waiting > 0 });

  // ── Everything with somebody's name on it ─────────────────────────────────
  const LEAK_WORDS: Record<string, string> = {
    "despatch-invoice": "Despatched, not invoiced",
    "receipt-bill": "Received, no vendor bill",
    "receipt-stock": "Received, GRN not posted",
    "bill-paid": "Rejected, no debit note",
    "invoice-cash": "Invoices 90+ days late",
    "order-despatch": "Orders not allocated",
    "requisition-po": "Requisitions not ordered",
    "po-receipt": "Vendors late on delivery",
    "stock-despatch": "Stock held for closed orders",
  };
  const LEAK_DETAIL: Record<string, string> = {
    "despatch-invoice": "Challans that left the gate with no tax invoice",
    "receipt-bill": "Goods received, vendor bill not yet entered",
    "receipt-stock": "Receipts not yet posted to stock",
    "bill-paid": "Rejected lots with no debit note raised",
    "invoice-cash": "Customer invoices unpaid past 90 days",
    "order-despatch": "Confirmed orders with no stock allocated",
    "requisition-po": "Approved requisitions with no purchase order",
    "po-receipt": "Purchase orders past their promised date",
    "stock-despatch": "Stock still allocated to closed orders",
  };
  const leakNeed = (l: Leak): Need => ({
    key: l.on,
    label: LEAK_WORDS[l.on] ?? l.label,
    detail: LEAK_DETAIL[l.on] ?? (l.severity === "missing" ? "a document that should exist does not" : "slower than it should be"),
    value: l.value,
    href: l.href,
    tone: l.severity === "missing" ? "act" : "slow",
  });
  const byValue = (a: Leak, b: Leak) => b.value - a.value;
  const alerts: AlertGroup[] = [
    {
      key: "act",
      title: "Act now",
      hint: "Documents that should exist and do not, and stock that is running out",
      tone: "act",
      items: [
        ...leaks.filter((l) => l.severity === "missing").sort(byValue).map(leakNeed),
        ...(may("inventory:read") && lowStock.length
          ? [{ key: "low", label: "Materials below reorder level", detail: lowStock.slice(0, 2).map((m) => m.name).join(", "), count: lowStock.length, href: "/procurement/inventory", tone: "act" as const }]
          : []),
      ],
    },
    {
      key: "slow",
      title: "Slow or late",
      hint: "Work that is moving, but slower than it should",
      tone: "slow",
      items: leaks.filter((l) => l.severity === "slow").sort(byValue).map(leakNeed),
    },
    {
      key: "wait",
      title: "Waiting on approval",
      hint: "Decisions with your name on them",
      tone: "wait",
      items: [
        ...(may("po:approve") && pendingPo ? [{ key: "po", label: "Purchase orders to approve", detail: "within your approval limit", count: pendingPo, href: "/procurement/approvals", tone: "slow" as const }] : []),
        ...(may("price:approve") && pendingPrices ? [{ key: "prices", label: "Vendor price changes to approve", detail: "submitted from the vendor portal", count: pendingPrices, href: "/finance/approvals", tone: "slow" as const }] : []),
        ...(may("grn:read") && pendingGrn ? [{ key: "grn", label: "Receipts waiting for QC", detail: "not usable until passed", count: pendingGrn, href: "/procurement/grn", tone: "slow" as const }] : []),
      ],
    },
  ];

  // ── The lenses ─────────────────────────────────────────────────────────────
  const backlogRows = backlog
    ? [...backlog.unallocated.map((o) => ({ ...o, tag: "allocate" })), ...backlog.waiting.map((o) => ({ ...o, tag: "despatch" }))].sort((a, b) => b.days - a.days)
    : [];
  const lenses: Lens[] = [];

  const sell: LensPanel[] = [];
  if (book && book.points.length > 0)
    sell.push({ span: 8, node: <Card icon={<IconCustomers size={16} />} title="Revenue vs margin, by customer" aside={<ConcentrationRing share={book.top5Share} />} href="/customers"><CustomerBubbles book={book} /></Card> });
  if (ar && ar.length > 0) sell.push({ span: 4, node: <Card icon={<IconWallet size={16} />} title="Owed to us" href="/finance/receivable"><ReceivablesDonut rows={ar} /></Card> });
  if (stages && stages[0]!.count > 0) sell.push({ span: 4, node: <Card icon={<IconFunnel size={16} />} title="Enquiry to order" href="/sales/inquiries"><FunnelShape stages={stages} /></Card> });
  if (backlog)
    sell.push({
      span: 4,
      node: (
        <QueueCard
          icon={<IconTruck size={16} />}
          title="Orders not moving"
          href="/sales/orders"
          total={sum(backlogRows, (o) => o.value)}
          count={backlogRows.length}
          empty="Every order is moving."
          rows={backlogRows.map((o) => ({ key: `${o.tag}-${o.id}`, href: `/sales/orders/${o.id}`, title: o.customer, sub: `${o.code} · ${o.tag}`, value: o.value, days: o.days, late: o.days > ACT_AT.backlogDays }))}
        />
      ),
    });
  if (dormant)
    sell.push({
      span: 4,
      node: (
        <QueueCard
          icon={<IconMoon size={16} />}
          title="Gone quiet"
          href="/customers"
          total={sum(dormant, (c) => c.l12m)}
          totalLabel="a year, at risk"
          count={dormant.length}
          empty={`Everyone ordered in ${ACT_AT.dormantDays} days.`}
          rows={dormant.map((c) => ({ key: c.id, href: `/customers/${c.id}`, title: c.name, sub: `last order ${date(c.lastOrder)}`, value: c.l12m, days: c.days, late: true }))}
        />
      ),
    });
  if (sell.length) lenses.push({ key: "sell", label: "Sell", hint: "Customers, pipeline and what is owed", attention: backlogRows.length + (dormant?.length ?? 0), panels: sell });

  const buy: LensPanel[] = [];
  if (spendSeries) buy.push({ span: 8, node: <Card icon={<IconProcurement size={16} />} title="Purchase spend" href="/procurement/orders"><div className="-mx-3.5 -mb-2"><SpendChart data={spendSeries} /></div></Card> });
  if (slip)
    buy.push({
      span: 4,
      node: (
        <QueueCard
          icon={<IconCart size={16} />}
          title="Buying slipping"
          href="/procurement/orders"
          total={sum(slip.requisitions, (r) => r.value) + sum(slip.overdue, (o) => o.value)}
          count={slip.requisitions.length + slip.overdue.length}
          empty="Nothing late, nothing unordered."
          rows={[
            ...slip.overdue.map((o) => ({ key: o.id, href: o.href, title: o.party, sub: `${o.code} · vendor late`, value: o.value, days: o.days, late: true })),
            ...slip.requisitions.map((r) => ({ key: r.id, href: r.href, title: r.party, sub: `${r.code} · not ordered`, value: r.value, days: r.days, late: r.days > ACT_AT.requisitionDays })),
          ].sort((a, b) => b.value - a.value)}
        />
      ),
    });
  if (moves && moves.length > 0) buy.push({ span: 4, node: <Card icon={<IconTag size={16} />} title="Price moves" aside={<Pill tone="plain">90 days</Pill>} href="/finance/history"><PriceImpact moves={moves} /></Card> });
  if (grades && grades.length > 0) {
    buy.push({ span: 4, node: <Card icon={<IconLayers size={16} />} title="Cost sheet drift" aside={drifted ? <Pill tone="act">{drifted} past {ACT_AT.driftPct}%</Pill> : <Pill tone="ok">in line</Pill>} href="/sales/cost-sheets"><CostDrift grades={grades} /></Card> });
    buy.push({ span: 4, node: <Card icon={<IconFactory size={16} />} title="What a kilo costs" aside={<Pill tone="plain">today</Pill>} href="/sales/cost-sheets"><KiloCost grades={grades} /></Card> });
  }
  if (costIdx) buy.push({ span: 12, node: <Card icon={<IconTrend size={16} />} title="Material cost index" aside={<Pill tone="plain">base 100</Pill>} href="/finance/history"><div className="-mx-3.5 -mb-2"><CostIndexChart data={costIdx} /></div></Card> });
  if (buy.length) lenses.push({ key: "buy", label: "Buy", hint: "Spend, vendors and what a kilo costs", attention: (slip ? slip.requisitions.length + slip.overdue.length : 0) + drifted, panels: buy });

  const stock: LensPanel[] = [];
  if (ageing && ageing.length > 0) stock.push({ span: 8, node: <Card icon={<IconInventory size={16} />} title="How old the stock is" href="/procurement/inventory"><StockAgeing rows={ageing} /></Card> });
  if (stale)
    stock.push({
      span: 4,
      node: (
        <QueueCard
          icon={<IconLink size={16} />}
          title="Stock held for nothing"
          href="/planning"
          total={sum(stale.allocations, (a) => a.value)}
          count={stale.allocations.length + stale.shortages.length}
          empty="Every allocation is live."
          rows={[
            ...stale.allocations.map((a) => ({ key: a.id, href: a.href, title: a.material, sub: `${a.ref} · ${a.reason}`, value: a.value, days: a.days, late: true })),
            ...stale.shortages.map((s) => ({ key: s.id, href: "/planning", title: `${s.material} short`, sub: `${s.ref} · raise a PR`, value: null, days: s.days, late: false })),
          ]}
        />
      ),
    });
  if (docs && docs.length > 0)
    stock.push({ span: 12, node: <Card icon={<IconFlask size={16} />} title="Product documents" aside={docs.some((d) => d.blocked) ? <Pill tone="act">{docs.filter((d) => d.blocked).length} blocked</Pill> : <Pill tone="ok">complete</Pill>} href="/projects"><DocMatrix noun={tenant.noun.one} rows={docs} /></Card> });
  if (stock.length)
    lenses.push({
      key: "stock",
      label: "Stock & products",
      hint: "Age, allocations and the paperwork each product needs",
      attention: (stale ? stale.allocations.length : 0) + (docs?.filter((d) => d.blocked).length ?? 0),
      panels: stock,
    });

  const moneyP: LensPanel[] = [];
  if (trend) {
    moneyP.push(
      { span: 4, node: <Card icon={<IconTrend size={16} />} title="Revenue" aside={<Pill tone="plain">{trend.trends.revenue.period}</Pill>} href="/sales/invoices"><KpiChart trend={trend.trends.revenue} unit="inr" good="up" deltaUnit="pct" /></Card> },
      { span: 4, node: <Card icon={<IconGauge size={16} />} title="Gross margin" aside={<Pill tone="plain">{trend.trends.margin.period}</Pill>}><KpiChart trend={trend.trends.margin} unit="pct" good="up" deltaUnit="pts" /></Card> },
      { span: 4, node: <Card icon={<IconOrder size={16} />} title="Order book" aside={<Pill tone="plain">open</Pill>} href="/sales/orders"><KpiChart trend={trend.trends.orderBook} unit="inr" good="up" deltaUnit="pct" /></Card> },
    );
  }
  if (bridge) moneyP.push({ span: 8, node: <Card icon={<IconBridge size={16} />} title="Where revenue went" aside={<Pill tone="plain">12 months · ₹ Cr</Pill>} href="/finance/history"><BridgeColumns steps={bridge} /></Card> });
  if (trend) moneyP.push({ span: 4, node: <Card icon={<IconClock size={16} />} title="Cash cycle" href="/finance/receivable"><CycleGauge cycle={trend.cycle} /></Card> });
  if (moneyP.length) lenses.push({ key: "money", label: "Money", hint: "Twelve months of revenue, margin and cash", panels: moneyP });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The same 42px toolbar every list page opens with. No greeting. */}
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Today</h1>
        <span className="shrink-0 font-num text-[11.5px] tabular-nums text-muted">{dateLong(new Date())}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 p-3 md:p-4">
          <KpiStrip items={kpis} />

          <AlertsBoard groups={alerts} />

          {lenses.length > 0 && <LensBoard lenses={lenses} storageKey="dash.lens.mfg" />}
        </div>
      </div>
    </div>
  );
}

type QueueItem = { key: string; href: string; title: string; sub: string; value: number | null; days: number; late: boolean };

/** A queue as a card: its total, then the three rows to open first. */
function QueueCard({
  icon,
  title,
  href,
  total,
  totalLabel = "waiting",
  count,
  rows,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  href: string;
  total: number;
  totalLabel?: string;
  count: number;
  rows: QueueItem[];
  empty: string;
}) {
  return (
    <Card icon={icon} title={title} href={href} aside={count ? <Pill tone="act">{count}</Pill> : <Pill tone="ok">clear</Pill>}>
      {count === 0 ? (
        <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-success-bg text-success-text">
            <IconApprove size={18} />
          </span>
          <span className="text-[12px] text-muted">{empty}</span>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-num text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">{cr(total)}</span>
            <span className="text-[11px] text-muted">{totalLabel}</span>
          </div>
          <ul className="mt-3 flex flex-col gap-1">
            {rows.slice(0, 4).map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center gap-2.5 rounded-[6px] px-1.5 py-1.5 transition-colors duration-150 hover:bg-faint">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r.late ? "bg-danger" : "bg-warning"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-ink">{r.title}</span>
                    <span className="block truncate text-[10.5px] text-muted">{r.sub}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-1.5 py-[1px] font-num text-[10px] font-semibold tabular-nums ${r.late ? "bg-danger-bg text-danger-text" : "bg-faint text-muted"}`}>
                    {r.days}d
                  </span>
                  {r.value !== null && <span className="w-[58px] shrink-0 text-right font-num text-[11.5px] font-semibold tabular-nums text-ink">{cr(r.value)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/**
 * A completeness matrix. Stage decides, not count — a compound at trial missing
 * one document is blocked; one in development missing four is not.
 */
function DocMatrix({ rows, noun }: { rows: Awaited<ReturnType<typeof docMatrix>>; noun: string }) {
  const short = (t: string) => (t === "ROHS" ? "RoHS" : t === "COA" ? "CoA" : t);
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr>
            <th className="pb-2 text-left text-[10.5px] font-medium text-muted">{noun}</th>
            {DOC_TYPES.map((t) => (
              <th key={t} className="w-[64px] pb-2 text-center">
                <span className="inline-flex flex-col items-center gap-1 text-[10.5px] font-medium text-muted">
                  <IconDocument size={14} />
                  {short(t)}
                </span>
              </th>
            ))}
            <th className="w-[170px] pb-2 text-left text-[10.5px] font-medium text-muted">Stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const [grade, ...rest] = r.name.split(" · ");
            return (
              <tr key={r.id} className={`border-t border-edge/60 ${r.blocked ? "bg-danger-bg/40" : ""}`}>
                <td className="max-w-0 py-2 pr-3">
                  <Link href={`/projects/${r.id}`} className="group flex items-baseline gap-2">
                    <span className="font-num text-[11px] font-semibold tabular-nums text-ink">{grade}</span>
                    <span className="truncate text-[11.5px] text-muted group-hover:underline">{rest.join(" · ")}</span>
                  </Link>
                </td>
                {r.has.map((h, k) => (
                  <td key={k} className="py-2 text-center">
                    <span
                      role="img"
                      aria-label={`${DOC_TYPES[k]} ${h ? "on file" : "missing"}`}
                      className={`mx-auto grid h-[22px] w-[22px] place-items-center rounded-full ${
                        h ? "bg-primary text-surface" : r.blocked ? "border-2 border-dashed border-danger text-danger" : "border border-dashed border-edge"
                      }`}
                    >
                      {h ? (
                        <svg viewBox="0 0 12 12" className="h-[11px] w-[11px]" aria-hidden>
                          <path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : r.blocked ? (
                        <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" aria-hidden>
                          <path d="M3 3l6 6M9 3 3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      ) : null}
                    </span>
                  </td>
                ))}
                <td className="py-2 text-[11.5px]">
                  {r.blocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-[2px] font-semibold text-danger-text">
                      <IconAlert size={12} /> {titleise(r.stage)} · blocked
                    </span>
                  ) : (
                    <span className="text-muted">{titleise(r.stage)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The vendor's dashboard is a different product: its own prices and orders, nothing else. */
async function VendorDashboard({ vendorId, name }: { vendorId: string | null; name: string }) {
  const id = vendorId ?? "__unassigned__";

  const [vendor, pending, approved, orders] = await Promise.all([
    prisma.vendor.findUnique({ where: { id }, select: { name: true, code: true, rating: true } }),
    prisma.materialPrice.findMany({
      where: { vendorId: id, status: PriceStatus.PENDING_APPROVAL },
      include: { material: { select: { name: true, code: true } } },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.materialPrice.findMany({
      where: { vendorId: id, status: PriceStatus.APPROVED },
      include: { material: { select: { name: true, code: true } } },
      orderBy: { effectiveFrom: "desc" },
      take: 10,
    }),
    prisma.purchaseOrder.findMany({
      where: { vendorId: id },
      orderBy: { orderedOn: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 truncate text-[14px] font-semibold tracking-tight text-ink">
          {vendor?.name ?? "Vendor"}
        </h1>
        <span className="shrink-0 font-num text-[11.5px] text-muted">{vendor?.code ?? "—"}</span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center divide-x divide-edge/70 border-b border-edge bg-surface">
        <Figure label="Awaiting approval" value={String(pending.length)} tone={pending.length ? "warning" : "ink"} />
        <Figure label="Live rates" value={String(approved.length)} />
        <Figure label="Vendor rating" value={`${Number(vendor?.rating ?? 0).toFixed(1)}`} />
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-min items-start gap-2 overflow-auto scroll-thin p-2 lg:grid-cols-2">
        <Panel title="Your submissions awaiting approval" href="/vendor/submissions" hrefLabel="All submissions">
          {pending.length === 0 ? (
            <EmptyLine>Nothing pending. Submit a revision from your price list.</EmptyLine>
          ) : (
            pending.map((p) => (
              <QueueRow
                key={p.id}
                href="/vendor/submissions"
                primary={p.material.name}
                secondary={`${p.material.code} · submitted ${relative(p.submittedAt)} · effective ${date(p.effectiveFrom)}`}
                trailing={
                  <span className="flex items-center gap-2">
                    <span className="font-num text-[12px] font-semibold tabular-nums text-ink">
                      {ratePerKg(p.pricePerKg)}
                    </span>
                    <Chip tone={priceStatusTone(p.status)}>Pending</Chip>
                  </span>
                }
              />
            ))
          )}
        </Panel>

        <Panel title="Your live rates" href="/vendor/prices" hrefLabel="Price list">
          {approved.length === 0 ? (
            <EmptyLine>No approved rates on record yet.</EmptyLine>
          ) : (
            approved.map((p) => (
              <QueueRow
                key={p.id}
                href="/vendor/prices"
                primary={p.material.name}
                secondary={`${p.material.code} · effective ${date(p.effectiveFrom)}`}
                trailing={
                  <span className="font-num text-[12px] font-semibold tabular-nums text-ink">
                    {ratePerKg(p.pricePerKg)}
                  </span>
                }
              />
            ))
          )}
        </Panel>

        <Panel title="Purchase orders placed with you" href="/vendor/orders" hrefLabel="All orders" className="lg:col-span-2">
          {orders.length === 0 ? (
            <EmptyLine>No purchase orders on record.</EmptyLine>
          ) : (
            orders.map((o) => (
              <QueueRow
                key={o.id}
                href={`/vendor/orders/${o.id}`}
                primary={o.code}
                secondary={`Ordered ${date(o.orderedOn)} · expected ${date(o.expectedOn)}`}
                trailing={
                  <span className="flex items-center gap-2">
                    <span className="font-num text-[12px] font-semibold tabular-nums text-ink">
                      {money(o.totalValue)}
                    </span>
                    <Chip tone={poStatusTone(o.status)}>{titleise(o.status)}</Chip>
                  </span>
                }
              />
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

type LowStock = { id: string; code: string; name: string; onHand: number; reorder: number; lead: number };

async function lowStockRows(): Promise<LowStock[]> {
  return prisma.$queryRaw<LowStock[]>`
    SELECT m.id, m.code, m.name,
           COALESCE(SUM(b."availableQtyKg"), 0)::float AS "onHand",
           m."reorderLevelKg"::float AS reorder,
           m."leadTimeDays" AS lead
    FROM "RawMaterial" m
    LEFT JOIN "InventoryBatch" b ON b."materialId" = m.id AND b.status = 'AVAILABLE'
    WHERE m."isActive" = true
    GROUP BY m.id, m.code, m.name, m."reorderLevelKg", m."leadTimeDays"
    HAVING COALESCE(SUM(b."availableQtyKg"), 0) < m."reorderLevelKg"
    ORDER BY (COALESCE(SUM(b."availableQtyKg"), 0) / NULLIF(m."reorderLevelKg", 0)) ASC
  `;
}
