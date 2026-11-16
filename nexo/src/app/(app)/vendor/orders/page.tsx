import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { VendorOrders } from "./vendor-orders";

export const metadata: Metadata = { title: "Purchase orders" };
export const dynamic = "force-dynamic";

export default async function VendorOrdersPage() {
  const user = await requirePermission("po:read");
  if (user.role !== Role.VENDOR) redirect("/procurement/orders");
  const vendorId = user.vendorId;
  if (!vendorId) redirect("/denied?need=vendor+account");

  // Scoped: a vendor sees only orders placed on itself.
  const orders = await prisma.purchaseOrder.findMany({
    where: { vendorId, status: { notIn: ["DRAFT"] } },
    include: {
      lines: { include: { material: { select: { name: true, code: true } } }, orderBy: { lineNo: "asc" } },
      goodsReceipts: { select: { id: true, code: true, receivedOn: true, status: true } },
    },
    orderBy: { orderedOn: "desc" },
  });

  return (
    <VendorOrders
      rows={orders.map((o) => ({
        id: o.id,
        code: o.code,
        status: o.status,
        orderedOn: o.orderedOn.toISOString(),
        expectedOn: o.expectedOn?.toISOString() ?? null,
        totalValue: Number(o.totalValue),
        deliveryTerms: o.deliveryTerms ?? "—",
        paymentTerms: o.paymentTerms ?? "—",
        lines: o.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          material: l.material.name,
          code: l.material.code,
          quantityKg: Number(l.quantityKg),
          receivedKg: Number(l.receivedKg),
          ratePerKg: Number(l.ratePerKg),
          lineTotal: Number(l.lineTotal),
        })),
        receipts: o.goodsReceipts.map((g) => ({
          id: g.id, code: g.code, receivedOn: g.receivedOn.toISOString(), status: g.status,
        })),
      }))}
    />
  );
}
