import Link from "next/link";
import { getTenant } from "@/lib/tenant-server";
import { prisma } from "@/lib/prisma";
import { MiniTable, Td, Tr } from "@/components/detail/record";
import { Card, Pill } from "@/components/charts/deck-charts";
import { Chip } from "@/components/ui/chip";
import { KpiStrip, LensBoard, NeedsYou, type Kpi, type Lens, type Need } from "@/components/dashboard/command";
import { IconClock, IconUsers, IconCash, IconWallet, IconCustomers, IconTrend, IconApprove } from "@/components/icons";
import { compactInr, date, dateLong } from "@/lib/format";
import { Gantt, toneFor } from "./gantt";
import { Burn } from "./grids";

const DAY = 86_400_000;
const cr = (v: number) => compactInr(v).replace("₹ ", "₹");

/**
 * The services firm's command board. Figures across the top, the live
 * portfolio on the calendar beside what needs a decision, then three lenses:
 * Delivery, People and Money. Same instrument as the manufacturers' board, so
 * a director moving between companies reads both the same way.
 */
export async function ServicesDashboard({ name }: { name: string }) {
  const tenant = await getTenant();
  const engs = tenant.labels["/engagements"] ?? "Engagements";
  const eng = engs.replace(/s$/, "");
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const since30 = new Date(now.getTime() - 30 * DAY);
  const sixMonths = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [engagements, sheets, pendingLeave, pendingSheets, invoices, attendanceToday, headcount, depts, billable30, runs, recentInvoices] = await Promise.all([
    prisma.engagement.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      include: {
        customer: { select: { name: true } },
        manager: { select: { name: true } },
        tasks: { select: { name: true, plannedHours: true, progressPct: true, isMilestone: true, status: true, endOn: true } },
      },
      orderBy: { startOn: "asc" },
    }),
    prisma.timesheet.groupBy({ by: ["engagementId"], _sum: { hours: true } }),
    prisma.leaveRequest.findMany({ where: { status: "PENDING" }, include: { employee: { select: { name: true } } }, orderBy: { fromDate: "asc" } }),
    prisma.timesheet.count({ where: { approved: false } }),
    prisma.serviceInvoice.findMany({ where: { status: { not: "PAID" } }, include: { customer: { select: { name: true } } } }),
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { date: todayUtc }, _count: { _all: true } }),
    prisma.employee.count({ where: { status: { not: "EXITED" } } }),
    prisma.employee.groupBy({ by: ["department"], where: { status: { not: "EXITED" }, billRatePerHour: { not: null } }, _count: { _all: true } }),
    prisma.timesheet.findMany({ where: { date: { gte: since30 }, billable: true }, select: { hours: true, employee: { select: { department: true } } } }),
    prisma.payrollRun.findMany({ orderBy: { month: "asc" }, take: 6 }),
    prisma.serviceInvoice.findMany({ where: { invoiceDate: { gte: sixMonths } }, select: { invoiceDate: true, totalValue: true, paidAmount: true, subtotal: true } }),
  ]);

  // ── Delivery health ───────────────────────────────────────────────────────
  const hoursBy = new Map(sheets.map((s) => [s.engagementId, Number(s._sum.hours ?? 0)]));
  const health = engagements
    .map((e) => {
      const planned = e.tasks.reduce((s, t) => s + t.plannedHours, 0) || 1;
      const progress = Math.round(e.tasks.reduce((s, t) => s + t.progressPct * t.plannedHours, 0) / planned) / 100;
      const elapsed = Math.min(1, Math.max(0, (now.getTime() - e.startOn.getTime()) / Math.max(1, e.endOn.getTime() - e.startOn.getTime())));
      const hours = hoursBy.get(e.id) ?? 0;
      const next = e.tasks.filter((t) => t.isMilestone && t.status !== "DONE").sort((a, b) => a.endOn.getTime() - b.endOn.getTime())[0];
      const slip = elapsed - progress;
      const burn = hours / Math.max(1, e.budgetHours);
      const state = e.status === "ON_HOLD" ? "hold" : slip > 0.12 ? "slipping" : burn > progress + 0.15 ? "burning" : "ok";
      return { e, progress, elapsed, hours, slip, burn, next, state };
    })
    .sort((a, b) => b.slip - a.slip);
  const slipping = health.filter((h) => h.state === "slipping" || h.state === "burning");
  const milestones = health
    .filter((h) => h.next && h.next.endOn.getTime() - now.getTime() < 14 * DAY)
    .map((h) => ({ e: h.e, t: h.next! }))
    .sort((a, b) => a.t.endOn.getTime() - b.t.endOn.getTime());

  // ── Money ─────────────────────────────────────────────────────────────────
  const outstanding = invoices.reduce((s, i) => s + Number(i.totalValue) - Number(i.paidAmount), 0);
  const overdueInv = invoices.filter((i) => i.dueOn < now);
  const overdue = overdueInv.reduce((s, i) => s + Number(i.totalValue) - Number(i.paidAmount), 0);
  const buckets = [
    { label: "Not due", v: 0, tone: "bg-primary" },
    { label: "1–30 days", v: 0, tone: "bg-warning" },
    { label: "31–60 days", v: 0, tone: "bg-danger/70" },
    { label: "Over 60 days", v: 0, tone: "bg-danger" },
  ];
  for (const i of invoices) {
    const late = Math.floor((now.getTime() - i.dueOn.getTime()) / DAY);
    buckets[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3]!.v += Number(i.totalValue) - Number(i.paidAmount);
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.v));
  const months = Array.from({ length: 6 }, (_, k) => {
    const m = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1);
    const inMonth = recentInvoices.filter((i) => i.invoiceDate.getFullYear() === m.getFullYear() && i.invoiceDate.getMonth() === m.getMonth());
    return { label: m.toLocaleDateString("en-IN", { month: "short" }), billed: inMonth.reduce((s, i) => s + Number(i.subtotal), 0), partial: k === 5 };
  });
  const billedThis = months[5]!.billed;
  const billedLast = months[4]!.billed;
  const maxMonth = Math.max(1, ...months.map((m) => m.billed));

  // ── People ────────────────────────────────────────────────────────────────
  const att = Object.fromEntries(attendanceToday.map((a) => [a.status, a._count._all])) as Record<string, number>;
  const marked = attendanceToday.reduce((s, a) => s + a._count._all, 0);
  const billHoursByDept = new Map<string, number>();
  for (const t of billable30) billHoursByDept.set(t.employee.department, (billHoursByDept.get(t.employee.department) ?? 0) + Number(t.hours));
  const utilisation = depts.map((d) => ({ dept: d.department, n: d._count._all, u: (billHoursByDept.get(d.department) ?? 0) / (d._count._all * 22 * 8) })).sort((a, b) => b.u - a.u);
  const billablePeople = depts.reduce((s, d) => s + d._count._all, 0);
  const firmUtil = billablePeople ? billable30.reduce((s, t) => s + Number(t.hours), 0) / (billablePeople * 22 * 8) : 0;
  const maxPay = Math.max(1, ...runs.map((r) => Number(r.gross)));

  const kpis: Kpi[] = [
    { key: "billed", label: `Billed, ${now.toLocaleDateString("en-IN", { month: "long" })}`, value: billedThis, unit: "inr", delta: billedLast ? ((billedThis - billedLast) / billedLast) * 100 : null, deltaUnit: "pct", good: "up", against: "vs last month, part-month", href: "/billing" },
    { key: "overdue", label: "Overdue from clients", value: overdue, unit: "inr", note: `of ${cr(outstanding)} outstanding`, alert: buckets[3]!.v > 0, href: "/billing" },
    { key: "util", label: "Billable utilisation", value: firmUtil * 100, unit: "pct", note: "last 30 days, delivery staff", href: "/engagements/timesheets" },
    { key: "active", label: `Active ${engs.toLowerCase()}`, value: health.filter((h) => h.e.status === "ACTIVE").length, unit: "count", note: slipping.length ? `${slipping.length} need attention` : "all on track", alert: slipping.length > 0, href: "/engagements" },
    { key: "people", label: "In today", value: (att.PRESENT ?? 0) + (att.WFH ?? 0) + (att.HALF_DAY ?? 0), unit: "count", note: `of ${headcount}; ${headcount - marked} not yet marked`, href: "/people/attendance" },
    { key: "waiting", label: "Waiting on you", value: pendingLeave.length + overdueInv.length + milestones.filter((m) => m.t.endOn < now).length, unit: "count", note: "leave, collections, late milestones", alert: pendingLeave.length > 0 },
  ];

  const needs: Need[] = [
    ...slipping.slice(0, 3).map((h) => ({
      key: `eng-${h.e.id}`,
      label: `${h.e.code} ${h.state === "slipping" ? "slipping" : "burning hours"}`,
      detail: `${h.e.customer.name}: ${Math.round(h.progress * 100)}% done, ${Math.round(h.elapsed * 100)}% of time gone`,
      href: `/engagements/${h.e.id}`,
      tone: "act" as const,
    })),
    ...(overdueInv.length ? [{ key: "overdue", label: "Client invoices past due", detail: overdueInv.slice(0, 2).map((i) => i.customer.name).join(", "), count: overdueInv.length, value: overdue, href: "/billing", tone: "act" as const }] : []),
    ...(pendingLeave.length ? [{ key: "leave", label: "Leave requests to approve", detail: pendingLeave.slice(0, 3).map((l) => l.employee.name).join(", "), count: pendingLeave.length, href: "/people/leave", tone: "slow" as const }] : []),
    ...(milestones.length ? [{ key: "ms", label: "Milestones due in 14 days", detail: milestones.slice(0, 2).map((m) => m.e.code).join(", "), count: milestones.length, href: "/engagements/timeline", tone: "slow" as const }] : []),
    ...(pendingSheets ? [{ key: "ts", label: "Timesheet entries to approve", detail: "approved hours drive billing and utilisation", count: pendingSheets, href: "/engagements/timesheets", tone: "slow" as const }] : []),
  ];

  const lenses: Lens[] = [
    {
      key: "delivery",
      label: "Delivery",
      hint: "Progress against time, hours against budget",
      attention: slipping.length,
      panels: [
        {
          span: 8,
          node: (
            <Card icon={<IconTrend size={16} />} title="Delivery health" aside={<Pill tone={slipping.length ? "act" : "ok"}>{slipping.length ? `${slipping.length} at risk` : "on track"}</Pill>} href="/engagements">
              <div className="-mx-3.5">
                <MiniTable head={[{ label: eng }, { label: "Client" }, { label: "Progress v time" }, { label: "Hours v budget" }, { label: "State" }]}>
                  {health.map((h) => (
                    <Tr key={h.e.id}>
                      <Td>
                        <Link href={`/engagements/${h.e.id}`} className="ref-link font-num">
                          {h.e.code}
                        </Link>
                      </Td>
                      <Td>{h.e.customer.name}</Td>
                      <Td><Burn used={Math.round(h.progress * 100)} of={100} elapsed={h.elapsed} /></Td>
                      <Td><Burn used={h.hours} of={h.e.budgetHours} /></Td>
                      <Td>
                        <Chip tone={h.state === "hold" ? "warning" : h.state === "slipping" ? "danger" : h.state === "burning" ? "warning" : "success"}>
                          {h.state === "hold" ? "On hold" : h.state === "slipping" ? "Slipping" : h.state === "burning" ? "Over-burning" : "On track"}
                        </Chip>
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              </div>
            </Card>
          ),
        },
        {
          span: 4,
          node: (
            <Card icon={<IconClock size={16} />} title="Milestones, next 14 days" href="/engagements/timeline">
              {milestones.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-muted">Nothing due.</p>
              ) : (
                <ol className="relative ml-1.5 border-l border-edge">
                  {milestones.map(({ e, t }) => {
                    const late = t.endOn < now;
                    return (
                      <li key={`${e.id}-${t.name}`} className="relative pb-3 pl-4 last:pb-0">
                        <span aria-hidden className={`absolute -left-[5px] top-1.5 h-[9px] w-[9px] rotate-45 ${late ? "bg-danger" : "bg-ink"}`} />
                        <p className="text-[12.5px] font-medium text-ink">{t.name.replace(/^Milestone: /, "")}</p>
                        <p className="mt-0.5 flex justify-between gap-2 text-[11px] text-muted">
                          <span className="truncate">{e.code} · {e.customer.name}</span>
                          <span className={`shrink-0 font-num ${late ? "font-semibold text-danger-text" : ""}`}>{late ? `late · ${date(t.endOn)}` : date(t.endOn)}</span>
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          ),
        },
      ],
    },
    {
      key: "people",
      label: "People",
      hint: "Who is where today, and how much of their time is billable",
      attention: pendingLeave.length,
      panels: [
        {
          span: 6,
          node: (
            <Card icon={<IconUsers size={16} />} title="Today" aside={<Pill tone="plain">{headcount} on the roll</Pill>} href="/people/attendance">
              <div className="flex h-3 overflow-hidden rounded-full bg-faint" role="img" aria-label="Attendance today">
                {(
                  [
                    ["PRESENT", "bg-success"],
                    ["WFH", "bg-info"],
                    ["HALF_DAY", "bg-success/50"],
                    ["LEAVE", "bg-special"],
                    ["ABSENT", "bg-danger"],
                  ] as const
                ).map(([k, c]) => (att[k] ? <span key={k} className={c} style={{ width: `${(att[k]! / headcount) * 100}%` }} /> : null))}
              </div>
              <dl className="mt-3 grid grid-cols-5 gap-2">
                {(
                  [
                    ["PRESENT", "In office", "bg-success"],
                    ["WFH", "At client", "bg-info"],
                    ["HALF_DAY", "Half day", "bg-success/50"],
                    ["LEAVE", "On leave", "bg-special"],
                    ["ABSENT", "Absent", "bg-danger"],
                  ] as const
                ).map(([k, l, c]) => (
                  <div key={k}>
                    <dd className={`font-num text-[20px] font-semibold tabular-nums ${k === "ABSENT" && att[k] ? "text-danger-text" : "text-ink"}`}>{att[k] ?? 0}</dd>
                    <dt className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted">
                      <span className={`h-2 w-2 rounded-[2px] ${c}`} />
                      {l}
                    </dt>
                  </div>
                ))}
              </dl>
              <p className="mt-4 border-t border-edge/60 pt-3 text-[11px] font-medium text-muted">Billable utilisation by department, last 30 days</p>
              <ul className="mt-2 flex flex-col gap-2">
                {utilisation.map((u) => (
                  <li key={u.dept} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[12px]">
                    <span className="truncate">
                      {u.dept} <span className="text-muted">· {u.n}</span>
                    </span>
                    <Burn used={u.u} of={1} />
                  </li>
                ))}
              </ul>
            </Card>
          ),
        },
        {
          span: 6,
          node: (
            <Card icon={<IconApprove size={16} />} title="Leave waiting" aside={<Pill tone={pendingLeave.length ? "slow" : "ok"}>{pendingLeave.length || "clear"}</Pill>} href="/people/leave">
              {pendingLeave.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-muted">No requests waiting.</p>
              ) : (
                <ul className="-mx-1.5 flex flex-col">
                  {pendingLeave.map((l) => (
                    <li key={l.id}>
                      <Link href="/people/leave" className="flex items-center gap-3 rounded-[6px] px-1.5 py-2 transition-colors duration-150 hover:bg-faint">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-ink">{l.employee.name}</span>
                          <span className="block truncate text-[11px] text-muted">{l.reason ?? l.type.toLowerCase()}</span>
                        </span>
                        <span className="shrink-0 text-right font-num text-[11px] tabular-nums text-muted">
                          {date(l.fromDate)}
                          <span className="block text-ink">{Number(l.days)} d</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ),
        },
      ],
    },
    {
      key: "money",
      label: "Money",
      hint: "Billing, collections and the payroll they pay for",
      attention: overdueInv.length,
      panels: [
        {
          span: 6,
          node: (
            <Card icon={<IconCash size={16} />} title="Billed by month" aside={<Pill tone="plain">ex-GST</Pill>} href="/billing">
              <div className="flex h-[168px] items-end gap-3 pt-4" role="img" aria-label={months.map((m) => `${m.label} ${cr(m.billed)}`).join(", ")}>
                {months.map((m) => (
                  <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="font-num text-[10.5px] tabular-nums text-muted">{cr(m.billed)}</span>
                    <span
                      className={`w-full max-w-[44px] rounded-t-[4px] ${m.partial ? "screen text-primary" : "bg-primary"}`}
                      style={{ height: `${Math.max(3, (m.billed / maxMonth) * 120)}px` }}
                    />
                    <span className="text-[11px] text-muted">{m.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          ),
        },
        {
          span: 6,
          node: (
            <Card icon={<IconWallet size={16} />} title="Owed by clients" aside={<Pill tone={buckets[3]!.v > 0 ? "act" : "plain"}>{cr(outstanding)}</Pill>} href="/billing">
              <ul className="flex flex-col gap-3 pt-2">
                {buckets.map((b) => (
                  <li key={b.label} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-[12px]">
                    <span className="text-muted">{b.label}</span>
                    <span className="h-[10px] overflow-hidden rounded-full bg-faint">
                      <span className={`block h-full rounded-full ${b.tone}`} style={{ width: `${(b.v / maxBucket) * 100}%` }} />
                    </span>
                    <span className="font-num tabular-nums">{cr(b.v)}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-4 border-t border-edge/60 pt-2">
                {overdueInv
                  .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())
                  .slice(0, 3)
                  .map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 py-1 text-[12px]">
                      <span className="truncate">{i.customer.name}</span>
                      <span className="shrink-0 font-num tabular-nums text-danger-text">
                        {cr(Number(i.totalValue) - Number(i.paidAmount))} · {Math.floor((now.getTime() - i.dueOn.getTime()) / DAY)} d
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          ),
        },
        {
          span: 12,
          node: (
            <Card icon={<IconCustomers size={16} />} title="Payroll, last six runs" aside={<Pill tone="plain">gross</Pill>} href="/people/payroll">
              <div className="grid grid-cols-6 items-end gap-3 pt-3">
                {runs.map((r) => (
                  <Link key={r.id} href={`/people/payroll/${r.id}`} className="group flex flex-col gap-1.5">
                    <span className="font-num text-[11px] tabular-nums text-muted group-hover:text-ink">{cr(Number(r.gross))}</span>
                    <span className="block h-2.5 overflow-hidden rounded-full bg-faint">
                      <span className={`block h-full rounded-full ${r.status === "PAID" ? "bg-primary" : "bg-warning"}`} style={{ width: `${(Number(r.gross) / maxPay) * 100}%` }} />
                    </span>
                    <span className="text-[11px] text-muted">
                      {r.month.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })} · {r.status === "PAID" ? "paid" : "to pay"}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          ),
        },
      ],
    },
  ];

  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">Today</h1>
        <span className="shrink-0 font-num text-[11.5px] tabular-nums text-muted">{dateLong(now)}</span>
        <span className="ml-auto hidden text-[11.5px] text-muted sm:inline">Signed in as {name}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-4 p-3 md:p-4">
          <KpiStrip items={kpis} />

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-edge bg-surface">
              <header className="flex items-center gap-3 border-b border-edge/70 px-4 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold leading-tight text-ink">Portfolio on the calendar</h2>
                  <p className="text-[11px] text-muted">live {engs.toLowerCase()}, filled to progress · today in red</p>
                </div>
                <div className="flex-1" />
                <Link href="/engagements/timeline" className="ref-link text-[12px]">
                  Full timeline
                </Link>
              </header>
              <Gantt
                from={from}
                to={to}
                labelWidth={250}
                rows={health.map((h) => ({
                  id: h.e.id,
                  label: `${h.e.code}  ${h.e.customer.name}`,
                  sub: h.e.serviceLine,
                  start: h.e.startOn.toISOString(),
                  end: h.e.endOn.toISOString(),
                  progress: Math.round(h.progress * 100),
                  tone: toneFor(h.e.startOn, h.e.endOn, Math.round(h.progress * 100), h.e.status, now),
                  href: `/engagements/${h.e.id}`,
                }))}
              />
            </section>
            <div className="min-w-0 xl:relative">
              <div className="xl:absolute xl:inset-0 [&>section]:h-full">
                <NeedsYou items={needs} />
              </div>
            </div>
          </div>

          <LensBoard lenses={lenses} storageKey="dash.lens.services" />
        </div>
      </div>
    </div>
  );
}
