import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewRequisitionForm } from "./new-requisition-form";

export const metadata: Metadata = { title: "New purchase requisition" };
export const dynamic = "force-dynamic";

export default async function NewRequisitionPage() {
  await requirePermission("req:write");

  const [rawMaterials, projects] = await Promise.all([
    prisma.rawMaterial.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        grade: true,
        uom: true,
        currentPricePerKg: true,
        reorderQtyKg: true,
        batches: {
          where: { status: { in: ["AVAILABLE", "QUARANTINE"] } },
          select: { availableQtyKg: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const materials = rawMaterials.map((m) => {
    const onHand = m.batches.reduce((sum, b) => sum + Number(b.availableQtyKg), 0);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      grade: m.grade ?? "",
      uom: m.uom,
      rate: m.currentPricePerKg ? Number(m.currentPricePerKg) : 0,
      onHand,
      suggestedQty: Number(m.reorderQtyKg) || 1000,
    };
  });

  return <NewRequisitionForm materials={materials} projects={projects} />;
}
