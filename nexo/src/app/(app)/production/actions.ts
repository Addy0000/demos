"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { BatchStatus, DirectManufacturingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

/**
 * PRD-2.1: Schedule direct manufacturing production run from planning stub
 */
export async function createDirectManufacturingWorkOrder(data: {
  placeholderId: string;
  resourceId: string;
  operatorId: string;
  shift: string;
  targetQtyKg: number;
  warehouseId: string;
}) {
  const session = await assertPermission("project:write");

  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch placeholder and check status
    const placeholder = await tx.productionWorkOrderPlaceholder.findUnique({
      where: { id: data.placeholderId },
      include: {
        pwo: {
          include: {
            orderBom: true,
          },
        },
      },
    });

    if (!placeholder) {
      throw new Error("Production work order placeholder stub not found.");
    }

    if (placeholder.status !== "READY") {
      throw new Error("Planning placeholder is not ready to schedule.");
    }

    if (!placeholder.pwo.orderBomId) {
      throw new Error("Planning work order does not have an active Order BOM.");
    }

    // 2. Generate unique code DMWO-YYYY-XXXX
    const year = new Date().getFullYear();
    const count = await tx.directManufacturingWorkOrder.count();
    const code = `DMWO-${year}-${String(count + 1).padStart(4, "0")}`;

    // 3. Create DirectManufacturingWorkOrder
    const dmwo = await tx.directManufacturingWorkOrder.create({
      data: {
        code,
        status: DirectManufacturingStatus.DRAFT,
        orderBomId: placeholder.pwo.orderBomId,
        resourceId: data.resourceId,
        operatorId: data.operatorId,
        shift: data.shift,
        targetQtyKg: data.targetQtyKg,
        warehouseId: data.warehouseId,
        createdById: session.id,
      },
    });

    // 4. Update placeholder status to CONSUMED so it cannot be rescheduled
    await tx.productionWorkOrderPlaceholder.update({
      where: { id: placeholder.id },
      data: { status: "CONSUMED" },
    });

    return dmwo;
  });

  revalidatePath("/production");
  return { id: result.id, code: result.code };
}

/**
 * PRD-3.2: Start direct manufacturing production run
 */
export async function startDirectManufacturingRun(id: string) {
  await assertPermission("project:write");

  const dmwo = await prisma.directManufacturingWorkOrder.update({
    where: { id },
    data: {
      status: DirectManufacturingStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });

  revalidatePath("/production");
  return { id: dmwo.id, status: dmwo.status };
}

/**
 * PRD-3.4: Complete direct manufacturing production run with generic worksheet inputs
 */
export async function completeDirectManufacturingRun(data: {
  id: string;
  actualQtyKg: number;
  processLog?: string;
  metrics?: { label: string; value: string }[];
}) {
  await assertPermission("project:write");

  if (data.actualQtyKg <= 0) {
    throw new Error("Actual yield quantity must be greater than zero.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch the direct manufacturing work order and verify status
    const dmwo = await tx.directManufacturingWorkOrder.findUnique({
      where: { id: data.id },
      include: {
        orderBom: {
          include: {
            lines: true,
            standardBom: true,
          },
        },
      },
    });

    if (!dmwo) {
      throw new Error("Direct manufacturing work order not found.");
    }

    if (dmwo.status !== DirectManufacturingStatus.IN_PROGRESS) {
      throw new Error("Production run must be in progress to complete.");
    }

    const compoundMaterialId = dmwo.orderBom.standardBom?.materialId;
    if (!compoundMaterialId) {
      throw new Error("Target product material not defined on Order BOM.");
    }

    // 2. Perform FIFO raw material consumption deduction
    const bomTotalKg = dmwo.orderBom.lines.reduce(
      (sum, l) => sum + Number(l.quantityKg),
      0
    );

    if (bomTotalKg <= 0) {
      throw new Error("Associated BOM is empty or has zero total weight.");
    }

    // Scale raw material requirements based on the scheduled targetQtyKg
    const scalingRatio = Number(dmwo.targetQtyKg) / bomTotalKg;

    for (const line of dmwo.orderBom.lines) {
      const requiredQty = Number(line.quantityKg) * scalingRatio;
      let remainingToDeduct = requiredQty;

      // Find available batches for this raw material component (FIFO: receivedOn asc)
      const batches = await tx.inventoryBatch.findMany({
        where: {
          materialId: line.materialId,
          status: "AVAILABLE",
          availableQtyKg: { gt: 0 },
        },
        orderBy: { receivedOn: "asc" },
      });

      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const available = Number(batch.availableQtyKg);
        const deductAmt = Math.min(available, remainingToDeduct);

        // Deduct from batch stock
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQtyKg: { decrement: deductAmt },
          },
        });

        remainingToDeduct -= deductAmt;
      }
    }

    // 3. Generate finished goods batch (status: QUARANTINE) in target warehouse
    const finishedBatch = await tx.inventoryBatch.create({
      data: {
        batchNo: `B-CP-${dmwo.code}`,
        materialId: compoundMaterialId,
        status: "QUARANTINE",
        receivedQtyKg: data.actualQtyKg,
        availableQtyKg: data.actualQtyKg,
        ratePerKg: 0.00,
        warehouseId: dmwo.warehouseId,
        receivedOn: new Date(),
      },
    });

    // 4. Create the QualityControlPlaceholder stub in PENDING status
    const qc = await tx.qualityControlPlaceholder.create({
      data: {
        dmwoId: dmwo.id,
        status: "PENDING",
      },
    });

    // 5. Update DirectManufacturingWorkOrder to PENDING_QC and save generic worksheet metrics
    const updated = await tx.directManufacturingWorkOrder.update({
      where: { id: data.id },
      data: {
        status: DirectManufacturingStatus.PENDING_QC,
        actualQtyKg: data.actualQtyKg,
        processLog: data.processLog ?? null,
        metrics: data.metrics ? JSON.parse(JSON.stringify(data.metrics)) : null,
        completedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      code: updated.code,
      batchNo: finishedBatch.batchNo,
      qcPlaceholderId: qc.id,
    };
  });

  revalidatePath("/production");
  return result;
}

