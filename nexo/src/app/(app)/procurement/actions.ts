"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PoStatus, GrnStatus, QcResult, BatchStatus, MovementKind, ApprovalTier, WarehouseKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/session";
import { canApproveValue, approvalLimit, tierForValue } from "@/lib/rbac";
import { raiseRejectionNote } from "./sourcing-actions";

export type ActionState = { error?: string; success?: string; warning?: string };

// ── Purchase orders ─────────────────────────────────────────────────────────

export async function approvePurchaseOrder(poId: string): Promise<ActionState> {
  const user = await assertPermission("po:approve");

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { status: true, code: true, totalValue: true, approvalTier: true, raisedById: true },
  });
  if (!po) return { error: "That purchase order no longer exists." };
  if (po.status !== PoStatus.PENDING_APPROVAL) {
    return { error: `${po.code} is ${po.status.toLowerCase().replace(/_/g, " ")} — it cannot be approved from here.` };
  }

  // Nobody signs off their own commitment.
  if (po.raisedById && po.raisedById === user.id) {
    return { error: `You raised ${po.code}. It needs approval from someone else.` };
  }

  // Value authority, not just permission. An order that escalated to Management
  // cannot be waved through by the Purchase Head who escalated it.
  const value = Number(po.totalValue);
  if (!canApproveValue(user.role, value)) {
    const limit = approvalLimit(user.role);
    return {
      error:
        limit === null
          ? "Your role has no purchase approval authority."
          : `${po.code} is ₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}, above your ₹${limit.toLocaleString("en-IN")} limit. It needs Management approval.`,
    };
  }

  await prisma.$transaction([
    prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: PoStatus.APPROVED, approvedById: user.id, approvedAt: new Date() },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "PurchaseOrder", entityId: poId, action: "APPROVE",
        summary: `Approved ${po.code} — ₹${value.toFixed(2)} (${po.approvalTier ?? "HEAD"} tier)`,
        metadata: { value, tier: po.approvalTier, approverRole: user.role },
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/orders");
  revalidatePath(`/procurement/orders/${poId}`);
  revalidatePath("/");
  return { success: `${po.code} approved.` };
}

export async function cancelPurchaseOrder(poId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("po:write");

  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { status: true, code: true } });
  if (!po) return { error: "That purchase order no longer exists." };
  if (po.status === PoStatus.RECEIVED || po.status === PoStatus.CLOSED) {
    return { error: `${po.code} has already been received. Cancel is not available.` };
  }

  await prisma.$transaction([
    prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: PoStatus.CANCELLED, remark: reason.trim() || null },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "PurchaseOrder", entityId: poId, action: "CANCEL",
        summary: `Cancelled ${po.code}${reason.trim() ? ` — ${reason.trim()}` : ""}`, actorId: user.id,
      },
    }),
  ]);

  revalidatePath("/procurement/orders");
  revalidatePath(`/procurement/orders/${poId}`);
  return { success: `${po.code} cancelled.` };
}

export async function closePurchaseOrder(poId: string, reason: string): Promise<ActionState> {
  const user = await assertPermission("po:write");

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { error: "Please provide a reason for closing this purchase order." };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on the purchase order
    const [po] = await tx.$queryRaw<Array<{ id: string; code: string; status: PoStatus }>>`
      SELECT id, code, status FROM "PurchaseOrder" WHERE id = ${poId} FOR UPDATE
    `;

    if (!po) return { error: "That purchase order no longer exists." };

    if (po.status === PoStatus.CLOSED) {
      return { error: `${po.code} is already closed.` };
    }
    if (po.status === PoStatus.CANCELLED) {
      return { error: `${po.code} is cancelled — cannot close a cancelled order.` };
    }
    if (po.status === PoStatus.RECEIVED) {
      return { error: `${po.code} is fully received — cannot short-close a completed order.` };
    }
    if (po.status === PoStatus.PENDING_APPROVAL || po.status === PoStatus.DRAFT) {
      return { error: `${po.code} is not yet approved. Cancel or reject the order instead.` };
    }

    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: poId },
      select: { id: true, lineNo: true, quantityKg: true, receivedKg: true },
    });

    const hasPending = lines.some(
      (l) => Number(l.quantityKg) - Number(l.receivedKg) > 0.001
    );

    if (!hasPending) {
      return {
        error: `${po.code} has no pending balance remaining (already fully received). It cannot be short-closed.`,
      };
    }

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: PoStatus.CLOSED,
        remark: trimmedReason,
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "PurchaseOrder",
        entityId: poId,
        action: "CLOSE",
        summary: `Closed ${po.code} (short-closed) — ${trimmedReason}`,
        metadata: { reason: trimmedReason },
        actorId: user.id,
      },
    });

    return { success: `${po.code} closed.` };
  });

  if (result.success) {
    revalidatePath("/procurement/orders");
    revalidatePath(`/procurement/orders/${poId}`);
    revalidatePath("/");
  }

  return result;
}

