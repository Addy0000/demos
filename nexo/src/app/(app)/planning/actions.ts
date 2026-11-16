"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { PlanningStatus, PlanningSource, MilestoneStatus, BomStatus, OrderBomSource } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * 1. Create Planning Work Order
 */
export async function createPlanningWorkOrder(data: {
  code: string;
  source: PlanningSource;
  referenceNo?: string;
  materialId: string;
  quantityKg: number;
}) {
  const session = await assertPermission("project:write");

  const pwo = await prisma.planningWorkOrder.create({
    data: {
      code: data.code,
      source: data.source,
      referenceNo: data.referenceNo ?? null,
      materialId: data.materialId,
      quantityKg: data.quantityKg,
      status: PlanningStatus.DRAFT,
      requestedById: session.id,
    },
  });

  revalidatePath("/planning");
  return { id: pwo.id };
}

/**
 * 2. Submit for Approval
 */
export async function submitPlanningWorkOrderForApproval(id: string) {
  await assertPermission("project:write");

  const pwo = await prisma.planningWorkOrder.update({
    where: { id },
    data: { status: PlanningStatus.PENDING_APPROVAL },
  });

  revalidatePath("/planning");
  return { id: pwo.id };
}

/**
 * 3. Approve Planning Work Order
 */
export async function approvePlanningWorkOrder(id: string) {
  const session = await assertPermission("project:write");

  const pwo = await prisma.planningWorkOrder.update({
    where: { id },
    data: {
      status: PlanningStatus.APPROVED,
      approvedById: session.id,
      approvedAt: new Date(),
    },
  });

  revalidatePath("/planning");
  return { id: pwo.id };
}

/**
 * 4. Add Milestone
 */
export async function addPlanningMilestone(data: {
  pwoId: string;
  name: string;
  dueDate?: Date;
}) {
  await assertPermission("project:write");

  const milestone = await prisma.planningMilestone.create({
    data: {
      pwoId: data.pwoId,
      name: data.name,
      status: MilestoneStatus.PENDING,
      dueDate: data.dueDate ?? null,
    },
  });

  revalidatePath("/planning");
  return { id: milestone.id };
}

/**
 * 5. Complete Milestone
 */
