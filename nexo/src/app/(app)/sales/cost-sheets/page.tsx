import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CostSheetsGrid } from "./cost-sheets-grid";

export const metadata: Metadata = { title: "Cost sheets" };
export const dynamic = "force-dynamic";

export default async function CostSheetsPage() {
  const user = await requirePermission("costsheet:read");

  const rows = await prisma.costSheet.findMany({
    include: {
      preparedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      formulation: {
        select: {
          project: { select: { id: true, code: true, name: true, application: true, customer: { select: { name: true } } } },
          _count: { select: { lines: true } },
        },
      },
      _count: { select: { quotations: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <CostSheetsGrid
      canApprove={can(user.role, "costsheet:approve")}
      rows={rows.map((c) => {
        const material = Number(c.materialCostPerKg);
        const conversion = Number(c.conversionPerKg);
        const selling = Number(c.sellingRatePerKg);
        return {
          id: c.id,
          code: c.code,
          status: c.status,
          projectId: c.formulation.project.id,
          projectName: c.formulation.project.name,
          projectCode: c.formulation.project.code,
          application: c.formulation.project.application,
          customerName: c.formulation.project.customer?.name ?? "—",
          materialCost: material,
          conversion,
          overheadPct: Number(c.overheadPct),
          marginPct: Number(c.marginPct),
          sellingRate: selling,
          // What the sheet actually earns per kg, in rupees rather than percent.
          contribution: selling - material - conversion,
          materialLines: c.formulation._count.lines,
          quotationCount: c._count.quotations,
          preparedBy: c.preparedBy?.name ?? "—",
          approvedBy: c.approvedBy?.name ?? "—",
          preparedOn: c.createdAt.toISOString(),
        };
      })}
    />
  );
}