const poSchema = z.object({
  vendorId: z.string().min(1, "Choose a vendor."),
  expectedOn: z.string().optional(),
  deliveryTerms: z.string().optional(),
  paymentTerms: z.string().optional(),
  freight: z.coerce.number().min(0).default(0),
  remark: z.string().optional(),
  lines: z.string().min(1, "Add at least one line."),
});

const lineSchema = z.array(
  z.object({
    materialId: z.string().min(1),
    quantityKg: z.number().positive(),
    ratePerKg: z.number().min(0),
    taxPct: z.number().min(0).max(100),
  }),
).min(1, "Add at least one line.");

export async function createPurchaseOrder(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("po:write");

  const parsed = poSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the order." };

  let lines;
  try {
    lines = lineSchema.parse(JSON.parse(parsed.data.lines));
  } catch {
    return { error: "Add at least one valid line with a quantity and rate." };
  }

  const subtotal = lines.reduce((a, l) => a + l.quantityKg * l.ratePerKg, 0);
  const taxAmount = lines.reduce((a, l) => a + (l.quantityKg * l.ratePerKg * l.taxPct) / 100, 0);
  const freight = parsed.data.freight;
  const totalValue = subtotal + taxAmount + freight;

  // Routing is fixed at the moment of commitment, from the order's own value.
  const tier = tierForValue(totalValue) === "MANAGEMENT" ? ApprovalTier.MANAGEMENT : ApprovalTier.HEAD;

  const year = new Date().getFullYear();
  const prefixPattern = `PO-${year}-`;

  const created = await prisma.$transaction(async (tx) => {
    const records = await tx.purchaseOrder.findMany({
      where: { code: { startsWith: prefixPattern } },
      select: { code: true },
    });

    let maxNum = 0;
    for (const r of records) {
      const raw = r.code.replace(prefixPattern, "");
      const parsedNum = parseInt(raw, 10);
      if (!isNaN(parsedNum) && parsedNum > maxNum) {
        maxNum = parsedNum;
      }
    }

    let nextNum = maxNum + 1;
    let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

    while (await tx.purchaseOrder.findUnique({ where: { code: candidate }, select: { id: true } })) {
      nextNum++;
      candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
    }

    const po = await tx.purchaseOrder.create({
      data: {
        code: candidate,
        status: PoStatus.PENDING_APPROVAL,
        approvalTier: tier,
        vendorId: parsed.data.vendorId,
        expectedOn: parsed.data.expectedOn ? new Date(parsed.data.expectedOn) : null,
        deliveryTerms: parsed.data.deliveryTerms || null,
        paymentTerms: parsed.data.paymentTerms || null,
        remark: parsed.data.remark || null,
        subtotal, taxAmount, freight, totalValue,
        raisedById: user.id,
        lines: {
          create: lines.map((l, i) => ({
            materialId: l.materialId,
            lineNo: i + 1,
            quantityKg: l.quantityKg,
            ratePerKg: l.ratePerKg,
            taxPct: l.taxPct,
            lineTotal: l.quantityKg * l.ratePerKg,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "PurchaseOrder",
        entityId: po.id,
        action: "CREATE",
        summary: `Raised ${po.code} for ₹${totalValue.toFixed(2)} — routed to ${tier} approval`,
        metadata: { value: totalValue, tier },
        actorId: user.id,
      },
    });

    return po;
  });

  revalidatePath("/procurement/orders");
  revalidatePath("/procurement/approvals");
  redirect(`/procurement/orders/${created.id}`);
}

// ── Goods receipt ───────────────────────────────────────────────────────────

const receiveLineSchema = z.object({
  purchaseOrderLineId: z.string().min(1),
  challanQtyKg: z.coerce.number().min(0),
  receivedQtyKg: z.coerce.number().min(0),
});

const createGrnSchema = z.object({
  purchaseOrderId: z.string().min(1, "Purchase order is required."),
  challanNo: z.string().min(1, "Enter the delivery challan number."),
  vehicleNo: z.string().min(1, "Enter the transport vehicle number."),
  invoiceNo: z.string().optional(),
  gateEntryNo: z.string().optional(),
  receivedOn: z.string().optional(),
  lines: z.string().min(1, "Lines are required."),
});

/**
 * Record a new material receipt (GRN) against an approved or partially received purchase order.
 *
 * Captures challan and weighbridge figures at the factory gate before QC inspection.
 */
export async function createGoodsReceipt(form: FormData): Promise<ActionState & { grnId?: string }> {
  const user = await assertPermission("grn:write");

  const parsed = createGrnSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the receipt details." };
  }

  let lineInputs: z.infer<typeof receiveLineSchema>[];
  try {
    lineInputs = z.array(receiveLineSchema).parse(JSON.parse(parsed.data.lines));
  } catch {
    return { error: "Could not read line quantities. Re-enter and try again." };
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: parsed.data.purchaseOrderId },
    include: {
      lines: {
        select: { id: true, lineNo: true, quantityKg: true, receivedKg: true, materialId: true },
      },
      vendor: { select: { id: true } },
    },
  });

  if (!po) return { error: "That purchase order no longer exists." };
  if (
    po.status !== PoStatus.APPROVED &&
    po.status !== PoStatus.PARTIALLY_RECEIVED &&
    po.status !== PoStatus.CLOSED &&
    po.status !== PoStatus.RECEIVED
  ) {
    return {
      error: `${po.code} is ${po.status.toLowerCase().replace(/_/g, " ")} — cannot receive goods against this order.`,
    };
  }

  const validLines: {
    poLineId: string;
    lineNo: number;
    challanQtyKg: number;
    receivedQtyKg: number;
  }[] = [];

  for (const input of lineInputs) {
    const poLine = po.lines.find((l) => l.id === input.purchaseOrderLineId);
    if (!poLine) continue;

    const pendingKg = Number(poLine.quantityKg) - Number(poLine.receivedKg);
    if (input.receivedQtyKg > pendingKg + 0.001) {
      return {
        error: `Line ${poLine.lineNo}: received quantity (${input.receivedQtyKg} kg) exceeds pending balance (${pendingKg.toFixed(3)} kg).`,
      };
    }

    if (input.receivedQtyKg > 0 || input.challanQtyKg > 0) {
      validLines.push({
        poLineId: poLine.id,
        lineNo: poLine.lineNo,
        challanQtyKg: input.challanQtyKg,
        receivedQtyKg: input.receivedQtyKg,
      });
    }
  }

  if (validLines.length === 0 || !validLines.some((l) => l.receivedQtyKg > 0)) {
    return { error: "Enter a received quantity greater than zero for at least one line." };
  }

  // Generate next sequential GRN code: GRN-YYYY-XXXX
  const year = new Date().getFullYear();
  const prefixPattern = `GRN-${year}-`;

  const created = await prisma.$transaction(async (tx) => {
    const records = await tx.goodsReceipt.findMany({
      where: { code: { startsWith: prefixPattern } },
      select: { code: true },
    });

    let maxNum = 0;
    for (const r of records) {
      const raw = r.code.replace(prefixPattern, "");
      const parsedNum = parseInt(raw, 10);
      if (!isNaN(parsedNum) && parsedNum > maxNum) {
        maxNum = parsedNum;
      }
    }

    let nextNum = maxNum + 1;
    let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

    while (await tx.goodsReceipt.findUnique({ where: { code: candidate }, select: { id: true } })) {
      nextNum++;
      candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
    }

    const grn = await tx.goodsReceipt.create({
      data: {
        code: candidate,
        status: GrnStatus.PENDING_QC,
        purchaseOrderId: po.id,
        vendorId: po.vendorId,
        receivedOn: parsed.data.receivedOn ? new Date(parsed.data.receivedOn) : new Date(),
        invoiceNo: parsed.data.invoiceNo?.trim() || parsed.data.challanNo.trim(),
        vehicleNo: parsed.data.vehicleNo.trim(),
        gateEntryNo: parsed.data.gateEntryNo?.trim() || parsed.data.challanNo.trim(),
        receivedById: user.id,
        lines: {
          create: validLines.map((l, i) => ({
            purchaseOrderLineId: l.poLineId,
            lineNo: i + 1,
            challanQtyKg: l.challanQtyKg,
            receivedQtyKg: l.receivedQtyKg,
            acceptedQtyKg: l.receivedQtyKg,
            rejectedQtyKg: 0,
            qcResult: QcResult.PENDING,
          })),
        },
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "GoodsReceipt",
        entityId: grn.id,
        action: "CREATE",
        summary: `Recorded ${candidate} against ${po.code} (${validLines.length} lines, vehicle ${parsed.data.vehicleNo})`,
        actorId: user.id,
      },
    });

    return grn;
  });

  revalidatePath("/procurement/orders");
  revalidatePath(`/procurement/orders/${po.id}`);
  revalidatePath("/procurement/grn");
  revalidatePath(`/procurement/grn/${created.id}`);
  revalidatePath("/procurement/flow");
  revalidatePath("/");

  return {
    success: `${created.code} recorded against ${po.code}. Ready for inspection.`,
    grnId: created.id,
  };
}


const qcLineSchema = z.array(
  z.object({
    lineId: z.string().min(1),
    acceptedQtyKg: z.number().min(0),
    rejectedQtyKg: z.number().min(0),
    qcResult: z.nativeEnum(QcResult),
    qcRemark: z.string().optional(),
  }),
);

/**
 * Record the QC outcome for a receipt.
 *
 * This is the step that turns a delivery into stock: accepted quantity becomes a
 * traceable batch, a GRN_RECEIPT movement lands in the ledger, and the purchase
 * order line's received total moves so the PO can close itself out.
 */
export async function postGoodsReceipt(
  grnId: string,
  linesJson: string,
  qcRemark: string,
): Promise<ActionState> {
  const user = await assertPermission("grn:qc");

  let lines;
  try {
    lines = qcLineSchema.parse(JSON.parse(linesJson));
  } catch {
    return { error: "The inspection results could not be read. Re-enter and try again." };
  }

  const grn = await prisma.goodsReceipt.findUnique({
    where: { id: grnId },
    include: {
      lines: { include: { purchaseOrderLine: { select: { id: true, materialId: true, ratePerKg: true, quantityKg: true } } } },
      purchaseOrder: { select: { id: true, code: true, status: true } },
    },
  });

  if (!grn) return { error: "That goods receipt no longer exists." };
  if (grn.status === GrnStatus.POSTED) return { error: `${grn.code} has already been posted to stock.` };

  // batchSeq is resolved inside the transaction (see below) to avoid race conditions.
  // Do NOT compute it here — a racy pre-transaction read causes P2002 collisions.

  // Where the accepted quantity lands. A clean pass goes to the store and is
  // issuable; anything accepted with a deviation is held in quarantine until
  // someone releases it, so a conditional result cannot quietly become stock.
  const [store, quarantine, rejectionWh] = await Promise.all([
    prisma.warehouse.findFirst({ where: { kind: WarehouseKind.STORE, isActive: true }, orderBy: { code: "asc" }, select: { id: true } }),
    prisma.warehouse.findFirst({ where: { kind: WarehouseKind.QUARANTINE, isActive: true }, select: { id: true } }),
    prisma.warehouse.findFirst({ where: { kind: WarehouseKind.REJECTION, isActive: true }, select: { id: true } }),
  ]);

  if (!store) {
    return { error: "No active store warehouse is configured. Add one before posting receipts to stock." };
  }
  if (!rejectionWh && lines.some((l) => l.rejectedQtyKg > 0)) {
    return { error: "No active Rejection warehouse is configured. Add one before posting rejected receipts." };
  }

  for (const input of lines) {
    const grnLine = grn.lines.find((l) => l.id === input.lineId);
    if (!grnLine) continue;
    if (input.acceptedQtyKg + input.rejectedQtyKg > Number(grnLine.receivedQtyKg) + 0.001) {
      return {
        error: `Line ${grnLine.lineNo}: accepted (${input.acceptedQtyKg} kg) plus rejected (${input.rejectedQtyKg} kg) cannot exceed weighed quantity (${Number(grnLine.receivedQtyKg).toFixed(3)} kg).`,
      };
    }
  }

  const anyFail = lines.some((l) => l.qcResult === QcResult.FAIL);
  const anyConditional = lines.some((l) => l.qcResult === QcResult.CONDITIONAL);

  const txResult = await prisma.$transaction(async (tx) => {
    // Atomically get the highest existing sequence for this year's batches.
    const year = new Date().getFullYear();
    const prefix = `B-${year}-`;
    const records = await tx.inventoryBatch.findMany({
      where: { batchNo: { startsWith: prefix } },
      select: { batchNo: true },
    });

    let maxNum = 0;
    for (const r of records) {
      const raw = r.batchNo.slice(prefix.length);
      const parsedNum = parseInt(raw, 10);
      if (!isNaN(parsedNum) && parsedNum > maxNum) {
        maxNum = parsedNum;
      }
    }
    let batchSeq = maxNum;

    for (const input of lines) {
      const grnLine = grn.lines.find((l) => l.id === input.lineId);
      if (!grnLine) continue;

      const poLine = grnLine.purchaseOrderLine;
      const accepted = input.acceptedQtyKg;
      const rejected = input.rejectedQtyKg;

      let batchId = grnLine.batchId;
      let rejectedBatchId = grnLine.rejectedBatchId;

      if (accepted > 0 && !batchId) {
        batchSeq++;
        let candidate = `${prefix}${String(batchSeq).padStart(5, "0")}`;
        while (await tx.inventoryBatch.findUnique({ where: { batchNo: candidate }, select: { id: true } })) {
          batchSeq++;
          candidate = `${prefix}${String(batchSeq).padStart(5, "0")}`;
        }

        const batch = await tx.inventoryBatch.create({
          data: {
            batchNo: candidate,
            materialId: poLine.materialId,
            status: input.qcResult === QcResult.PASS ? BatchStatus.AVAILABLE : BatchStatus.QUARANTINE,
            receivedQtyKg: accepted,
            availableQtyKg: accepted,
            ratePerKg: poLine.ratePerKg,
            warehouseId: input.qcResult === QcResult.PASS ? store.id : (quarantine?.id ?? store.id),
            receivedOn: grn.receivedOn,
          },
        });
        batchId = batch.id;

        await tx.stockMovement.create({
          data: {
            kind: MovementKind.GRN_RECEIPT,
            materialId: poLine.materialId,
            batchId: batch.id,
            quantityKg: accepted,
            ratePerKg: poLine.ratePerKg,
            reference: grn.code,
            remark: `Received against ${grn.purchaseOrder.code}`,
            userId: user.id,
            occurredAt: grn.receivedOn,
          },
        });
      }

      if (rejected > 0 && !rejectedBatchId && rejectionWh) {
        batchSeq++;
        let candidate = `${prefix}${String(batchSeq).padStart(5, "0")}`;
        while (await tx.inventoryBatch.findUnique({ where: { batchNo: candidate }, select: { id: true } })) {
          batchSeq++;
          candidate = `${prefix}${String(batchSeq).padStart(5, "0")}`;
        }

        const rejBatch = await tx.inventoryBatch.create({
          data: {
            batchNo: candidate,
            materialId: poLine.materialId,
            status: BatchStatus.REJECTED,
            receivedQtyKg: rejected,
            availableQtyKg: rejected,
            ratePerKg: poLine.ratePerKg,
            warehouseId: rejectionWh.id,
            receivedOn: grn.receivedOn,
          },
        });
        rejectedBatchId = rejBatch.id;

        await tx.stockMovement.create({
          data: {
            kind: MovementKind.GRN_REJECT,
            materialId: poLine.materialId,
            batchId: rejBatch.id,
            quantityKg: rejected,
            ratePerKg: poLine.ratePerKg,
            reference: grn.code,
            remark: `QC rejection against ${grn.purchaseOrder.code}${input.qcRemark ? ` — ${input.qcRemark}` : ""}`,
            userId: user.id,
            occurredAt: grn.receivedOn,
          },
        });
      }

      await tx.goodsReceiptLine.update({
        where: { id: grnLine.id },
        data: {
          acceptedQtyKg: accepted,
          rejectedQtyKg: rejected,
          qcResult: input.qcResult,
          qcRemark: input.qcRemark || null,
          batchId,
          rejectedBatchId,
        },
      });

      const previouslyCounted = Number(grnLine.acceptedQtyKg);
      const delta = accepted - previouslyCounted;
      if (delta !== 0) {
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: { receivedKg: { increment: delta } },
        });
      }
    }

    await tx.goodsReceipt.update({
      where: { id: grnId },
      data: {
        status: anyFail ? GrnStatus.QC_FAILED : anyConditional ? GrnStatus.PARTIALLY_ACCEPTED : GrnStatus.POSTED,
        inspectedById: user.id,
        inspectedAt: new Date(),
        qcRemark: qcRemark.trim() || null,
        postedAt: anyFail ? null : new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "GoodsReceipt", entityId: grnId, action: "POST",
        summary: `Posted ${grn.code} to stock${anyFail ? " (QC failure recorded)" : ""}`,
        actorId: user.id,
      },
    });

    // Acquire lock and update purchase order status atomically
    const [currentPo] = await tx.$queryRaw<Array<{ id: string; status: PoStatus }>>`
      SELECT id, status FROM "PurchaseOrder" WHERE id = ${grn.purchaseOrder.id} FOR UPDATE
    `;

    let finalPoStatus = currentPo?.status ?? grn.purchaseOrder.status;

    // Close the PO out if every line is now fully received, or reopen to PARTIALLY_RECEIVED/APPROVED (unless already CLOSED).
    if (finalPoStatus !== PoStatus.CLOSED) {
      const poLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: grn.purchaseOrder.id },
        select: { quantityKg: true, receivedKg: true },
      });
      const fully = poLines.every((l) => Number(l.receivedKg) >= Number(l.quantityKg) - 0.001);
      const partly = poLines.some((l) => Number(l.receivedKg) > 0.001);

      if (fully) {
        finalPoStatus = PoStatus.RECEIVED;
      } else if (partly) {
        finalPoStatus = PoStatus.PARTIALLY_RECEIVED;
      } else {
        finalPoStatus = PoStatus.APPROVED;
      }

      await tx.purchaseOrder.update({
        where: { id: grn.purchaseOrder.id },
        data: { status: finalPoStatus },
      });
    }

    return { finalPoStatus };
  });

  // Auto-trigger vendor rejection note if rejected material lands against an already CLOSED PO
  let autoVrnNotice: string | undefined;
  let autoVrnWarning: string | undefined;
  const hasRejections = lines.some((l) => l.rejectedQtyKg > 0);
  if (hasRejections && txResult.finalPoStatus === PoStatus.CLOSED) {
    const vrnResult = await raiseRejectionNote(grnId);
    if (vrnResult.success) {
      autoVrnNotice = vrnResult.success;
    } else if (vrnResult.error) {
      autoVrnWarning = `Receipt posted, but automatic rejection note failed: ${vrnResult.error}. Raise it manually.`;
    }
  }

  revalidatePath(`/procurement/grn/${grnId}`);
  revalidatePath("/procurement/grn");
  revalidatePath("/procurement/inventory");
  revalidatePath("/procurement/ledger");
  revalidatePath(`/procurement/orders/${grn.purchaseOrder.id}`);
  revalidatePath("/");

  return {
    success: anyFail
      ? `Inspection recorded. QC failure logged — nothing posted to available stock.${autoVrnNotice ? ` ${autoVrnNotice}` : ""}`
      : `${grn.code} posted. Stock and the ledger are updated.${autoVrnNotice ? ` ${autoVrnNotice}` : ""}`,
    warning: autoVrnWarning,
  };
}