export async function completePlanningMilestone(id: string) {
  await assertPermission("project:write");

  const milestone = await prisma.planningMilestone.update({
    where: { id },
    data: {
      status: MilestoneStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  revalidatePath("/planning");
  return { id: milestone.id };
}

/**
 * 6. Auto Allocation (PLN Core Logic)
 */
export async function runStockAllocation(pwoId: string) {
  const session = await assertPermission("project:write");

  const result = await prisma.$transaction(async (tx) => {
    // 1. Retrieve the target PWO
    const pwo = await tx.planningWorkOrder.findUnique({
      where: { id: pwoId },
      include: {
        orderBom: { include: { lines: true } },
      },
    });

    if (!pwo) throw new Error("Planning Work Order not found.");
    if (pwo.status !== PlanningStatus.APPROVED) {
      throw new Error("Only APPROVED Planning Work Orders can run allocations.");
    }

    let activeOrderBomId = pwo.orderBomId;
    let orderBomLines: { materialId: string; quantityKg: any }[] = [];

    // 2. Availability Check: If no Order BOM linked, check templates (YES/NO Branch from Page 5)
    if (!activeOrderBomId) {
      // Find an approved Order BOM for this material
      const approvedOrderBom = await tx.orderBom.findFirst({
        where: {
          status: BomStatus.APPROVED,
          standardBom: { materialId: pwo.materialId },
        },
        include: { lines: true },
      });

      if (approvedOrderBom) {
        // YES Branch: Use existing approved Order BOM
        activeOrderBomId = approvedOrderBom.id;
        orderBomLines = approvedOrderBom.lines;
        
        await tx.planningWorkOrder.update({
          where: { id: pwoId },
          data: { orderBomId: activeOrderBomId },
        });
      } else {
        // NO Branch: Check Standard BOM
        const stdBom = await tx.standardBom.findFirst({
          where: {
            materialId: pwo.materialId,
            status: BomStatus.APPROVED,
          },
          include: { lines: true },
        });

        if (!stdBom) {
          throw new Error(
            `BOM Availability Check Failed: No approved Standard BOM or Order BOM exists for compound material ID '${pwo.materialId}'.`
          );
        }

        // Instantiate Order BOM from Standard BOM
        const newOrderBom = await tx.orderBom.create({
          data: {
            code: `BOM-ORD-${pwo.code}`,
            standardBomId: stdBom.id,
            source: pwo.source === PlanningSource.MAKE_TO_ORDER ? OrderBomSource.MAKE_TO_ORDER : OrderBomSource.MAKE_TO_STOCK,
            status: BomStatus.APPROVED,
            lines: {
              create: stdBom.lines.map((l) => ({
                lineNo: l.lineNo,
                materialId: l.materialId,
                quantityKg: l.quantityKg,
              })),
            },
          },
          include: { lines: true },
        });

        activeOrderBomId = newOrderBom.id;
        orderBomLines = newOrderBom.lines;

        await tx.planningWorkOrder.update({
          where: { id: pwoId },
          data: { orderBomId: activeOrderBomId },
        });
      }
    } else {
      if (!pwo.orderBom) {
        throw new Error("No Order BOM linked to this Planning Work Order.");
      }
      orderBomLines = pwo.orderBom.lines;
    }

    // 3. Clear any existing allocations/shortages for this PWO
    await tx.planningAllocation.deleteMany({ where: { pwoId } });
    await tx.planningShortage.deleteMany({ where: { pwoId } });
    await tx.purchaseRequisitionPlaceholder.deleteMany({ where: { pwoId } });
    await tx.productionWorkOrderPlaceholder.deleteMany({ where: { pwoId } });
    await tx.storeIssueSlipPlaceholder.deleteMany({ where: { pwoId } });

    // 4. Calculate total required amounts of components
    const bomTotalKg = orderBomLines.reduce(
      (sum, line) => sum + Number(line.quantityKg),
      0
    );

    if (bomTotalKg <= 0) {
      throw new Error("The associated BOM is empty or has zero total weight.");
    }

    const scalingRatio = Number(pwo.quantityKg) / bomTotalKg;
    let hasShortage = false;

    // 5. Allocate components line by line using FIFO available batches
    for (const line of orderBomLines) {
      const requiredQty = Number(line.quantityKg) * scalingRatio;
      let remainingToAllocate = requiredQty;

      // Find available batches for this raw material (FIFO: receivedOn asc)
      const batches = await tx.inventoryBatch.findMany({
        where: {
          materialId: line.materialId,
          status: "AVAILABLE",
          availableQtyKg: { gt: 0 },
        },
        orderBy: { receivedOn: "asc" },
      });

      for (const batch of batches) {
        if (remainingToAllocate <= 0) break;

        const available = Number(batch.availableQtyKg);
        const allocateAmt = Math.min(available, remainingToAllocate);

        // Record the allocation
        await tx.planningAllocation.create({
          data: {
            pwoId,
            materialId: line.materialId,
            batchId: batch.id,
            quantityKg: allocateAmt,
          },
        });

        // Deduct from batch stock
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQtyKg: { decrement: allocateAmt },
          },
        });

        remainingToAllocate -= allocateAmt;
      }

      // 6. Shortage Detection & Requisition Stub (PUR)
      if (remainingToAllocate > 0) {
        hasShortage = true;
        const allocatedAmt = requiredQty - remainingToAllocate;

        // Record Shortage
        await tx.planningShortage.create({
          data: {
            pwoId,
            materialId: line.materialId,
            requiredQtyKg: requiredQty,
            allocatedQtyKg: allocatedAmt,
            shortageQtyKg: remainingToAllocate,
          },
        });

        // Create Purchase Requisition Stub (PUR)
        await tx.purchaseRequisitionPlaceholder.create({
          data: {
            pwoId,
            materialId: line.materialId,
            quantityKg: remainingToAllocate,
            status: "PENDING", // TODO: Replace with Sourcing module structures later
          },
        });
      }
    }

    // 7. Post-Allocation Actions & Stubs
    // Set PWO status to IN_PROGRESS
    await tx.planningWorkOrder.update({
      where: { id: pwoId },
      data: { status: PlanningStatus.IN_PROGRESS },
    });

    // Create Store Issue Slip Stub (STO)
    await tx.storeIssueSlipPlaceholder.create({
      data: {
        pwoId,
        status: "PENDING", // TODO: Replace with Store structures
      },
    });

    // Create Production Work Order Stub (PRD) ONLY if staging is fully covered
    if (!hasShortage) {
      await tx.productionWorkOrderPlaceholder.create({
        data: {
          pwoId,
          status: "READY", // TODO: Replace with Production structures
        },
      });
    }

    return { id: pwoId, hasShortage };
  });

  revalidatePath("/planning");
  return result;
}

/**
 * 7. Deallocation (Reversal Core Logic)
 */
export async function runStockDeallocation(pwoId: string) {
  await assertPermission("project:write");

  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch current allocations
    const allocations = await tx.planningAllocation.findMany({
      where: { pwoId },
    });

    // 2. Restore available inventory quantities to batches
    for (const alloc of allocations) {
      await tx.inventoryBatch.update({
        where: { id: alloc.batchId },
        data: {
          availableQtyKg: { increment: alloc.quantityKg },
        },
      });
    }

    // 3. Clear allocations, shortages, and stubs
    await tx.planningAllocation.deleteMany({ where: { pwoId } });
    await tx.planningShortage.deleteMany({ where: { pwoId } });
    await tx.purchaseRequisitionPlaceholder.deleteMany({ where: { pwoId } });
    await tx.productionWorkOrderPlaceholder.deleteMany({ where: { pwoId } });
    await tx.storeIssueSlipPlaceholder.deleteMany({ where: { pwoId } });

    // 4. Reset status back to APPROVED
    await tx.planningWorkOrder.update({
      where: { id: pwoId },
      data: { status: PlanningStatus.APPROVED },
    });

    return { id: pwoId };
  });

  revalidatePath("/planning");
  return result;
}

