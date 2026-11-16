import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RequisitionsGrid } from "./requisitions-grid";

export const metadata: Metadata = { title: "Purchase requisitions" };
export const dynamic = "force-dynamic";

export default async function RequisitionsPage() {
  const user = await requirePermission("req:read");

  const rows = await prisma.purchaseRequisition.findMany({
    include: {
      raisedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      project: { select: { id: true, name: true } },
      lines: {
        select: {
          quantityKg: true, orderedKg: true,
          material: { select: { name: true, currentPricePerKg: true } },
        },
      },
      _count: { select: { inquiries: true, orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <RequisitionsGrid
      canApprove={can(user.role, "req:approve")}
      canWrite={can(user.role, "req:write")}
      rows={rows.map((r) => {
        const wanted = r.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const ordered = r.lines.reduce((a, l) => a + Number(l.orderedKg), 0);
        // Indicative only — the real number arrives with the quotations.
        const estimate = r.lines.reduce(
          (a, l) => a + Number(l.quantityKg) * Number(l.material.currentPricePerKg ?? 0),
          0,
        );
        return {
          id: r.id,
          code: r.code,
          status: r.status,
          purpose: r.purpose ?? "—",
          requiredBy: r.requiredBy?.toISOString() ?? null,
          raisedOn: r.createdAt.toISOString(),
          raisedBy: r.raisedBy?.name ?? "—",
          approvedBy: r.approvedBy?.name ?? "—",
          projectId: r.project?.id ?? null,
          projectName: r.project?.name ?? null,
          lineCount: r.lines.length,
          firstMaterial: r.lines[0]?.material.name ?? "—",
          wantedKg: wanted,
          orderedKg: ordered,
          coverage: wanted > 0 ? (ordered / wanted) * 100 : 0,
          estimate,
          inquiryCount: r._count.inquiries,
          orderCount: r._count.orders,
        };
      })}
    />
  );
}
