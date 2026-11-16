import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { HistoryGrid } from "./history-grid";

export const metadata: Metadata = { title: "Price history" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  await requirePermission("price:read");

  const rows = await prisma.materialPrice.findMany({
    include: {
      material: { select: { id: true, code: true, name: true, category: true } },
      vendor: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 3000,
  });

  return (
    <HistoryGrid
      rows={rows.map((p) => ({
        id: p.id,
        materialId: p.material.id,
        materialCode: p.material.code,
        materialName: p.material.name,
        category: p.material.category,
        vendorId: p.vendor.id,
        vendorName: p.vendor.name,
        pricePerKg: Number(p.pricePerKg),
        changePct: p.changePct !== null ? Number(p.changePct) : null,
        status: p.status,
        effectiveFrom: p.effectiveFrom.toISOString(),
        effectiveTo: p.effectiveTo?.toISOString() ?? null,
        submittedAt: p.submittedAt.toISOString(),
        submittedBy: p.submittedBy?.name ?? "—",
        approvedAt: p.approvedAt?.toISOString() ?? null,
        approvedBy: p.approvedBy?.name ?? "—",
        rejectionReason: p.rejectionReason ?? "",
        remark: p.remark ?? "",
      }))}
    />
  );
}
