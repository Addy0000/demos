import type { Metadata } from "next";
import { PriceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ApprovalQueue } from "./approval-queue";

export const metadata: Metadata = { title: "Price approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  await requirePermission("price:approve");

  const pending = await prisma.materialPrice.findMany({
    where: { status: PriceStatus.PENDING_APPROVAL },
    include: {
      material: {
        select: {
          id: true, code: true, name: true, category: true, grade: true,
          currentPricePerKg: true, uom: true,
          _count: { select: { formulationLines: true } },
        },
      },
      vendor: { select: { id: true, name: true, rating: true } },
      submittedBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  // Annual exposure per material — how much this revision actually costs the year.
  const consumption = await prisma.$queryRaw<{ materialId: string; annualKg: number }[]>`
    SELECT "materialId", (SUM(ABS("quantityKg")) * 365.0 / 180.0)::float AS "annualKg"
    FROM "StockMovement"
    WHERE "quantityKg" < 0 AND "occurredAt" >= NOW() - INTERVAL '180 days'
    GROUP BY "materialId"
  `;
  const annual = new Map(consumption.map((c) => [c.materialId, c.annualKg]));

  return (
    <ApprovalQueue
      rows={pending.map((p) => {
        const current = p.material.currentPricePerKg ? Number(p.material.currentPricePerKg) : null;
        const proposed = Number(p.pricePerKg);
        const annualKg = annual.get(p.materialId) ?? 0;
        return {
          id: p.id,
          materialId: p.material.id,
          materialCode: p.material.code,
          materialName: p.material.name,
          category: p.material.category,
          grade: p.material.grade ?? "—",
          vendorId: p.vendor.id,
          vendorName: p.vendor.name,
          vendorRating: Number(p.vendor.rating),
          currentPrice: current,
          proposedPrice: proposed,
          changePct: current ? ((proposed - current) / current) * 100 : null,
          annualKg,
          annualImpact: current ? (proposed - current) * annualKg : 0,
          usedInFormulations: p.material._count.formulationLines,
          effectiveFrom: p.effectiveFrom.toISOString(),
          submittedAt: p.submittedAt.toISOString(),
          submittedBy: p.submittedBy?.name ?? "Vendor",
          moqKg: p.moqKg ? Number(p.moqKg) : null,
          leadTimeDays: p.leadTimeDays,
          remark: p.remark ?? "",
        };
      })}
    />
  );
}
