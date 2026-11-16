"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { BomStatus, OrderBomSource, AmendmentStatus, MaterialCategory, Uom, ItemType } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Standard BOM Actions
 */

export async function createStandardBom(data: {
  code: string;
  materialId: string;
  lines: { materialId: string; quantityKg: number }[];
}) {
  const session = await assertPermission("project:write");

  // Validate Target Product
  const targetMaterial = await prisma.rawMaterial.findUnique({
    where: { id: data.materialId },
    select: { id: true, name: true, code: true, itemType: true },
  });

  if (!targetMaterial) {
    throw new Error("Target product does not exist.");
  }

  if (targetMaterial.itemType === ItemType.RAW_MATERIAL) {
    throw new Error(
      `Cannot create BOM for "${targetMaterial.name}" (${targetMaterial.code}): Item is classified as a Raw Material. A BOM target product must be a Finished Good or Semi-Finished product.`
    );
  }

  if (data.lines.length === 0) {
    throw new Error("At least one component line is required.");
  }

  // Validate Component Lines
  for (const line of data.lines) {
    if (line.materialId === data.materialId) {
      throw new Error(
        `A BOM cannot consume its own target product ("${targetMaterial.name}") as an ingredient.`
      );
    }
    const comp = await prisma.rawMaterial.findUnique({
      where: { id: line.materialId },
      select: { id: true, name: true, code: true, itemType: true },
    });
    if (!comp) {
      throw new Error(`Component item does not exist.`);
    }
    if (comp.itemType === ItemType.FINISHED_GOOD) {
      throw new Error(
        `Cannot add component "${comp.name}" (${comp.code}): Finished Goods cannot be consumed as raw material components. Please select a Raw Material or Semi-Finished item.`
      );
    }
  }

  // Create Standard BOM and lines inside a transaction
  const bom = await prisma.$transaction(async (tx) => {
    return tx.standardBom.create({
      data: {
        code: data.code,
        materialId: data.materialId,
        status: BomStatus.DRAFT,
        requestedById: session.id,
        lines: {
          create: data.lines.map((line, idx) => ({
            lineNo: idx + 1,
            materialId: line.materialId,
            quantityKg: line.quantityKg,
          })),
        },
      },
    });
  });

  revalidatePath("/items/standard");
  return { id: bom.id };
}

export async function submitStandardBomForApproval(id: string) {
  await assertPermission("project:write");

  const bom = await prisma.standardBom.update({
    where: { id },
    data: { status: BomStatus.PENDING_APPROVAL },
  });

  revalidatePath("/items/standard");
  return { id: bom.id };
}

