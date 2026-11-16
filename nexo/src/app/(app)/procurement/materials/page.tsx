import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { MaterialsGrid } from "./materials-grid";

export const metadata: Metadata = { title: "Raw materials" };
export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const user = await requirePermission("material:read");

  const materials = await prisma.rawMaterial.findMany({
    include: {
      _count: { select: { formulationLines: true, vendorLinks: true, documents: true } },
      batches: { where: { status: { in: ["AVAILABLE", "QUARANTINE"] } }, select: { availableQtyKg: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <MaterialsGrid
      seesPrices={can(user.role, "price:read")}
      rows={materials.map((m) => {
        const onHand = m.batches.reduce((a, b) => a + Number(b.availableQtyKg), 0);
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          category: m.category,
          grade: m.grade ?? "—",
          casNumber: m.casNumber ?? "—",
          hsnCode: m.hsnCode ?? "—",
          kValue: m.kValue,
          uom: m.uom,
          specNote: m.specNote ?? "",
          isHazardous: m.isHazardous,
          isActive: m.isActive,
          price: m.currentPricePerKg ? Number(m.currentPricePerKg) : null,
          onHand,
          reorderLevel: Number(m.reorderLevelKg),
          belowReorder: onHand < Number(m.reorderLevelKg),
          leadTimeDays: m.leadTimeDays,
          suppliers: m._count.vendorLinks,
          usedIn: m._count.formulationLines,
          documents: m._count.documents,
        };
      })}
    />
  );
}
