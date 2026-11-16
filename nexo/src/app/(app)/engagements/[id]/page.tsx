import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";
import { Gantt, toneFor } from "../../_services/gantt";
import { Burn } from "../../_services/grids";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const e = await prisma.engagement.findUnique({ where: { id }, select: { code: true } });
  return { title: e?.code ?? "Engagement" };
}
export const dynamic = "force-dynamic";

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("engagement:read");
  const { id } = await params;
  const e = await prisma.engagement.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, gstin: true } },
      manager: { select: { name: true, designation: true } },
      tasks: { include: { assignee: { select: { name: true } } }, orderBy: [{ startOn: "asc" }, { wbs: "asc" }] },
      invoices: { orderBy: { invoiceDate: "asc" } },
    },
  });
  if (!e) notFound();

  const sheets = await prisma.timesheet.groupBy({
    by: ["employeeId"],
    where: { engagementId: id },
    _sum: { hours: true },
  });
  const people = await prisma.employee.findMany({
    where: { id: { in: sheets.map((s) => s.employeeId) } },
    select: { id: true, name: true, designation: true, billRatePerHour: true },
  });
  const byTask = await prisma.timesheet.groupBy({ by: ["taskId"], where: { engagementId: id }, _sum: { hours: true } });
  const taskHours = new Map(byTask.map((b) => [b.taskId, Number(b._sum.hours ?? 0)]));
  const hoursTotal = sheets.reduce((s, x) => s + Number(x._sum.hours ?? 0), 0);

  const now = new Date();
  const planned = e.tasks.reduce((s, t) => s + t.plannedHours, 0) || 1;
  const progress = Math.round(e.tasks.reduce((s, t) => s + t.progressPct * t.plannedHours, 0) / planned);
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - e.startOn.getTime()) / Math.max(1, e.endOn.getTime() - e.startOn.getTime())));
  const billed = e.invoices.reduce((s, i) => s + Number(i.totalValue), 0);
  const received = e.invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  const nextMilestone = e.tasks.find((t) => t.isMilestone && t.status !== "DONE");

  const from = new Date(e.startOn.getTime() - 3 * 86_400_000);
  const to = new Date(e.endOn.getTime() + 3 * 86_400_000);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/engagements"
        backLabel="Engagements"
        code={e.code}
        title={e.name}
        status={<Chip tone={e.status === "ACTIVE" ? "success" : e.status === "ON_HOLD" ? "warning" : "neutral"}>{titleise(e.status)}</Chip>}
        meta={[
          { label: "Client", value: <Link href={`/customers/${e.customer.id}`} className="ref-link">{e.customer.name}</Link> },
          { label: "Service line", value: e.serviceLine },
          { label: "Window", value: `${date(e.startOn)} – ${date(e.endOn)}` },
          { label: "Progress", value: <Burn used={progress} of={100} elapsed={elapsed} /> },
          { label: "Hours", value: <span className="font-num">{Math.round(hoursTotal)} / {e.budgetHours}</span> },
          { label: "Contract", value: money(e.contractValue) },
          { label: "Next milestone", value: nextMilestone ? `${nextMilestone.name.replace(/^Milestone: /, "")} · ${date(nextMilestone.endOn)}` : "All met" },
        ]}
      />
      <RecordBody
        main={
          <>
            <Section title="Plan and timeline" hint={`${e.tasks.length} tasks · today's line in red`} padded={false}>
              <Gantt
                from={from}
                to={to}
                rows={e.tasks.map((t) => ({
                  id: t.id,
                  label: `${t.wbs}  ${t.name}`,
                  sub: t.assignee?.name ?? undefined,
                  start: t.startOn.toISOString(),
                  end: t.endOn.toISOString(),
                  progress: t.progressPct,
                  milestone: t.isMilestone,
                  tone: toneFor(t.startOn, t.endOn, t.progressPct, t.status, now),
                }))}
              />
            </Section>

            <Section title="Tasks" hint="hours booked against plan" padded={false}>
              <MiniTable
                head={[
                  { label: "WBS", width: "64px" },
                  { label: "Task" },
                  { label: "Owner" },
                  { label: "Dates" },
                  { label: "Status" },
                  { label: "Booked / planned", align: "right" },
                  { label: "Done", align: "right" },
                ]}
              >
                {e.tasks.map((t) => (
                  <Tr key={t.id}>
                    <Td num muted>{t.wbs}</Td>
                    <Td>{t.isMilestone ? <span className="font-medium">{t.name}</span> : t.name}</Td>
                    <Td muted>{t.assignee?.name ?? "—"}</Td>
                    <Td num muted>{date(t.startOn)} – {date(t.endOn)}</Td>
                    <Td><Chip tone={t.status === "DONE" ? "success" : t.status === "BLOCKED" ? "danger" : t.status === "IN_PROGRESS" ? "info" : "neutral"}>{titleise(t.status)}</Chip></Td>
                    <Td align="right" num>{Math.round(taskHours.get(t.id) ?? 0)} / {t.plannedHours}</Td>
                    <Td align="right" num>{t.progressPct}%</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </>
        }
        aside={
          <>
            <Section title="Engagement">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Manager", value: e.manager ? `${e.manager.name}, ${e.manager.designation}` : "—" },
                  { label: "Client GSTIN", value: <span className="font-num">{e.customer.gstin ?? "—"}</span> },
                  { label: "Billed", value: money(billed) },
                  { label: "Received", value: money(received) },
                  { label: "Left to bill", value: money(Number(e.contractValue) * 1.18 - billed) },
                  { label: "Scope", value: e.description ?? "—" },
                ]}
              />
            </Section>
            <Section title="Team" hint="hours booked" padded={false}>
              <MiniTable head={[{ label: "Consultant" }, { label: "Hours", align: "right" }, { label: "Value", align: "right" }]}>
                {people
                  .map((p) => ({ p, h: Number(sheets.find((s) => s.employeeId === p.id)?._sum.hours ?? 0) }))
                  .sort((a, b) => b.h - a.h)
                  .map(({ p, h }) => (
                    <Tr key={p.id}>
                      <Td>
                        <span className="block">{p.name}</span>
                        <span className="block text-[10.5px] text-muted">{p.designation}</span>
                      </Td>
                      <Td align="right" num>{Math.round(h)}</Td>
                      <Td align="right" num>{money(h * Number(p.billRatePerHour ?? 0))}</Td>
                    </Tr>
                  ))}
              </MiniTable>
            </Section>
            <Section title="Invoices" padded={false}>
              <MiniTable head={[{ label: "Invoice" }, { label: "Date" }, { label: "Total", align: "right" }, { label: "Status" }]} empty="Nothing billed yet.">
                {e.invoices.map((i) => (
                  <Tr key={i.id}>
                    <Td num>{i.code}</Td>
                    <Td num muted>{date(i.invoiceDate)}</Td>
                    <Td align="right" num>{money(i.totalValue)}</Td>
                    <Td><Chip tone={i.status === "PAID" ? "success" : i.status === "OVERDUE" ? "danger" : i.status === "PART_PAID" ? "warning" : "info"}>{titleise(i.status)}</Chip></Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </>
        }
      />
    </div>
  );
}
