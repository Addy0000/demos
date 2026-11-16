import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { RunClient } from "./run-client";

export const metadata: Metadata = { title: "Active Production Run" };
export const dynamic = "force-dynamic";

export default async function ProductionRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("project:read");
  const { id } = await params;

  const dmwo = await prisma.directManufacturingWorkOrder.findUnique({
    where: { id },
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
      resource: { select: { name: true, code: true } },
      warehouse: { select: { name: true, code: true } },
      qcPlaceholder: {
        include: {
          verdictBy: { select: { name: true } },
        },
      },
    },
  });

  if (!dmwo) {
    notFound();
  }

  // Fetch finished goods batch if created
  const batch = await prisma.inventoryBatch.findUnique({
    where: { batchNo: `B-CP-${dmwo.code}` },
    include: {
      warehouse: { select: { name: true, code: true } },
    },
  });

  return (
    <RunClient
      dmwo={{
        id: dmwo.id,
        code: dmwo.code,
        status: dmwo.status,
        targetQtyKg: Number(dmwo.targetQtyKg),
        actualQtyKg: dmwo.actualQtyKg ? Number(dmwo.actualQtyKg) : null,
        resourceName: dmwo.resource?.name ?? "—",
        operatorName: dmwo.operator?.name ?? "—",
        shift: dmwo.shift ?? "—",
        warehouseName: dmwo.warehouse.name,
        warehouseCode: dmwo.warehouse.code,
        materialName: dmwo.orderBom.standardBom?.material.name ?? "—",
        materialCode: dmwo.orderBom.standardBom?.material.code ?? "—",
        processLog: dmwo.processLog ?? "",
        metrics: dmwo.metrics ? (dmwo.metrics as any) : [],
        createdAt: dmwo.createdAt.toISOString(),
        qcPlaceholder: dmwo.qcPlaceholder
          ? {
              id: dmwo.qcPlaceholder.id,
              status: dmwo.qcPlaceholder.status,
              verdictByName: dmwo.qcPlaceholder.verdictBy?.name ?? null,
              verdictAt: dmwo.qcPlaceholder.verdictAt?.toISOString() ?? null,
              notes: dmwo.qcPlaceholder.notes ?? null,
            }
          : null,
        batch: batch
          ? {
              batchNo: batch.batchNo,
              status: batch.status,
              availableQtyKg: Number(batch.availableQtyKg),
              receivedQtyKg: Number(batch.receivedQtyKg),
              warehouseName: batch.warehouse.name,
            }
          : null,
      }}
    />
  );
}

