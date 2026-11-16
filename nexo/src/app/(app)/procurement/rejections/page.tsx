import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { RejectionsGrid } from "./rejections-grid";

export const metadata: Metadata = { title: "Vendor rejection notes" };
export const dynamic = "force-dynamic";

export default async function RejectionsPage() {
  const user = await requirePermission("vrn:read");

  const rows = await prisma.vendorRejectionNote.findMany({
    include: {
      vendor: { select: { id: true, name: true } },
      goodsReceipt: { select: { id: true, code: true } },
      raisedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      lines: {
        select: { quantityKg: true, ratePerKg: true, material: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <RejectionsGrid
      canApprove={can(user.role, "vrn:approve")}
      rows={rows.map((n) => ({
        id: n.id,
        code: n.code,
        status: n.status,
        vendorId: n.vendor.id,
        vendorName: n.vendor.name,
        grnId: n.goodsReceipt.id,
        grnCode: n.goodsReceipt.code,
        raisedOn: n.createdAt.toISOString(),
        raisedBy: n.raisedBy?.name ?? "—",
        approvedBy: n.approvedBy?.name ?? "—",
        dispatchedAt: n.dispatchedAt?.toISOString() ?? null,
        challanNo: n.challanNo ?? "—",
        lineCount: n.lines.length,
        firstMaterial: n.lines[0]?.material.name ?? "—",
        quantityKg: n.lines.reduce((a, l) => a + Number(l.quantityKg), 0),
        value: n.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0),
        resolution: n.expectedResolution ?? "—",
      }))}
    />
  );
}
