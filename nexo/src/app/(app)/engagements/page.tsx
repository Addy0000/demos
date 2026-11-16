import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { EngagementsGrid } from "../_services/grids";

export const metadata: Metadata = { title: "Engagements" };
export const dynamic = "force-dynamic";

export default async function EngagementsPage() {
  await requirePermission("engagement:read");
  const now = new Date().getTime();
  const rows = await prisma.engagement.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      tasks: { select: { plannedHours: true, progressPct: true } },
      invoices: { select: { totalValue: true } },
    },
    orderBy: { endOn: "asc" },
  });
  const hours = await prisma.timesheet.groupBy({ by: ["engagementId"], _sum: { hours: true } });
  const hoursBy = new Map(hours.map((h) => [h.engagementId, Number(h._sum.hours ?? 0)]));

  return (
    <EngagementsGrid
      lines={Array.from(new Set(rows.map((r) => r.serviceLine))).sort()}
      rows={rows.map((e) => {
        const planned = e.tasks.reduce((s, t) => s + t.plannedHours, 0) || 1;
        const progress = Math.round(e.tasks.reduce((s, t) => s + t.progressPct * t.plannedHours, 0) / planned);
        const span = e.endOn.getTime() - e.startOn.getTime();
        return {
          id: e.id,
          code: e.code,
          name: e.name,
          clientId: e.customer.id,
          client: e.customer.name,
          serviceLine: e.serviceLine,
          status: e.status,
          startOn: e.startOn.toISOString(),
          endOn: e.endOn.toISOString(),
          elapsed: Math.min(1, Math.max(0, (now - e.startOn.getTime()) / Math.max(1, span))),
          hours: Math.round(hoursBy.get(e.id) ?? 0),
          budgetHours: e.budgetHours,
          contractValue: Number(e.contractValue),
          billed: e.invoices.reduce((s, i) => s + Number(i.totalValue), 0),
          manager: e.manager?.name ?? null,
          progress,
        };
      })}
    />
  );
}