/**
 * 8. Reconcile OBOM (Planning Analysis)
 */
export async function getObomReconciliation(pwoId: string) {
  await assertPermission("project:read");

  const pwo = await prisma.planningWorkOrder.findUnique({
    where: { id: pwoId },
    include: {
      orderBom: {
        include: {
          lines: {
            include: { material: true },
          },
        },
      },
      allocations: {
        include: {
          material: true,
          batch: true,
        },
      },
      shortages: {
        include: { material: true },
      },
    },
  });

  if (!pwo || !pwo.orderBom) return null;

  const bomTotalKg = pwo.orderBom.lines.reduce(
    (sum, l) => sum + Number(l.quantityKg),
    0
  );
  const scalingRatio = Number(pwo.quantityKg) / bomTotalKg;

  // Build the reconciliation rows
  return pwo.orderBom.lines.map((line) => {
    const required = Number(line.quantityKg) * scalingRatio;
    
    // Sum up allocations
    const allocated = pwo.allocations
      .filter((a) => a.materialId === line.materialId)
      .reduce((sum, a) => sum + Number(a.quantityKg), 0);

    const shortage = pwo.shortages.find((s) => s.materialId === line.materialId);
    const allocatedBatches = pwo.allocations
      .filter((a) => a.materialId === line.materialId)
      .map((a) => `${a.batch.batchNo} (${Number(a.quantityKg)} kg)`);

    return {
      materialCode: line.material.code,
      materialName: line.material.name,
      requiredKg: required,
      allocatedKg: allocated,
      shortageKg: shortage ? Number(shortage.shortageQtyKg) : 0,
      batches: allocatedBatches,
    };
  });
}

/**
 * 9. Advance Material Planning (GAP 1 Standalone Flow)
 */
export async function runAdvanceMaterialPlanning(data: {
  materialId: string;
  quantityKg: number;
}) {
  await assertPermission("project:write");

  if (data.quantityKg <= 0) {
    throw new Error("Staging quantity must be greater than zero.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Verify that raw material exists
    const material = await tx.rawMaterial.findUnique({
      where: { id: data.materialId },
    });
    if (!material) {
      throw new Error("Selected raw material does not exist.");
    }

    let remainingToAllocate = data.quantityKg;
    let allocatedQtyKg = 0;

    // 2. Fetch available batches for this raw material (FIFO: receivedOn asc)
    const batches = await tx.inventoryBatch.findMany({
      where: {
        materialId: data.materialId,
        status: "AVAILABLE",
        availableQtyKg: { gt: 0 },
      },
      orderBy: { receivedOn: "asc" },
    });

    // 3. Consume physically available stock
    for (const batch of batches) {
      if (remainingToAllocate <= 0) break;

      const available = Number(batch.availableQtyKg);
      const allocateAmt = Math.min(available, remainingToAllocate);

      // Record standalone allocation
      await tx.planningAllocation.create({
        data: {
          pwoId: null,
          materialId: data.materialId,
          batchId: batch.id,
          quantityKg: allocateAmt,
        },
      });

      // Deduct from batch stock
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          availableQtyKg: { decrement: allocateAmt },
        },
      });

      allocatedQtyKg += allocateAmt;
      remainingToAllocate -= allocateAmt;
    }

    let requisitionId: string | null = null;
    const shortageQtyKg = remainingToAllocate;

    // 4. Handle shortage if requested quantity exceeds available stock
    if (shortageQtyKg > 0) {
      // Record Standalone Shortage
      await tx.planningShortage.create({
        data: {
          pwoId: null,
          materialId: data.materialId,
          requiredQtyKg: data.quantityKg,
          allocatedQtyKg: allocatedQtyKg,
          shortageQtyKg: shortageQtyKg,
        },
      });

      // Create Standalone Purchase Requisition Placeholder ONLY for shortage quantity
      const pr = await tx.purchaseRequisitionPlaceholder.create({
        data: {
          pwoId: null,
          materialId: data.materialId,
          quantityKg: shortageQtyKg,
          status: "PENDING",
        },
      });
      requisitionId = pr.id;
    }

    return {
      success: true,
      allocatedQtyKg,
      shortageQtyKg,
      requisitionId,
    };
  });

  revalidatePath("/planning");
  return result;
}
