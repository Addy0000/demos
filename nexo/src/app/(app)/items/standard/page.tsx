import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { StandardClient } from "./standard-client";

export const metadata: Metadata = { title: "Standard BOMs" };
export const dynamic = "force-dynamic";

export default async function StandardBomsPage() {
  await requirePermission("project:read");

  const standardBoms = await prisma.standardBom.findMany({
    include: {
      material: { select: { name: true, code: true } },
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
  });

  const targetProducts = await prisma.rawMaterial.findMany({
    where: { isActive: true, itemType: { in: ["FINISHED_GOOD", "SEMI_FINISHED"] } },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const componentMaterials = await prisma.rawMaterial.findMany({
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
    <StandardClient
      standardBoms={standardBoms.map((bom) => ({
        id: bom.id,
        code: bom.code,
        status: bom.status,
        materialId: bom.materialId,
        materialName: bom.material.name,
        materialCode: bom.material.code,
        requestedByName: bom.requestedBy.name,
        approvedByName: bom.approvedBy?.name ?? null,
        approvedAt: bom.approvedAt ? bom.approvedAt.toISOString() : null,
        createdAt: bom.createdAt.toISOString(),
        lines: bom.lines.map((l) => ({
          materialId: l.materialId,
          materialName: l.material.name,
          materialCode: l.material.code,
          materialUom: l.material.uom,
          quantityKg: Number(l.quantityKg),
        })),
      }))}
      targetProducts={targetProducts}
      componentMaterials={componentMaterials.map((m) => ({
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
