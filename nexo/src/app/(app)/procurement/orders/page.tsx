import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { OrdersGrid } from "./orders-grid";

export const metadata: Metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requirePermission("po:read");

  const rows = await prisma.purchaseOrder.findMany({
    include: {
      vendor: { select: { id: true, name: true } },
      raisedBy: { select: { name: true } },
      lines: { select: { quantityKg: true, receivedKg: true, material: { select: { name: true } } } },
      _count: { select: { goodsReceipts: true } },
    },
    orderBy: { orderedOn: "desc" },
  });

  return (
    <OrdersGrid
      canWrite={can(user.role, "po:write")}
      canApprove={can(user.role, "po:approve")}
      rows={rows.map((o) => {
        const ordered = o.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
        const received = o.lines.reduce((a, l) => a + Number(l.receivedKg), 0);
        return {
          id: o.id,
          code: o.code,
          status: o.status,
          vendorId: o.vendor.id,
          vendorName: o.vendor.name,
          orderedOn: o.orderedOn.toISOString(),
          expectedOn: o.expectedOn?.toISOString() ?? null,
          lineCount: o.lines.length,
          firstMaterial: o.lines[0]?.material.name ?? "—",
          orderedKg: ordered,
          receivedKg: received,
          progress: ordered > 0 ? (received / ordered) * 100 : 0,
          subtotal: Number(o.subtotal),
          totalValue: Number(o.totalValue),
          grnCount: o._count.goodsReceipts,
          raisedBy: o.raisedBy?.name ?? "—",
        };
      })}
    />
  );
}
