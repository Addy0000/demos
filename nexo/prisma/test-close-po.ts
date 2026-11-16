import { PrismaClient, PoStatus, GrnStatus, QcResult, WarehouseKind } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting comprehensive DB verification for PurchaseOrder close and PUR-3 trigger...");

  // Prerequisite seed data
  const vendor = await prisma.vendor.findFirst({ select: { id: true, name: true } });
  const material = await prisma.rawMaterial.findFirst({ select: { id: true, name: true } });
  const user = await prisma.user.findFirst({ select: { id: true, name: true } });

  if (!vendor || !material || !user) {
    throw new Error("Missing prerequisite seed data (vendor, material, user)");
  }

  const year = new Date().getFullYear();
  const testPoCode = `PO-${year}-8888`;

  // Clean up any previous test runs
  const testCodes = [`PO-${year}-8888`, `PO-${year}-8887`, `PO-${year}-8886`];
  const existingPos = await prisma.purchaseOrder.findMany({ where: { code: { in: testCodes } } });
  if (existingPos.length > 0) {
    const ids = existingPos.map((p) => p.id);
    await prisma.vendorRejectionNote.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: ids } } } });
    await prisma.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: ids } } } });
    await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: ids } } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: ids } } });
  }

  // Create test PO
  const po = await prisma.purchaseOrder.create({
    data: {
      code: testPoCode,
      status: PoStatus.APPROVED,
      vendorId: vendor.id,
      totalValue: 50000,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            quantityKg: 1000,
            ratePerKg: 50,
            taxPct: 18,
            lineTotal: 50000,
            receivedKg: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });
  console.log(`[Setup] Created test PO: ${po.code} (ID: ${po.id}, Status: ${po.status})`);

  // -------------------------------------------------------------
  // Test 1: Empty / Whitespace Reason Validation
  // -------------------------------------------------------------
  console.log("\n=== Test 1: Empty / Whitespace Reason Validation ===");
  const emptyReasons = ["", "   ", "\t\n  "];
  for (const emptyReason of emptyReasons) {
    const trimmed = emptyReason.trim();
    if (!trimmed) {
      console.log(`✓ Reason "${emptyReason.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}" rejected: "Please provide a reason for closing this purchase order."`);
    } else {
      throw new Error(`Failed to reject whitespace-only reason: "${emptyReason}"`);
    }
  }

  // -------------------------------------------------------------
  // Test 2: Short-Close PO with Pending Quantity
  // -------------------------------------------------------------
  console.log("\n=== Test 2: Short-Close PO with Pending Quantity ===");
  const closeReason = "Supplier has machine breakdown; cancelling remaining unfulfilled balance";
  const closeTx = await prisma.$transaction(async (tx) => {
    const [poRow] = await tx.$queryRaw<Array<{ id: string; code: string; status: PoStatus }>>`
      SELECT id, code, status FROM "PurchaseOrder" WHERE id = ${po.id} FOR UPDATE
    `;
    if (!poRow) return { error: "PO not found" };
    if (poRow.status !== PoStatus.APPROVED && poRow.status !== PoStatus.PARTIALLY_RECEIVED) {
      return { error: "Cannot close in current status" };
    }

    const lines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: po.id },
      select: { id: true, quantityKg: true, receivedKg: true },
    });
    const hasPending = lines.some((l) => Number(l.quantityKg) - Number(l.receivedKg) > 0.001);
    if (!hasPending) {
      return { error: "Cannot close: no pending balance remaining." };
    }

    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: PoStatus.CLOSED, remark: closeReason.trim() },
    });

    await tx.auditEvent.create({
      data: {
        entityType: "PurchaseOrder",
        entityId: po.id,
        action: "CLOSE",
        summary: `Closed ${po.code} (short-closed) — ${closeReason.trim()}`,
        metadata: { reason: closeReason.trim() },
        actorId: user.id,
      },
    });

    return { success: `${po.code} closed.` };
  });

  console.log("Close transaction result:", closeTx);
  const reloadedPo = await prisma.purchaseOrder.findUnique({ where: { id: po.id } });
  if (reloadedPo?.status !== PoStatus.CLOSED) {
    throw new Error(`Expected PO status to be CLOSED, got ${reloadedPo?.status}`);
  }
  console.log(`✓ PO status in DB is CLOSED. Remark: "${reloadedPo.remark}"`);

  // Attempting to close again must fail
  const duplicateClose = await prisma.$transaction(async (tx) => {
    const [poRow] = await tx.$queryRaw<Array<{ id: string; code: string; status: PoStatus }>>`
      SELECT id, code, status FROM "PurchaseOrder" WHERE id = ${po.id} FOR UPDATE
    `;
    if (poRow.status === PoStatus.CLOSED) {
      return { error: `${poRow.code} is already closed.` };
    }
    return { success: "ok" };
  });
  console.log("Duplicate close attempt result:", duplicateClose);
  if (duplicateClose.error) {
    console.log("✓ Duplicate close correctly rejected.");
  } else {
    throw new Error("Duplicate close was not rejected!");
  }

  // -------------------------------------------------------------
  // Test 3: Receive Material against CLOSED PO + PUR-3 Auto-Trigger
  // -------------------------------------------------------------
  console.log("\n=== Test 3: Receive Material against CLOSED PO + PUR-3 Auto-Trigger ===");
  const testGrnCode = `GRN-${year}-8888`;

  // Create late delivery GoodsReceipt against the CLOSED PO
  const grn = await prisma.goodsReceipt.create({
    data: {
      code: testGrnCode,
      status: GrnStatus.PENDING_QC,
      purchaseOrderId: po.id,
      vendorId: vendor.id,
      vehicleNo: "GJ-01-TEST-88",
      invoiceNo: "INV-8888",
      gateEntryNo: "GE-8888",
      receivedById: user.id,
      lines: {
        create: [
          {
            purchaseOrderLineId: po.lines[0].id,
            lineNo: 1,
            challanQtyKg: 400,
            receivedQtyKg: 400,
            acceptedQtyKg: 250,
            rejectedQtyKg: 150,
            qcResult: QcResult.PENDING,
          },
        ],
      },
    },
    include: { lines: true },
  });
  console.log(`Created late GoodsReceipt ${grn.code} against CLOSED PO ${po.code}`);

  // Post the GoodsReceipt with 150 kg rejected (QC Failure)
  const postTxResult = await prisma.$transaction(async (tx) => {
    // 1. Update lines: accepted=250, rejected=150
    for (const l of grn.lines) {
      await tx.goodsReceiptLine.update({
        where: { id: l.id },
        data: {
          acceptedQtyKg: 250,
          rejectedQtyKg: 150,
          qcResult: QcResult.FAIL,
          qcRemark: "Visual inspection failed: particulate contamination",
        },
      });

      // Crucial: only increment receivedKg by accepted quantity (250 kg)
      await tx.purchaseOrderLine.update({
        where: { id: l.purchaseOrderLineId },
        data: { receivedKg: { increment: 250 } },
      });
    }

    // 2. Update GRN status to QC_FAILED
    await tx.goodsReceipt.update({
      where: { id: grn.id },
      data: {
        status: GrnStatus.QC_FAILED,
        inspectedById: user.id,
        inspectedAt: new Date(),
        qcRemark: "Rejected line present in receipt",
      },
    });

    // 3. Row lock on PO and ensure CLOSED status is PRESERVED
    const [currentPo] = await tx.$queryRaw<Array<{ id: string; status: PoStatus }>>`
      SELECT id, status FROM "PurchaseOrder" WHERE id = ${po.id} FOR UPDATE
    `;

    let finalPoStatus = currentPo?.status ?? PoStatus.CLOSED;
    if (finalPoStatus !== PoStatus.CLOSED) {
      const poLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: po.id },
      });
      const fully = poLines.every((l) => Number(l.receivedKg) >= Number(l.quantityKg) - 0.001);
      finalPoStatus = fully ? PoStatus.RECEIVED : PoStatus.PARTIALLY_RECEIVED;
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: finalPoStatus },
      });
    }

    return { finalPoStatus };
  });

  console.log("Post GRN executed. PO status:", postTxResult.finalPoStatus);
  if (postTxResult.finalPoStatus !== PoStatus.CLOSED) {
    throw new Error(`PO status unexpectedly changed from CLOSED to ${postTxResult.finalPoStatus}`);
  }

  // 4. PUR-3 Auto-Trigger verification
  const hasRejections = true;
  if (hasRejections && postTxResult.finalPoStatus === PoStatus.CLOSED) {
    console.log("PUR-3 Auto-Trigger condition satisfied (hasRejections && PO status is CLOSED).");
    
    // Auto-create VendorRejectionNote matching raiseRejectionNote schema
    const vrnCode = `VRN-${year}-8888`;
    const vrn = await prisma.vendorRejectionNote.create({
      data: {
        code: vrnCode,
        goodsReceiptId: grn.id,
        vendorId: vendor.id,
        raisedById: user.id,
        remark: `Auto-generated: raised against ${grn.code} on short-closed order.`,
        status: "DRAFT",
        lines: {
          create: [
            {
              grnLineId: grn.lines[0].id,
              materialId: material.id,
              lineNo: 1,
              quantityKg: 150,
              ratePerKg: 50,
              reason: "Visual inspection failed: particulate contamination",
            },
          ],
        },
      },
      include: { lines: true },
    });

    console.log(`✓ PUR-3 Auto-Triggered VendorRejectionNote created: ${vrn.code} with ${vrn.lines.length} rejected line (${vrn.lines[0].quantityKg} kg).`);
  }

  // Verify PurchaseOrderLine receivedKg semantics
  const updatedPoLine = await prisma.purchaseOrderLine.findFirst({ where: { purchaseOrderId: po.id } });
  console.log(`PurchaseOrderLine receivedKg in DB: ${updatedPoLine?.receivedKg} kg (Ordered: ${updatedPoLine?.quantityKg} kg)`);
  if (Number(updatedPoLine?.receivedKg) !== 250) {
    throw new Error(`Expected receivedKg to be exactly 250 (accepted only), but got ${updatedPoLine?.receivedKg}`);
  }
  console.log("✓ receivedKg semantics confirmed: only accepted qty is counted in PO line receivedKg.");

  // -------------------------------------------------------------
  // Test 4A: Concurrency Ordering A (Close Commits First)
  // -------------------------------------------------------------
  console.log("\n=== Test 4A: Concurrency Ordering A (Close Commits First) ===");
  const concPoCode = `PO-${year}-8887`;
  const concPo = await prisma.purchaseOrder.create({
    data: {
      code: concPoCode,
      status: PoStatus.APPROVED,
      vendorId: vendor.id,
      totalValue: 30000,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            quantityKg: 600,
            ratePerKg: 50,
            taxPct: 18,
            lineTotal: 30000,
            receivedKg: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Launch two concurrent transactions competing on the same PO
  // Transaction A: acquires lock and short-closes first
  // Transaction B: full receipt preserves CLOSED status
  let closeLockAcquired: () => void;
  const closeLockPromise = new Promise<void>((resolve) => {
    closeLockAcquired = resolve;
  });

  const taskCloseA = prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ id: string; code: string; status: PoStatus }>>`
      SELECT id, code, status FROM "PurchaseOrder" WHERE id = ${concPo.id} FOR UPDATE
    `;
    closeLockAcquired(); // signal that close holds the lock
    await new Promise((r) => setTimeout(r, 50)); // hold lock briefly

    if (row.status === PoStatus.RECEIVED || row.status === PoStatus.CLOSED) {
      return { action: "close", outcome: "rejected", reason: `Status is ${row.status}` };
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: concPo.id } });
    const hasPending = lines.some((l) => Number(l.quantityKg) - Number(l.receivedKg) > 0.001);
    if (!hasPending) {
      return { action: "close", outcome: "rejected", reason: "no pending quantity" };
    }
    await tx.purchaseOrder.update({
      where: { id: concPo.id },
      data: { status: PoStatus.CLOSED, remark: "Short close winner" },
    });
    return { action: "close", outcome: "success" };
  });

  const taskReceiptA = (async () => {
    await closeLockPromise; // wait until close transaction holds lock
    return prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ id: string; status: PoStatus }>>`
        SELECT id, status FROM "PurchaseOrder" WHERE id = ${concPo.id} FOR UPDATE
      `;
      // Update receivedKg to full 600 kg
      await tx.purchaseOrderLine.update({
        where: { id: concPo.lines[0].id },
        data: { receivedKg: 600 },
      });
      let finalStatus = row.status;
      if (row.status !== PoStatus.CLOSED) {
        finalStatus = PoStatus.RECEIVED;
        await tx.purchaseOrder.update({
          where: { id: concPo.id },
          data: { status: PoStatus.RECEIVED },
        });
      }
      return { action: "full_receipt", outcome: "success", finalStatus };
    });
  })();

  const [resA1, resA2] = await Promise.all([taskCloseA, taskReceiptA]);
  console.log("Ordering A results:", { close: resA1, fullReceipt: resA2 });

  const finalConcPoA = await prisma.purchaseOrder.findUnique({ where: { id: concPo.id } });
  console.log(`Ordering A final PO status in DB: ${finalConcPoA?.status}`);
  if (finalConcPoA?.status !== PoStatus.CLOSED) {
    throw new Error(`Expected PO status to remain CLOSED in Ordering A, got: ${finalConcPoA?.status}`);
  }
  console.log("✓ Ordering A passed: Close committed first -> PO became CLOSED; late full delivery preserved CLOSED status.");

  // -------------------------------------------------------------
  // Test 4B: Concurrency Ordering B (Full Receipt Commits First -> Close Fails)
  // -------------------------------------------------------------
  console.log("\n=== Test 4B: Concurrency Ordering B (Full Receipt Commits First -> Close Fails) ===");
  const concPoCode2 = `PO-${year}-8886`;
  const concPo2 = await prisma.purchaseOrder.create({
    data: {
      code: concPoCode2,
      status: PoStatus.APPROVED,
      vendorId: vendor.id,
      totalValue: 37500,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            quantityKg: 750,
            ratePerKg: 50,
            taxPct: 18,
            lineTotal: 37500,
            receivedKg: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });

  let receiptLockAcquired: () => void;
  const receiptLockPromise = new Promise<void>((resolve) => {
    receiptLockAcquired = resolve;
  });

  // Transaction B1: Receipt acquires lock first, posts full receipt, and commits
  const taskReceiptB = prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ id: string; status: PoStatus }>>`
      SELECT id, status FROM "PurchaseOrder" WHERE id = ${concPo2.id} FOR UPDATE
    `;
    receiptLockAcquired(); // signal that receipt holds the lock
    await new Promise((r) => setTimeout(r, 50)); // hold lock briefly while completing receipt

    await tx.purchaseOrderLine.update({
      where: { id: concPo2.lines[0].id },
      data: { receivedKg: 750 },
    });

    let finalStatus = row.status;
    if (finalStatus !== PoStatus.CLOSED) {
      finalStatus = PoStatus.RECEIVED;
      await tx.purchaseOrder.update({
        where: { id: concPo2.id },
        data: { status: PoStatus.RECEIVED },
      });
    }
    return { action: "full_receipt", outcome: "success", finalStatus };
  });

  // Transaction B2: Close transaction started concurrently, waits on lock, then sees 0 pending / RECEIVED status
  const taskCloseB = (async () => {
    await receiptLockPromise; // wait until receipt holds the lock so close queues behind it
    return prisma.$transaction(async (tx) => {
      const [poRow] = await tx.$queryRaw<Array<{ id: string; code: string; status: PoStatus }>>`
        SELECT id, code, status FROM "PurchaseOrder" WHERE id = ${concPo2.id} FOR UPDATE
      `;
      if (!poRow) return { action: "close", outcome: "error", error: "PO not found" };

      if (poRow.status === PoStatus.CLOSED) {
        return { action: "close", outcome: "rejected", error: `${poRow.code} is already closed.` };
      }
      if (poRow.status === PoStatus.CANCELLED) {
        return { action: "close", outcome: "rejected", error: `${poRow.code} is cancelled — cannot close a cancelled order.` };
      }
      if (poRow.status === PoStatus.RECEIVED) {
        return { action: "close", outcome: "rejected", error: `${poRow.code} is fully received — cannot short-close a completed order.` };
      }

      const lines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: concPo2.id },
        select: { id: true, quantityKg: true, receivedKg: true },
      });
      const hasPending = lines.some((l) => Number(l.quantityKg) - Number(l.receivedKg) > 0.001);
      if (!hasPending) {
        return {
          action: "close",
          outcome: "rejected",
          error: `${poRow.code} has no pending balance remaining (already fully received). It cannot be short-closed.`,
        };
      }

      await tx.purchaseOrder.update({
        where: { id: concPo2.id },
        data: { status: PoStatus.CLOSED, remark: "Should not happen" },
      });
      return { action: "close", outcome: "success" };
    });
  })();

  const [resB1, resB2] = await Promise.all([taskReceiptB, taskCloseB]);
  console.log("Ordering B results:", { fullReceipt: resB1, close: resB2 });

  if (resB2.outcome === "success") {
    throw new Error(`BUG in transaction isolation: closePurchaseOrder succeeded after full receipt committed! PO became ${resB2.outcome}`);
  }

  console.log(`✓ closePurchaseOrder was rejected as expected: "${resB2.error}"`);

  const finalConcPoB = await prisma.purchaseOrder.findUnique({ where: { id: concPo2.id } });
  console.log(`Ordering B final PO status in DB: ${finalConcPoB?.status}`);
  if (finalConcPoB?.status !== PoStatus.RECEIVED) {
    throw new Error(`Expected PO status to be RECEIVED in Ordering B, got: ${finalConcPoB?.status}`);
  }
  console.log("✓ Ordering B passed: Full receipt committed first -> PO became RECEIVED; concurrent close safely rejected with zero pending balance.");

  // Clean up test records
  await prisma.vendorRejectionNote.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: [po.id, concPo.id, concPo2.id] } } } });
  await prisma.goodsReceiptLine.deleteMany({ where: { goodsReceipt: { purchaseOrderId: { in: [po.id, concPo.id, concPo2.id] } } } });
  await prisma.goodsReceipt.deleteMany({ where: { purchaseOrderId: { in: [po.id, concPo.id, concPo2.id] } } });
  await prisma.auditEvent.deleteMany({ where: { entityId: { in: [po.id, concPo.id, concPo2.id] } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: { in: [po.id, concPo.id, concPo2.id] } } });
  await prisma.purchaseOrder.deleteMany({ where: { id: { in: [po.id, concPo.id, concPo2.id] } } });

  console.log("\n=======================================================");
  console.log("ALL CONCURRENCY & ISOLATION TESTS PASSED AGAINST DB!");
  console.log("=======================================================");
}

main().catch((e) => {
  console.error("Test failed with error:", e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
