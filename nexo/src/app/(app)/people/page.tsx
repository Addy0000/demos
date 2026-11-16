import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { EmployeesGrid } from "../_services/grids";

export const metadata: Metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await requirePermission("hr:read");
  const since = new Date(new Date().getTime() - 30 * 86_400_000);
  const [rows, billable] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { not: "EXITED" } },
      include: { manager: { select: { name: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.timesheet.groupBy({ by: ["employeeId"], where: { date: { gte: since }, billable: true }, _sum: { hours: true } }),
  ]);
  const billBy = new Map(billable.map((b) => [b.employeeId, Number(b._sum.hours ?? 0)]));
  // 22 working days of 8 hours is the month's available time.
  const available = 22 * 8;

  return (
    <EmployeesGrid
      departments={Array.from(new Set(rows.map((r) => r.department))).sort()}
      rows={rows.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name,
        designation: e.designation,
        department: e.department,
        grade: e.grade,
        location: e.location,
        manager: e.manager?.name ?? null,
        joinedOn: e.joinedOn.toISOString(),
        status: e.status,
        monthlyCtc: Number(e.monthlyCtc),
        billRate: e.billRatePerHour ? Number(e.billRatePerHour) : null,
        utilisation: Math.min(1.2, (billBy.get(e.id) ?? 0) / available),
      }))}
    />
  );
}
