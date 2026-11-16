import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PlanningClient } from "./planning-client";

export const metadata: Metadata = { title: "Planning Work Orders" };
export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  await requirePermission("project:read");

  const workOrders = await prisma.planningWorkOrder.findMany({
    include: {
      material: { select: { name: true, code: true } },
      orderBom: { select: { code: true } },
      requestedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      milestones: { orderBy: { createdAt: "asc" } },
      allocations: {
        include: {
          material: { select: { name: true, code: true } },
          batch: { select: { batchNo: true } },
        },
      },
      shortages: {
        include: {
          material: { select: { name: true, code: true } },
        },
      },
      productionWorkOrders: true,
      purchaseRequisitions: {
        include: {
          material: { select: { name: true, code: true } },
        },
      },
      storeIssueSlips: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const compoundMaterials = await prisma.rawMaterial.findMany({
    where: { isActive: true, itemType: { in: ["FINISHED_GOOD", "SEMI_FINISHED"] } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const standaloneRequisitions = await prisma.purchaseRequisitionPlaceholder.findMany({
    where: { pwoId: null },
    include: {
      material: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PlanningClient
      workOrders={workOrders.map((w) => ({
        id: w.id,
        code: w.code,
        status: w.status,
        source: w.source,
        referenceNo: w.referenceNo ?? "—",
        materialId: w.materialId,
        materialName: w.material.name,
        materialCode: w.material.code,
        quantityKg: Number(w.quantityKg),
        orderBomCode: w.orderBom?.code ?? null,
        requestedByName: w.requestedBy.name,
        approvedByName: w.approvedBy?.name ?? null,
        approvedAt: w.approvedAt ? w.approvedAt.toISOString() : null,
        createdAt: w.createdAt.toISOString(),
        milestones: w.milestones.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
          dueDate: m.dueDate ? m.dueDate.toISOString().split("T")[0] : null,
          completedAt: m.completedAt ? m.completedAt.toISOString() : null,
        })),
        allocations: w.allocations.map((a) => ({
          batchNo: a.batch.batchNo,
          materialName: a.material.name,
          materialCode: a.material.code,
          quantityKg: Number(a.quantityKg),
        })),
        shortages: w.shortages.map((s) => ({
          materialName: s.material.name,
          materialCode: s.material.code,
          requiredQtyKg: Number(s.requiredQtyKg),
          allocatedQtyKg: Number(s.allocatedQtyKg),
          shortageQtyKg: Number(s.shortageQtyKg),
        })),
        isReadyForProduction: w.productionWorkOrders.length > 0,
        purchaseRequisitionCount: w.purchaseRequisitions.length,
        hasStoreIssueSlip: w.storeIssueSlips.length > 0,
      }))}
      compoundMaterials={compoundMaterials}
      standaloneRequisitions={standaloneRequisitions.map((r) => ({
        id: r.id,
        materialName: r.material.name,
        materialCode: r.material.code,
        quantityKg: Number(r.quantityKg),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
