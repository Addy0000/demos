import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ProductionClient } from "./production-client";
import { WarehouseKind } from "@prisma/client";

export const metadata: Metadata = { title: "Production Console" };
export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  await requirePermission("project:read");

  // 1. Fetch and auto-seed production resources if empty
  let resources = await prisma.productionResource.findMany({
    orderBy: { code: "asc" },
  });

  if (resources.length === 0) {
    await prisma.productionResource.createMany({
      data: [
        { name: "Line 1", code: "LINE-1", type: "LINE", isActive: true },
        { name: "Line 2", code: "LINE-2", type: "LINE", isActive: true },
      ],
    });
    resources = await prisma.productionResource.findMany({
      orderBy: { code: "asc" },
    });
  }

  // 2. Fetch stubs ready to schedule from planning (only unscheduled READY stubs)
  const placeholders = await prisma.productionWorkOrderPlaceholder.findMany({
    where: { status: "READY" },
    include: {
      pwo: {
        include: {
          material: { select: { name: true, code: true } },
          orderBom: { select: { code: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3. Fetch direct manufacturing runs
  const workOrders = await prisma.directManufacturingWorkOrder.findMany({
    include: {
      orderBom: {
        include: {
          standardBom: {
            include: {
              material: { select: { name: true, code: true } },
            },
          },
        },
      },
      operator: { select: { name: true } },
      createdBy: { select: { name: true } },
      warehouse: { select: { name: true, code: true } },
      qcPlaceholder: true,
      resource: { select: { id: true, name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 4. Fetch active operators list
  const operators = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // 5. Fetch finished goods store destinations
  const warehouses = await prisma.warehouse.findMany({
    where: { kind: WarehouseKind.STORE, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  return (
    <ProductionClient
      resources={resources.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        type: r.type,
        isActive: r.isActive,
      }))}
      placeholders={placeholders.map((p) => ({
        id: p.id,
        pwoId: p.pwoId,
        pwoCode: p.pwo.code,
        materialName: p.pwo.material.name,
        materialCode: p.pwo.material.code,
        quantityKg: Number(p.pwo.quantityKg),
        orderBomCode: p.pwo.orderBom?.code ?? "—",
        createdAt: p.createdAt.toISOString(),
      }))}
      workOrders={workOrders.map((w) => ({
        id: w.id,
        code: w.code,
        status: w.status,
        targetQtyKg: Number(w.targetQtyKg),
        actualQtyKg: w.actualQtyKg ? Number(w.actualQtyKg) : null,
        resourceName: w.resource?.name ?? "—",
        operatorName: w.operator?.name ?? "—",
        shift: w.shift ?? "—",
        warehouseName: w.warehouse.name,
        warehouseCode: w.warehouse.code,
        createdByName: w.createdBy.name,
        qcStatus: w.qcPlaceholder?.status ?? "PENDING",
        materialName: w.orderBom.standardBom?.material.name ?? "—",
        materialCode: w.orderBom.standardBom?.material.code ?? "—",
        createdAt: w.createdAt.toISOString(),
      }))}
      operators={operators}
      warehouses={warehouses}
    />
  );
}

