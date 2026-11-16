import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { OrderClient } from "./order-client";

export const metadata: Metadata = { title: "Order BOMs" };
export const dynamic = "force-dynamic";

export default async function OrderBomsPage() {
  await requirePermission("project:read");

  const orderBoms = await prisma.orderBom.findMany({
    include: {
      standardBom: {
        select: {
          code: true,
          material: { select: { name: true } },
        },
      },
      lines: {
        include: {
          material: { select: { name: true, code: true, uom: true } },
        },
        orderBy: { lineNo: "asc" },
      },
      amendments: {
        include: {
          requestedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          lines: {
            include: {
              material: { select: { name: true, code: true, uom: true } },
            },
            orderBy: { lineNo: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const approvedStandardBoms = await prisma.standardBom.findMany({
    where: { status: "APPROVED" },
    select: {
      id: true,
      code: true,
      material: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  });

  const rawMaterials = await prisma.rawMaterial.findMany({
    where: { isActive: true, itemType: { in: ["RAW_MATERIAL", "SEMI_FINISHED"] } },
    select: {
      id: true,
      name: true,
      code: true,
      itemType: true,
      category: true,
      grade: true,
      casNumber: true,
      hsnCode: true,
      uom: true,
      batches: {
        where: { status: { in: ["AVAILABLE", "QUARANTINE"] } },
        select: { availableQtyKg: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <OrderClient
      orderBoms={orderBoms.map((bom) => ({
        id: bom.id,
        code: bom.code,
        status: bom.status,
        source: bom.source,
        standardBomCode: bom.standardBom?.code ?? null,
        standardBomMaterialName: bom.standardBom?.material.name ?? null,
        createdAt: bom.createdAt.toISOString(),
        lines: bom.lines.map((l) => ({
          materialId: l.materialId,
          materialName: l.material.name,
          materialCode: l.material.code,
          materialUom: l.material.uom,
          quantityKg: Number(l.quantityKg),
        })),
        amendments: bom.amendments.map((a) => ({
          id: a.id,
          code: a.code,
          status: a.status,
          requestedByName: a.requestedBy.name,
          approvedByName: a.approvedBy?.name ?? null,
          approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
          lines: a.lines.map((l) => ({
            materialId: l.materialId,
            materialName: l.material.name,
            materialCode: l.material.code,
            materialUom: l.material.uom,
            quantityKg: Number(l.quantityKg),
          })),
        })),
      }))}
      approvedStandardBoms={approvedStandardBoms.map((bom) => ({
        id: bom.id,
        code: bom.code,
        materialName: bom.material.name,
      }))}
      rawMaterials={rawMaterials.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        itemType: m.itemType,
        category: m.category,
        grade: m.grade ?? "",
        casNumber: m.casNumber ?? "",
        hsnCode: m.hsnCode ?? "",
        uom: m.uom,
        onHandKg: m.batches.reduce((sum, b) => sum + Number(b.availableQtyKg), 0),
      }))}
    />
  );
}