export async function approveStandardBom(id: string) {
  const session = await assertPermission("project:write");

  const bom = await prisma.standardBom.update({
    where: { id },
    data: {
      status: BomStatus.APPROVED,
      approvedById: session.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath("/items/standard");
  return { id: bom.id };
}

export async function rejectStandardBom(id: string) {
  const session = await assertPermission("project:write");

  const bom = await prisma.standardBom.update({
    where: { id },
    data: {
      status: BomStatus.REJECTED,
      approvedById: session.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath("/items/standard");
  return { id: bom.id };
}

/**
 * Order BOM Actions
 */

export async function createOrderBom(data: {
  code: string;
  standardBomId: string;
  source: OrderBomSource;
}) {
  await assertPermission("project:write");

  // Fetch standard BOM and its lines to duplicate them
  const standardBom = await prisma.standardBom.findUnique({
    where: { id: data.standardBomId },
    include: { lines: true },
  });

  if (!standardBom || standardBom.status !== BomStatus.APPROVED) {
    throw new Error("Cannot create Order BOM: Standard BOM not found or not approved.");
  }

  const orderBom = await prisma.$transaction(async (tx) => {
    return tx.orderBom.create({
      data: {
        code: data.code,
        standardBomId: standardBom.id,
        source: data.source,
        status: BomStatus.APPROVED, // Default to APPROVED/active
        lines: {
          create: standardBom.lines.map((l) => ({
            lineNo: l.lineNo,
            materialId: l.materialId,
            quantityKg: l.quantityKg,
          })),
        },
      },
    });
  });

  revalidatePath("/items/order");
  return { id: orderBom.id };
}

/**
 * BOM Amendment Actions
 */

export async function submitBomAmendment(data: {
  code: string;
  orderBomId: string;
  lines: { materialId: string; quantityKg: number }[];
}) {
  const session = await assertPermission("project:write");

  const amendment = await prisma.$transaction(async (tx) => {
    return tx.bomAmendment.create({
      data: {
        code: data.code,
        orderBomId: data.orderBomId,
        status: AmendmentStatus.PENDING_APPROVAL,
        requestedById: session.id,
        lines: {
          create: data.lines.map((l, idx) => ({
            lineNo: idx + 1,
            materialId: l.materialId,
            quantityKg: l.quantityKg,
          })),
        },
      },
    });
  });

  revalidatePath("/items/order");
  return { id: amendment.id };
}

export async function approveBomAmendment(id: string) {
  const session = await assertPermission("project:write");

  // Run the lines replacement inside an atomic transaction (Enforces transaction safety)
  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch amendment and lines
    const amd = await tx.bomAmendment.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!amd || amd.status !== AmendmentStatus.PENDING_APPROVAL) {
      throw new Error("Amendment not found or already processed.");
    }

    // 2. Update amendment status
    const updatedAmd = await tx.bomAmendment.update({
      where: { id },
      data: {
        status: AmendmentStatus.APPROVED,
        approvedById: session.id,
        approvedAt: new Date(),
      },
    });

    // 3. Clear existing active lines of target Order BOM
    await tx.orderBomLine.deleteMany({
      where: { orderBomId: amd.orderBomId },
    });

    // 4. Overwrite with amendment lines
    await tx.orderBomLine.createMany({
      data: amd.lines.map((l) => ({
        orderBomId: amd.orderBomId,
        lineNo: l.lineNo,
        materialId: l.materialId,
        quantityKg: l.quantityKg,
      })),
    });

    return updatedAmd;
  });

  revalidatePath("/items/order");
  return { id: result.id };
}

export async function rejectBomAmendment(id: string) {
  const session = await assertPermission("project:write");

  const result = await prisma.bomAmendment.update({
    where: { id },
    data: {
      status: AmendmentStatus.REJECTED,
      approvedById: session.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath("/items/order");
  return { id: result.id };
}

/**
 * Item / Material Master Data Actions
 */

export async function createItem(data: {
  code?: string;
  name: string;
  itemType?: ItemType;
  category: MaterialCategory;
  uom?: Uom;
  grade?: string;
  casNumber?: string;
  hsnCode?: string;
  specNote?: string;
  isHazardous?: boolean;
  reorderLevelKg?: number;
  reorderQtyKg?: number;
  leadTimeDays?: number;
}) {
  const session = await assertPermission("project:write");

  if (!data.name.trim()) {
    throw new Error("Item name is required.");
  }

  const itemType = data.itemType ?? ItemType.RAW_MATERIAL;

  // Generate code if not provided
  let code = data.code?.trim().toUpperCase();
  if (!code) {
    const prefix = itemType === ItemType.FINISHED_GOOD ? "FG" : itemType === ItemType.SEMI_FINISHED ? "SF" : "RM";
    const subPrefix = data.category.substring(0, 3).toUpperCase();
    const count = await prisma.rawMaterial.count({
      where: { itemType },
    });
    code = `${prefix}-${subPrefix}-${String(count + 1).padStart(3, "0")}`;
  }

  // Check code uniqueness
  const existing = await prisma.rawMaterial.findUnique({
    where: { code },
  });
  if (existing) {
    throw new Error(`Item with code "${code}" already exists.`);
  }

  const material = await prisma.rawMaterial.create({
    data: {
      code,
      name: data.name.trim(),
      itemType,
      category: data.category,
      uom: data.uom ?? Uom.KG,
      grade: data.grade?.trim() || null,
      casNumber: data.casNumber?.trim() || null,
      hsnCode: data.hsnCode?.trim() || null,
      specNote: data.specNote?.trim() || null,
      isHazardous: data.isHazardous ?? false,
      reorderLevelKg: data.reorderLevelKg ?? 0,
      reorderQtyKg: data.reorderQtyKg ?? 0,
      leadTimeDays: data.leadTimeDays ?? 7,
      isActive: true,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: "RawMaterial",
      entityId: material.id,
      action: "ITEM_CREATED",
      summary: `Created ${itemType.replace(/_/g, " ")}: ${material.code} - ${material.name}`,
      actorId: session.id,
      metadata: {
        code: material.code,
        name: material.name,
        itemType: material.itemType,
        category: material.category,
        uom: material.uom,
      },
    },
  });

  revalidatePath("/items");
  revalidatePath(`/items/${material.code}`);
  revalidatePath("/items/standard");
  revalidatePath("/items/order");
  revalidatePath("/procurement/materials");
  return { id: material.id, code: material.code, name: material.name, category: material.category, uom: material.uom };
}

export async function updateItem(
  id: string,
  data: {
    name: string;
    itemType?: ItemType;
    category: MaterialCategory;
    uom?: Uom;
    grade?: string;
    casNumber?: string;
    hsnCode?: string;
    specNote?: string;
    isHazardous?: boolean;
    reorderLevelKg?: number;
    reorderQtyKg?: number;
    leadTimeDays?: number;
  }
) {
  const session = await assertPermission("project:write");

  if (!data.name.trim()) {
    throw new Error("Item name is required.");
  }

  const material = await prisma.rawMaterial.update({
    where: { id },
    data: {
      name: data.name.trim(),
      itemType: data.itemType,
      category: data.category,
      uom: data.uom ?? Uom.KG,
      grade: data.grade?.trim() || null,
      casNumber: data.casNumber?.trim() || null,
      hsnCode: data.hsnCode?.trim() || null,
      specNote: data.specNote?.trim() || null,
      isHazardous: data.isHazardous ?? false,
      reorderLevelKg: data.reorderLevelKg ?? 0,
      reorderQtyKg: data.reorderQtyKg ?? 0,
      leadTimeDays: data.leadTimeDays ?? 7,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: "RawMaterial",
      entityId: material.id,
      action: "ITEM_UPDATED",
      summary: `Updated item specifications for ${material.code} (${material.name})`,
      actorId: session.id,
      metadata: {
        name: material.name,
        itemType: material.itemType,
        category: material.category,
        grade: material.grade,
        reorderLevelKg: Number(material.reorderLevelKg),
        leadTimeDays: material.leadTimeDays,
      },
    },
  });

  revalidatePath("/items");
  revalidatePath(`/items/${material.code}`);
  revalidatePath("/items/standard");
  revalidatePath("/items/order");
  revalidatePath("/procurement/materials");
  return { id: material.id, code: material.code };
}

export async function toggleItemActive(id: string, isActive: boolean) {
  const session = await assertPermission("project:write");

  const material = await prisma.rawMaterial.update({
    where: { id },
    data: { isActive },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: "RawMaterial",
      entityId: material.id,
      action: "STATUS_TOGGLED",
      summary: `Set status of ${material.code} to ${isActive ? "ACTIVE" : "INACTIVE"}`,
      actorId: session.id,
      metadata: { isActive },
    },
  });

  revalidatePath("/items");
  revalidatePath(`/items/${material.code}`);
  revalidatePath("/items/standard");
  revalidatePath("/items/order");
  revalidatePath("/procurement/materials");
  return { id: material.id, isActive: material.isActive };
}