/**
 * PRD-3.5: Create new dynamic Production Resource (Work Center)
 */
export async function createProductionResource(data: {
  name: string;
  code: string;
  type: string;
}) {
  await assertPermission("project:write");

  if (!data.name.trim() || !data.code.trim() || !data.type.trim()) {
    throw new Error("All fields (Name, Code, Type) are required.");
  }

  const normalizedCode = data.code.trim().toUpperCase();

  const existing = await prisma.productionResource.findUnique({
    where: { code: normalizedCode },
  });

  if (existing) {
    throw new Error(`Production resource with code ${normalizedCode} already exists.`);
  }

  const resource = await prisma.productionResource.create({
    data: {
      name: data.name.trim(),
      code: normalizedCode,
      type: data.type.trim(),
      isActive: true,
    },
  });

  revalidatePath("/production");
  return resource;
}

/**
 * PRD-3.6: Toggle active status of dynamic Production Resource
 */
export async function toggleProductionResourceActive(id: string, isActive: boolean) {
  await assertPermission("project:write");

  const resource = await prisma.productionResource.update({
    where: { id },
    data: { isActive },
  });

  revalidatePath("/production");
  return resource;
}

/**
 * PRD-4.1: Submit QC verdict for direct manufacturing run
 */
export async function submitQcVerdict(data: {
  dmwoId: string;
  verdict: "PASSED" | "FAILED";
  notes?: string;
}) {
  const session = await assertPermission("project:write");

  if (data.verdict !== "PASSED" && data.verdict !== "FAILED") {
    throw new Error("Verdict must be either PASSED or FAILED.");
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch work order and verify status
    const dmwo = await tx.directManufacturingWorkOrder.findUnique({
      where: { id: data.dmwoId },
      include: {
        qcPlaceholder: true,
      },
    });

    if (!dmwo) {
      throw new Error("Direct manufacturing work order not found.");
    }

    if (dmwo.status !== DirectManufacturingStatus.PENDING_QC) {
      throw new Error("Work order must be in PENDING_QC status to submit a QC verdict.");
    }

    if (!dmwo.qcPlaceholder) {
      throw new Error("Quality control placeholder record not found for this work order.");
    }

    // 2. Fetch the finished goods yield batch (B-CP-${dmwo.code})
    const batch = await tx.inventoryBatch.findUnique({
      where: { batchNo: `B-CP-${dmwo.code}` },
    });

    if (!batch) {
      throw new Error(`Finished goods inventory batch B-CP-${dmwo.code} not found.`);
    }

    const now = new Date();

    // 3. Update QualityControlPlaceholder
    await tx.qualityControlPlaceholder.update({
      where: { id: dmwo.qcPlaceholder.id },
      data: {
        status: data.verdict,
        verdictById: session.id,
        verdictAt: now,
        notes: data.notes?.trim() || null,
      },
    });

    if (data.verdict === "PASSED") {
      // 4a. Update work order to COMPLETED
      await tx.directManufacturingWorkOrder.update({
        where: { id: dmwo.id },
        data: {
          status: DirectManufacturingStatus.COMPLETED,
        },
      });

      // 4b. Update finished goods batch status from QUARANTINE to AVAILABLE
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          status: BatchStatus.AVAILABLE,
        },
      });
    } else {
      // 5a. Update work order to REJECTED
      await tx.directManufacturingWorkOrder.update({
        where: { id: dmwo.id },
        data: {
          status: DirectManufacturingStatus.REJECTED,
        },
      });

      // 5b. Update finished goods batch status to REJECTED
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          status: BatchStatus.REJECTED,
        },
      });
    }

    return { id: dmwo.id, code: dmwo.code, verdict: data.verdict };
  });

  revalidatePath("/production");
  revalidatePath(`/production/${data.dmwoId}/run`);
  return result;
}

