import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { TimesheetsGrid } from "../../_services/grids";

export const metadata: Metadata = { title: "Timesheets" };
export const dynamic = "force-dynamic";

export default async function TimesheetsPage() {
  await requirePermission("engagement:read");
  const since = new Date(new Date().getTime() - 42 * 86_400_000);
  const rows = await prisma.timesheet.findMany({
    where: { date: { gte: since } },
    include: {
      employee: { select: { id: true, name: true } },
      engagement: { select: { id: true, code: true } },
      task: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });
  return (
    <TimesheetsGrid
      people={Array.from(new Set(rows.map((r) => r.employee.name))).sort()}
      rows={rows.map((t) => ({
        id: t.id,
        date: t.date.toISOString(),
        employee: t.employee.name,
        employeeId: t.employee.id,
        engagementId: t.engagement.id,
        engagement: t.engagement.code,
        task: t.task?.name ?? null,
        hours: Number(t.hours),
        billable: t.billable ? "Billable" : "Non-billable",
        approved: t.approved ? "Approved" : "Pending",
      }))}
    />
  );
}
