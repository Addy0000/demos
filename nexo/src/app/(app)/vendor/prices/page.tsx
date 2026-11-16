import type { Metadata } from "next";
import { Role, PriceStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { VendorPriceList } from "./vendor-price-list";

export const metadata: Metadata = { title: "My price list" };
export const dynamic = "force-dynamic";

export default async function VendorPricesPage() {
  const user = await requirePermission("price:read");

  // Internal staff have richer screens for this; the portal is for vendors.
  if (user.role !== Role.VENDOR) redirect("/finance/prices");
  const vendorId = user.vendorId;
  if (!vendorId) redirect("/denied?need=vendor+account");

  const links = await prisma.vendorMaterial.findMany({
    where: { vendorId },
    include: {
      material: { select: { id: true, code: true, name: true, category: true, grade: true, uom: true, leadTimeDays: true } },
    },
    orderBy: { material: { name: "asc" } },
  });

  // Scoped at the data layer: only this vendor's own price rows are ever read.
  const prices = await prisma.materialPrice.findMany({
    where: { vendorId },
    orderBy: { effectiveFrom: "desc" },
  });

  return (
    <VendorPriceList
      rows={links.map((l) => {
        const mine = prices.filter((p) => p.materialId === l.materialId);
        const approved = mine.find((p) => p.status === PriceStatus.APPROVED);
        const pending = mine.find((p) => p.status === PriceStatus.PENDING_APPROVAL);
        const rejected = mine.find((p) => p.status === PriceStatus.REJECTED);
        return {
          materialId: l.materialId,
          code: l.material.code,
          name: l.material.name,
          category: l.material.category,
          grade: l.material.grade ?? "—",
          vendorSku: l.vendorSku ?? "—",
          isPreferred: l.isPreferred,
          leadTimeDays: l.material.leadTimeDays,
          approvedPrice: approved ? Number(approved.pricePerKg) : null,
          approvedFrom: approved?.effectiveFrom.toISOString() ?? null,
          pendingPrice: pending ? Number(pending.pricePerKg) : null,
          pendingFrom: pending?.effectiveFrom.toISOString() ?? null,
          pendingId: pending?.id ?? null,
          lastRejection: rejected?.rejectionReason ?? null,
          history: mine.length,
        };
      })}
    />
  );
}
