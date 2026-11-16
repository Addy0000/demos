import type { Metadata } from "next";
import { PriceStatus, PoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { VendorsGrid } from "./vendors-grid";

export const metadata: Metadata = { title: "Vendors" };
export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  await requirePermission("vendor:read");

  const vendors = await prisma.vendor.findMany({
    include: {
      _count: { select: { materials: true, purchaseOrders: true, goodsReceipts: true, users: true } },
      purchaseOrders: { select: { totalValue: true, status: true, orderedOn: true } },
      vendorBills: { where: { status: { notIn: ["VOID"] } }, select: { totalValue: true, paidAmount: true, debitedAmount: true } },
      prices: { where: { status: PriceStatus.PENDING_APPROVAL }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <VendorsGrid
      rows={vendors.map((v) => {
        const live = v.purchaseOrders.filter((p) => p.status !== PoStatus.CANCELLED);
        const spend = live.reduce((a, p) => a + Number(p.totalValue), 0);
        const outstanding = v.vendorBills.reduce(
          (a, b) => a + Math.max(0, Number(b.totalValue) - Number(b.paidAmount) - Number(b.debitedAmount ?? 0)),
          0
        );
        const last = live.length
          ? live.reduce((a, b) => (a.orderedOn > b.orderedOn ? a : b)).orderedOn.toISOString()
          : null;
        return {
          id: v.id,
          code: v.code,
          name: v.name,
          status: v.status,
          city: v.city ?? "—",
          state: v.state ?? "—",
          contactName: v.contactName ?? "—",
          contactPhone: v.contactPhone ?? "—",
          contactEmail: v.contactEmail ?? "—",
          gstin: v.gstin ?? "—",
          rating: Number(v.rating),
          creditDays: v.creditDays,
          paymentTerms: v.paymentTerms ?? "—",
          materials: v._count.materials,
          orders: v._count.purchaseOrders,
          receipts: v._count.goodsReceipts,
          portalUsers: v._count.users,
          pendingPrices: v.prices.length,
          totalSpend: spend,
          outstanding,
          lastOrder: last,
        };
      })}
    />
  );
}
