import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PayrollGrid } from "../../_services/grids";

export const metadata: Metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  await requirePermission("payroll:read");
  const runs = await prisma.payrollRun.findMany({ orderBy: { month: "desc" } });
  return (
    <PayrollGrid
      rows={runs.map((r) => ({
        id: r.id,
        code: r.code,
        month: r.month.toISOString(),
        status: r.status,
        headcount: r.headcount,
        gross: Number(r.gross),
        deductions: Number(r.deductions),
        net: Number(r.net),
        paidAt: r.paidAt?.toISOString() ?? null,
      }))}
    />
  );
}
