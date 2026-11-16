import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { InventoryGrid } from "./inventory-grid";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  await requirePermission("inventory:read");

  // Material-level position, computed from available batches.
  const positions = await prisma.$queryRaw<
    {
      id: string; code: string; name: string; category: string; grade: string | null;
      onHand: number; batches: number; reorderLevel: number; reorderQty: number;
      leadTimeDays: number; rate: number | null; oldestReceipt: Date | null;
    }[]
  >`
    SELECT m.id, m.code, m.name, m.category::text AS category, m.grade,
           COALESCE(SUM(b."availableQtyKg"), 0)::float          AS "onHand",
           COUNT(b.id)::int                                      AS batches,
           m."reorderLevelKg"::float                             AS "reorderLevel",
           m."reorderQtyKg"::float                               AS "reorderQty",
           m."leadTimeDays"                                      AS "leadTimeDays",
           m."currentPricePerKg"::float                          AS rate,
           MIN(b."receivedOn")                                   AS "oldestReceipt"
    FROM "RawMaterial" m
    LEFT JOIN "InventoryBatch" b
      ON b."materialId" = m.id AND b.status IN ('AVAILABLE', 'QUARANTINE')
    WHERE m."isActive" = true
    GROUP BY m.id, m.code, m.name, m.category, m.grade,
             m."reorderLevelKg", m."reorderQtyKg", m."leadTimeDays", m."currentPricePerKg"
    ORDER BY m.name ASC
  `;

  // 180-day consumption gives a meaningful days-of-cover figure.
  const burn = await prisma.$queryRaw<{ materialId: string; perDay: number }[]>`
    SELECT "materialId", (SUM(ABS("quantityKg")) / 180.0)::float AS "perDay"
    FROM "StockMovement"
    WHERE "quantityKg" < 0 AND "occurredAt" >= NOW() - INTERVAL '180 days'
    GROUP BY "materialId"
  `;
  const perDay = new Map(burn.map((b) => [b.materialId, b.perDay]));

  return (
    <InventoryGrid
      rows={positions.map((p) => {
        const daily = perDay.get(p.id) ?? 0;
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          grade: p.grade ?? "—",
          onHand: p.onHand,
          batches: p.batches,
          reorderLevel: p.reorderLevel,
          reorderQty: p.reorderQty,
          leadTimeDays: p.leadTimeDays,
          rate: p.rate,
          stockValue: p.rate ? p.onHand * p.rate : 0,
          daysCover: daily > 0 ? p.onHand / daily : null,
          belowReorder: p.onHand < p.reorderLevel,
          oldestReceipt: p.oldestReceipt ? p.oldestReceipt.toISOString() : null,
        };
      })}
    />
  );
}