// ── Inventory adjustment ────────────────────────────────────────────────────

const adjustSchema = z.object({
  batchId: z.string().min(1),
  quantityKg: z.coerce.number().refine((n) => n !== 0, "Enter a non-zero quantity."),
  reason: z.string().min(4, "Say why the stock is being adjusted."),
});

export async function adjustStock(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await assertPermission("inventory:adjust");

  const parsed = adjustSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the adjustment." };

  const { batchId, quantityKg, reason } = parsed.data;

  const batch = await prisma.inventoryBatch.findUnique({
    where: { id: batchId },
    select: { id: true, materialId: true, availableQtyKg: true, ratePerKg: true, batchNo: true },
  });
  if (!batch) return { error: "That batch no longer exists." };

  const available = Number(batch.availableQtyKg);
  if (quantityKg < 0 && Math.abs(quantityKg) > available) {
    return { error: `Only ${available.toFixed(3)} kg is available in ${batch.batchNo}.` };
  }

  const newQty = available + quantityKg;

  await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        kind: quantityKg > 0 ? MovementKind.ADJUSTMENT_POSITIVE : MovementKind.ADJUSTMENT_NEGATIVE,
        materialId: batch.materialId,
        batchId: batch.id,
        quantityKg,
        balanceAfterKg: newQty,
        ratePerKg: batch.ratePerKg,
        reference: "Adjustment",
        remark: reason.trim(),
        userId: user.id,
      },
    }),
    prisma.inventoryBatch.update({
      where: { id: batchId },
      data: {
        availableQtyKg: newQty,
        status: newQty <= 0.5 ? BatchStatus.CONSUMED : undefined,
      },
    }),
    prisma.auditEvent.create({
      data: {
        entityType: "InventoryBatch", entityId: batchId, action: "ADJUST",
        summary: `Adjusted ${batch.batchNo} by ${quantityKg > 0 ? "+" : ""}${quantityKg.toFixed(3)} kg — ${reason.trim()}`,
        actorId: user.id,
      },
    }),
  ]);

  revalidatePath(`/procurement/inventory/${batchId}`);
  revalidatePath("/procurement/inventory");
  revalidatePath("/procurement/ledger");
  return { success: `Adjusted by ${quantityKg > 0 ? "+" : ""}${quantityKg.toFixed(3)} kg.` };
}

/** Release a quarantined batch into available stock after QC clears it. */
export async function releaseBatch(batchId: string): Promise<ActionState> {
  const user = await assertPermission("inventory:adjust");

  const batch = await prisma.inventoryBatch.findUnique({
    where: { id: batchId },
    select: { status: true, batchNo: true },
  });
  if (!batch) return { error: "That batch no longer exists." };
  if (batch.status !== BatchStatus.QUARANTINE) {
    return { error: `${batch.batchNo} is not in quarantine.` };
  }

  await prisma.$transaction([
    prisma.inventoryBatch.update({ where: { id: batchId }, data: { status: BatchStatus.AVAILABLE } }),
    prisma.auditEvent.create({
      data: {
        entityType: "InventoryBatch", entityId: batchId, action: "RELEASE",
        summary: `Released ${batch.batchNo} from quarantine to available stock`, actorId: user.id,
      },
    }),
  ]);

  revalidatePath(`/procurement/inventory/${batchId}`);
  revalidatePath("/procurement/inventory");
  return { success: `${batch.batchNo} released to available stock.` };
}
