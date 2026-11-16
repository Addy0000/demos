import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ItemsClient } from "./items-client";

export const metadata: Metadata = { title: "Item Master" };
export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  await requirePermission("project:read");

  const materials = await prisma.rawMaterial.findMany({
    include: {
      _count: {
        select: {
          standardBoms: true,
          standardBomLines: true,
          orderBomLines: true,
          formulationLines: true,
          vendorLinks: true,
        },
      },
      batches: {
        where: { status: { in: ["AVAILABLE", "QUARANTINE"] } },
        select: { availableQtyKg: true },
      },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <ItemsClient
      items={materials.map((m) => {
        const onHand = m.batches.reduce((sum, b) => sum + Number(b.availableQtyKg), 0);
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          itemType: m.itemType,
          category: m.category,
          grade: m.grade ?? "",
          casNumber: m.casNumber ?? "",
          hsnCode: m.hsnCode ?? "",
          uom: m.uom,
          specNote: m.specNote ?? "",
          isHazardous: m.isHazardous,
          isActive: m.isActive,
          reorderLevelKg: Number(m.reorderLevelKg),
          reorderQtyKg: Number(m.reorderQtyKg),
          leadTimeDays: m.leadTimeDays,
          currentPricePerKg: m.currentPricePerKg ? Number(m.currentPricePerKg) : null,
          onHandKg: onHand,
          usedInBoms: m._count.standardBoms + m._count.standardBomLines + m._count.orderBomLines,
          suppliersCount: m._count.vendorLinks,
          createdAt: m.createdAt.toISOString(),
        };
      })}
    />
  );
}
