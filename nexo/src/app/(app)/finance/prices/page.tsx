import type { Metadata } from "next";
import { PriceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PricesGrid } from "./prices-grid";

export const metadata: Metadata = { title: "Material prices" };
export const dynamic = "force-dynamic";

export default async function PricesPage() {
  await requirePermission("price:read");

  const materials = await prisma.rawMaterial.findMany({
    where: { isActive: true },
    include: {
      prices: {
        where: { status: { in: [PriceStatus.APPROVED, PriceStatus.PENDING_APPROVAL] } },
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { effectiveFrom: "desc" },
      },
      _count: { select: { formulationLines: true, vendorLinks: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <PricesGrid
      rows={materials.map((m) => {
        const approved = m.prices.filter((p) => p.status === PriceStatus.APPROVED);
        const pending = m.prices.filter((p) => p.status === PriceStatus.PENDING_APPROVAL);
        const best = approved.length
          ? approved.reduce((a, b) => (Number(a.pricePerKg) <= Number(b.pricePerKg) ? a : b))
          : null;

        return {
          id: m.id,
          code: m.code,
          name: m.name,
          category: m.category,
          grade: m.grade ?? "—",
          uom: m.uom,
          currentPrice: m.currentPricePerKg ? Number(m.currentPricePerKg) : null,
          currentFrom: m.currentPriceFrom?.toISOString() ?? null,
          bestPrice: best ? Number(best.pricePerKg) : null,
          bestVendor: best?.vendor.name ?? "—",
          bestVendorId: best?.vendor.id ?? null,
          quotes: approved.length,
          suppliers: m._count.vendorLinks,
          pendingCount: pending.length,
          pendingPrice: pending.length ? Number(pending[0]!.pricePerKg) : null,
          usedIn: m._count.formulationLines,
          leadTimeDays: m.leadTimeDays,
        };
      })}
    />
  );
}
