import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { BomsClient } from "./boms-client";

export const metadata: Metadata = { title: "Bills of Materials (BOM) Explorer" };
export const dynamic = "force-dynamic";

export default async function BomsPage({
  searchParams,
}: {
  searchParams: Promise<{ filterByItem?: string }>;
}) {
  await requirePermission("project:read");
  const { filterByItem } = await searchParams;

  let filteredItemInfo: {
    code: string;
    name: string;
    category: string;
    itemType: string;
    uom: string;
  } | null = null;

  if (filterByItem) {
    const item = await prisma.rawMaterial.findUnique({
      where: { code: filterByItem },
      select: { code: true, name: true, category: true, itemType: true, uom: true },
    });
    if (item) {
      filteredItemInfo = item;
    }
  }

  const standardBoms = await prisma.standardBom.findMany({
    where: filterByItem
      ? {
          lines: {
            some: {
              material: { code: filterByItem },
            },
          },
        }
      : undefined,
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

  const orderBoms = await prisma.orderBom.findMany({
    where: filterByItem
      ? {
          lines: {
            some: {
              material: { code: filterByItem },
            },
          },
        }
      : undefined,
    include: {
      standardBom: {
        select: {
          code: true,
          material: { select: { name: true, code: true } },
        },
      },
      lines: {
        include: {
          material: { select: { name: true, code: true, uom: true } },
        },
        orderBy: { lineNo: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const formattedStandardBoms = standardBoms.map((bom) => {
    const matchingLine = filterByItem
      ? bom.lines.find((l) => l.material.code === filterByItem)
      : undefined;

    return {
      id: bom.id,
      code: bom.code,
      type: "STANDARD" as const,
      status: bom.status,
      targetProductName: bom.material.name,
      targetProductCode: bom.material.code,
      componentUsageKg: matchingLine ? Number(matchingLine.quantityKg) : undefined,
      componentUom: matchingLine?.material.uom,
      componentLinesCount: bom.lines.length,
      requestedByName: bom.requestedBy.name,
      approvedByName: bom.approvedBy?.name ?? null,
      createdAt: bom.createdAt.toISOString(),
    };
  });

  const formattedOrderBoms = orderBoms.map((bom) => {
    const matchingLine = filterByItem
      ? bom.lines.find((l) => l.material.code === filterByItem)
      : undefined;

    return {
      id: bom.id,
      code: bom.code,
      type: "ORDER" as const,
      status: bom.status,
      targetProductName: bom.standardBom?.material.name ?? "Custom Compound",
      targetProductCode: bom.standardBom?.material.code ?? "—",
      source: bom.source,
      componentUsageKg: matchingLine ? Number(matchingLine.quantityKg) : undefined,
      componentUom: matchingLine?.material.uom,
      componentLinesCount: bom.lines.length,
      createdAt: bom.createdAt.toISOString(),
    };
  });

  const allBoms = [...formattedStandardBoms, ...formattedOrderBoms].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <BomsClient
      boms={allBoms}
      filterByItem={filterByItem}
      filteredItemInfo={filteredItemInfo}
    />
  );
}
