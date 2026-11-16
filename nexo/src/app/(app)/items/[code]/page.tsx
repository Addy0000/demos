import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ItemDetailClient } from "./item-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const decodedCode = decodeURIComponent(code);
  const m = await prisma.rawMaterial.findUnique({
    where: { code: decodedCode },
    select: { name: true, code: true },
  });
  return { title: m ? `${m.code} - ${m.name}` : "Item Detail" };
}

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requirePermission("project:read");
  const { code } = await params;
  const decodedCode = decodeURIComponent(code);

  const material = await prisma.rawMaterial.findUnique({
    where: { code: decodedCode },
    include: {
      batches: {
        include: { warehouse: { select: { name: true } } },
        orderBy: { receivedOn: "desc" },
      },
      standardBoms: {
        include: {
          requestedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          lines: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      standardBomLines: {
        include: {
          bom: {
            include: {
              material: { select: { name: true, code: true } },
              requestedBy: { select: { name: true } },
              approvedBy: { select: { name: true } },
            },
          },
        },
      },
      orderBomLines: {
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
        },
      },
    },
  });

  if (!material) {
    notFound();
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      entityType: "RawMaterial",
      entityId: material.id,
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const onHand = material.batches
    .filter((b) => b.status === "AVAILABLE" || b.status === "QUARANTINE")
    .reduce((sum, b) => sum + Number(b.availableQtyKg), 0);

  return (
    <ItemDetailClient
      item={{
        id: material.id,
        code: material.code,
        name: material.name,
        itemType: material.itemType,
        category: material.category,
        grade: material.grade ?? "",
        casNumber: material.casNumber ?? "",
        hsnCode: material.hsnCode ?? "",
        uom: material.uom,
        specNote: material.specNote ?? "",
        kValue: material.kValue,
        isHazardous: material.isHazardous,
        isActive: material.isActive,
        reorderLevelKg: Number(material.reorderLevelKg),
        reorderQtyKg: Number(material.reorderQtyKg),
        leadTimeDays: material.leadTimeDays,
        currentPricePerKg: material.currentPricePerKg ? Number(material.currentPricePerKg) : null,
        onHandKg: onHand,
        createdAt: material.createdAt.toISOString(),
        updatedAt: material.updatedAt.toISOString(),
      }}
      batches={material.batches.map((b) => ({
        id: b.id,
        batchNo: b.batchNo,
        status: b.status,
        receivedQtyKg: Number(b.receivedQtyKg),
        availableQtyKg: Number(b.availableQtyKg),
        ratePerKg: b.ratePerKg ? Number(b.ratePerKg) : null,
        warehouseName: b.warehouse.name,
        binLocation: b.binLocation ?? null,
        receivedOn: b.receivedOn.toISOString(),
        expiresOn: b.expiresOn ? b.expiresOn.toISOString() : null,
      }))}
      standardBomUsages={material.standardBomLines.map((l) => ({
        id: l.id,
        bomCode: l.bom.code,
        status: l.bom.status,
        targetMaterialName: l.bom.material.name,
        targetMaterialCode: l.bom.material.code,
        quantityKg: Number(l.quantityKg),
        requestedByName: l.bom.requestedBy.name,
        approvedByName: l.bom.approvedBy?.name ?? null,
        createdAt: l.bom.createdAt.toISOString(),
      }))}
      orderBomUsages={material.orderBomLines.map((l) => ({
        id: l.id,
        bomCode: l.orderBom.code,
        status: l.orderBom.status,
        source: l.orderBom.source,
        targetMaterialName: l.orderBom.standardBom?.material.name ?? "Custom Compound",
        targetMaterialCode: l.orderBom.standardBom?.material.code ?? "—",
        quantityKg: Number(l.quantityKg),
        createdAt: l.orderBom.createdAt.toISOString(),
      }))}
      productStandardBoms={material.standardBoms.map((bom) => ({
        id: bom.id,
        bomCode: bom.code,
        status: bom.status,
        linesCount: bom.lines.length,
        requestedByName: bom.requestedBy.name,
        approvedByName: bom.approvedBy?.name ?? null,
        createdAt: bom.createdAt.toISOString(),
      }))}
      auditEvents={auditEvents.map((evt) => ({
        id: evt.id,
        action: evt.action,
        summary: evt.summary,
        actorName: evt.actor?.name ?? "System",
        createdAt: evt.createdAt.toISOString(),
        metadata: evt.metadata,
      }))}
    />
  );
}
