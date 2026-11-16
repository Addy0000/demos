import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { LeaveGrid } from "../../_services/grids";

export const metadata: Metadata = { title: "Leave" };
export const dynamic = "force-dynamic";

export default async function LeavePage() {
  const user = await requirePermission("hr:read");
  const rows = await prisma.leaveRequest.findMany({
    include: { employee: { select: { name: true, department: true } }, decidedBy: { select: { name: true } } },
    orderBy: { fromDate: "desc" },
  });
  return (
    <LeaveGrid
      canDecide={can(user.role, "hr:write") || can(user.role, "engagement:write")}
      rows={rows.map((l) => ({
        id: l.id,
        code: l.code,
        employee: l.employee.name,
        department: l.employee.department,
        type: l.type,
        fromDate: l.fromDate.toISOString(),
        toDate: l.toDate.toISOString(),
        days: Number(l.days),
        reason: l.reason,
        status: l.status,
        decidedBy: l.decidedBy?.name ?? null,
      }))}
    />
  );
}
