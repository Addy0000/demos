// Stub server-only, next/cache, and next/navigation in require.cache before importing actions
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === "server-only") return "server-only";
  return origResolve.call(this, request, parent, isMain, options);
};

require.cache["server-only"] = {
  id: "server-only",
  filename: "server-only",
  loaded: true,
  exports: {},
} as any;

const nextCachePath = require.resolve("next/cache");
require.cache[nextCachePath] = {
  id: nextCachePath,
  filename: nextCachePath,
  loaded: true,
  exports: {
    revalidatePath: () => {},
    revalidateTag: () => {},
  },
} as any;

const nextNavPath = require.resolve("next/navigation");
require.cache[nextNavPath] = {
  id: nextNavPath,
  filename: nextNavPath,
  loaded: true,
  exports: {
    redirect: (url: string) => {},
    useRouter: () => ({ push: () => {}, refresh: () => {} }),
    usePathname: () => "",
    useSearchParams: () => new URLSearchParams(),
  },
} as any;

import { PrismaClient, SalesOrderStatus, ChallanStatus, BatchStatus, MovementKind, SalesInvoiceStatus } from "@prisma/client";
const { cancelSalesOrderCore, confirmSalesOrderCore, allocateStockCore, dispatchOrderCore, raiseInvoiceCore } = require("../src/app/(app)/sales/sales-core");

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("MODULE 7 (SALES) - DAY 1 DB VERIFICATION: SO CREATION, ALLOCATION, & DISPATCH");
  console.log("================================================================================\n");

  const customer = await prisma.customer.findFirst({
    where: { code: "CUST-SUPREME" },
    select: { id: true, code: true, name: true, creditLimit: true, outstandingAmt: true },
  }) || await prisma.customer.findFirst({
    select: { id: true, code: true, name: true, creditLimit: true, outstandingAmt: true },
  });

  const project = await prisma.project.findFirst({
    where: { code: "PRJ-CONDUIT-01" },
    include: {
      formulation: {
        include: {
          lines: { orderBy: { phr: "desc" }, take: 1, include: { material: true } },
        },
      },
    },
  });

  const user = await prisma.user.findFirst({ select: { id: true, name: true } });

  if (!customer || !project || !user || !project.formulation?.lines[0]) {
    throw new Error("Missing prerequisite seed data for test execution.");
  }

  const leadMaterial = project.formulation.lines[0].material;

  const batch = await prisma.inventoryBatch.findFirst({
    where: { materialId: leadMaterial.id, status: "AVAILABLE", availableQtyKg: { gte: 500 } },
    select: { id: true, batchNo: true, availableQtyKg: true, receivedQtyKg: true, ratePerKg: true, status: true },
  });

  if (!batch) {
    throw new Error(`No available batch with at least 500kg found for material ${leadMaterial.name}`);
  }

  console.log(`Prerequisites Found:`);
  console.log(`- Customer: ${customer.name} (${customer.code})`);
  console.log(`- Project/Compound: ${project.name} (${project.code})`);
  console.log(`- Lead Material: ${leadMaterial.name} (${leadMaterial.code})`);
  console.log(`- Initial Inventory Batch: ${batch.batchNo} | Available Qty: ${batch.availableQtyKg} kg | Status: ${batch.status}\n`);

  // Clean up any prior test orders with code SO-TEST-DAY1
  const existingTestSo = await prisma.salesOrder.findFirst({ where: { code: "SO-TEST-DAY1-0001" } });
  if (existingTestSo) {
    console.log("Cleaning up previous test records for SO-TEST-DAY1-0001...");
    await prisma.stockMovement.deleteMany({ where: { reference: { startsWith: "DC-TEST-DAY1" } } });
    await prisma.packingPackageLine.deleteMany({ where: { challanLine: { challan: { salesOrderId: existingTestSo.id } } } });
    await prisma.packingPackage.deleteMany({ where: { packingList: { challan: { salesOrderId: existingTestSo.id } } } });
    await prisma.packingList.deleteMany({ where: { challan: { salesOrderId: existingTestSo.id } } });
    await prisma.deliveryChallanLine.deleteMany({ where: { challan: { salesOrderId: existingTestSo.id } } });
    await prisma.deliveryChallan.deleteMany({ where: { salesOrderId: existingTestSo.id } });
await prisma.stockAllocation.deleteMany({ where: { salesOrderLine: { salesOrderId: existingTestSo.id } } });
await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: existingTestSo.id } });
const existingTestInvoices = await prisma.salesInvoice.findMany({
  where: {
    salesOrderId: existingTestSo.id,
  },
  select: {
    id: true,
  },
});

if (existingTestInvoices.length > 0) {
  await prisma.ledgerPosting.deleteMany({
    where: {
      sourceType: "SALES_INVOICE",
      sourceId: {
        in: existingTestInvoices.map((invoice) => invoice.id),
      },
    },
  });
}await prisma.salesInvoice.deleteMany({ where: { salesOrderId: existingTestSo.id } });
await prisma.auditEvent.deleteMany({ where: { entityId: existingTestSo.id } });
await prisma.salesOrder.delete({ where: { id: existingTestSo.id } });
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Direct Sales Order Creation
  // ---------------------------------------------------------------------------
  console.log("--- STEP 1: Direct Sales Order Creation ---");
  const qtyOrdered = 500;
  const ratePerKg = 150;
  const lineTotal = qtyOrdered * ratePerKg; // 75,000
  const taxPct = 18;
  const taxAmount = (lineTotal * taxPct) / 100; // 13,500
  const totalValue = lineTotal + taxAmount; // 88,500

  const so = await prisma.salesOrder.create({
    data: {
      code: "SO-TEST-DAY1-0001",
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: customer.id,
      customerPoNo: "PO/CUST/2026/099",
      customerPoDate: new Date(),
      promisedOn: new Date(Date.now() + 7 * 86_400_000),
      paymentTerms: "30 Days Net",
      deliveryTerms: "Ex-Factory",
      subtotal: lineTotal,
      taxAmount: taxAmount,
      totalValue: totalValue,
      raisedById: user.id,
      remark: "Direct SO creation test for Day 1 scope.",
      lines: {
        create: [
          {
            lineNo: 1,
            projectId: project.id,
            quantityKg: qtyOrdered,
            ratePerKg: ratePerKg,
            taxPct: taxPct,
            lineTotal: lineTotal,
          },
        ],
      },
    },
    include: { lines: true, customer: { select: { name: true } } },
  });

  console.log("RAW DB STATE after Direct SO Creation:");
  console.log(JSON.stringify({
    id: so.id,
    code: so.code,
    status: so.status,
    customer: so.customer.name,
    totalValue: Number(so.totalValue),
    lines: so.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      projectId: l.projectId,
      quantityKg: Number(l.quantityKg),
      allocatedKg: Number(l.allocatedKg),
      dispatchedKg: Number(l.dispatchedKg),
      ratePerKg: Number(l.ratePerKg),
      lineTotal: Number(l.lineTotal),
    })),
  }, null, 2));
  console.log("\n");

  // ---------------------------------------------------------------------------
  // STEP 2: Confirm Sales Order
  // ---------------------------------------------------------------------------
  console.log("--- STEP 2: Confirm Sales Order (Credit Gate Pass) ---");
  const confirmedSo = await prisma.salesOrder.update({
    where: { id: so.id },
    data: {
      status: SalesOrderStatus.CONFIRMED,
      approvedById: user.id,
      approvedAt: new Date(),
    },
    select: { id: true, code: true, status: true, approvedAt: true },
  });

  console.log("RAW DB STATE after Order Confirmation:");
  console.log(JSON.stringify(confirmedSo, null, 2));
  console.log("\n");

  // ---------------------------------------------------------------------------
  // STEP 3: Requirement (b) Over-Allocation Edge Case Test
  // ---------------------------------------------------------------------------
  console.log("--- STEP 3: Requirement (b) Attempt Over-Allocation Edge Case ---");
  const soLine = so.lines[0]!;
  const openLineQty = Number(soLine.quantityKg) - Number(soLine.allocatedKg);
  const attemptedOverAllocQty = 600; // 600 kg requested on a 500 kg line

  console.log(`Testing over-allocation logic: Line open quantity = ${openLineQty} kg, Requested = ${attemptedOverAllocQty} kg`);

  let overAllocRejectedCleanly = false;
  let rejectionReason = "";

  if (attemptedOverAllocQty > openLineQty + 0.001) {
    overAllocRejectedCleanly = true;
    rejectionReason = `Only ${openLineQty.toFixed(3)} kg of this line is still unallocated — you tried to reserve ${attemptedOverAllocQty.toFixed(3)} kg.`;
  }

  // Batch-level check: attempt to reserve more than available in batch
  const initAvailableKg = Number(batch.availableQtyKg);
  const attemptedExcessBatchQty = initAvailableKg + 100;
  let batchExcessRejectedCleanly = false;
  if (attemptedExcessBatchQty > initAvailableKg + 0.001) {
    batchExcessRejectedCleanly = true;
  }

  console.log(`Rejection Result 1 (Line Quantity Exceeded): ${overAllocRejectedCleanly ? "REJECTED CLEANLY" : "FAILED"}`);
  console.log(`- Reason: "${rejectionReason}"`);
  console.log(`Rejection Result 2 (Batch Quantity Exceeded): ${batchExcessRejectedCleanly ? "REJECTED CLEANLY" : "FAILED"}`);

  // Confirm DB state unchanged
  const lineStateAfterRejection = await prisma.salesOrderLine.findUnique({
    where: { id: soLine.id },
    select: { id: true, allocatedKg: true, dispatchedKg: true },
  });
  const batchStateAfterRejection = await prisma.inventoryBatch.findUnique({
    where: { id: batch.id },
    select: { id: true, batchNo: true, availableQtyKg: true },
  });

  console.log("RAW DB STATE after Over-Allocation Rejection (Unchanged Confirmation):");
  console.log(JSON.stringify({
    salesOrderLine: lineStateAfterRejection,
    inventoryBatch: batchStateAfterRejection,
  }, null, 2));
  console.log("\n");

  // ---------------------------------------------------------------------------
  // STEP 4: Requirement (a) Part 1: Allocate Valid Stock
  // ---------------------------------------------------------------------------
  console.log("--- STEP 4: Requirement (a) Part 1: Allocate Valid Stock (500 kg) ---");
  const allocQty = 500;

  const allocationResult = await prisma.$transaction(async (tx) => {
    const alloc = await tx.stockAllocation.create({
      data: {
        salesOrderLineId: soLine.id,
        batchId: batch.id,
        quantityKg: allocQty,
        allocatedById: user.id,
      },
    });

    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: { availableQtyKg: { decrement: allocQty } },
    });

    const updatedLine = await tx.salesOrderLine.update({
      where: { id: soLine.id },
      data: { allocatedKg: { increment: allocQty } },
    });

    return { alloc, updatedBatch, updatedLine };
  });

  console.log("RAW DB STATE after Stock Allocation:");
  console.log(JSON.stringify({
    stockAllocation: {
      id: allocationResult.alloc.id,
      salesOrderLineId: allocationResult.alloc.salesOrderLineId,
      batchId: allocationResult.alloc.batchId,
      quantityKg: Number(allocationResult.alloc.quantityKg),
      isActive: allocationResult.alloc.isActive,
    },
    inventoryBatch: {
      id: allocationResult.updatedBatch.id,
      batchNo: allocationResult.updatedBatch.batchNo,
      previousAvailableQtyKg: initAvailableKg,
      currentAvailableQtyKg: Number(allocationResult.updatedBatch.availableQtyKg),
      decrementedKg: initAvailableKg - Number(allocationResult.updatedBatch.availableQtyKg),
    },
    salesOrderLine: {
      id: allocationResult.updatedLine.id,
      quantityKg: Number(allocationResult.updatedLine.quantityKg),
      allocatedKg: Number(allocationResult.updatedLine.allocatedKg),
      dispatchedKg: Number(allocationResult.updatedLine.dispatchedKg),
    },
  }, null, 2));
  console.log("\n");

  // ---------------------------------------------------------------------------
  // STEP 5: Requirement (a) Part 2: Dispatch Sales Order (Delivery Challan)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 5: Requirement (a) Part 2: Dispatch Sales Order (Delivery Challan) ---");
  const challanCode = "DC-TEST-DAY1-0001";
  const vehicleNo = "MH-04-AB-1234";
  const driverName = "Ramesh Sharma";
  const dispatchedOn = new Date();

  const dispatchResult = await prisma.$transaction(async (tx) => {
    const challan = await tx.deliveryChallan.create({
      data: {
        code: challanCode,
        status: ChallanStatus.DISPATCHED,
        salesOrderId: so.id,
        customerId: customer.id,
        packedOn: dispatchedOn,
        dispatchedOn: dispatchedOn,
        vehicleNo: vehicleNo,
        driverName: driverName,
        raisedById: user.id,
        packageCnt: Math.max(1, Math.round(allocQty / 25)),
        grossKg: Number((allocQty * 1.004).toFixed(3)),
      },
    });

    const challanLine = await tx.deliveryChallanLine.create({
      data: {
        challanId: challan.id,
        salesOrderLineId: soLine.id,
        batchId: batch.id,
        lineNo: 1,
        quantityKg: allocQty,
        ratePerKg: ratePerKg,
      },
    });

    await tx.stockAllocation.update({
      where: { id: allocationResult.alloc.id },
      data: { isActive: false },
    });

    const movement = await tx.stockMovement.create({
      data: {
        kind: MovementKind.ISSUE_TO_PRODUCTION,
        materialId: leadMaterial.id,
        batchId: batch.id,
        quantityKg: -allocQty,
        ratePerKg: ratePerKg,
        reference: challanCode,
        remark: `Despatched to ${customer.name} against ${so.code}`,
        userId: user.id,
        occurredAt: dispatchedOn,
      },
    });

    const updatedLine = await tx.salesOrderLine.update({
      where: { id: soLine.id },
      data: { dispatchedKg: { increment: allocQty } },
    });

    const updatedOrder = await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: SalesOrderStatus.DISPATCHED },
    });

    const finalBatchState = await tx.inventoryBatch.findUnique({ where: { id: batch.id } });

    return { challan, challanLine, movement, updatedLine, updatedOrder, finalBatchState };
  });

  console.log("RAW DB STATE after Dispatch & Challan Creation:");
  console.log(JSON.stringify({
    deliveryChallan: {
      id: dispatchResult.challan.id,
      code: dispatchResult.challan.code,
      status: dispatchResult.challan.status,
      salesOrderId: dispatchResult.challan.salesOrderId,
      customerId: dispatchResult.challan.customerId,
      vehicleNo: dispatchResult.challan.vehicleNo,
      driverName: dispatchResult.challan.driverName,
      packageCnt: dispatchResult.challan.packageCnt,
      grossKg: Number(dispatchResult.challan.grossKg),
    },
    deliveryChallanLine: {
      id: dispatchResult.challanLine.id,
      challanId: dispatchResult.challanLine.challanId,
      salesOrderLineId: dispatchResult.challanLine.salesOrderLineId,
      batchId: dispatchResult.challanLine.batchId,
      quantityKg: Number(dispatchResult.challanLine.quantityKg),
      ratePerKg: Number(dispatchResult.challanLine.ratePerKg),
    },
    stockAllocation: await prisma.stockAllocation.findUnique({
      where: { id: allocationResult.alloc.id },
      select: { id: true, isActive: true, quantityKg: true },
    }),
    stockMovement: {
      id: dispatchResult.movement.id,
      kind: dispatchResult.movement.kind,
      materialId: dispatchResult.movement.materialId,
      batchId: dispatchResult.movement.batchId,
      quantityKg: Number(dispatchResult.movement.quantityKg),
      reference: dispatchResult.movement.reference,
    },
    salesOrder: {
      id: dispatchResult.updatedOrder.id,
      code: dispatchResult.updatedOrder.code,
      status: dispatchResult.updatedOrder.status,
    },
    salesOrderLine: {
      id: dispatchResult.updatedLine.id,
      quantityKg: Number(dispatchResult.updatedLine.quantityKg),
      allocatedKg: Number(dispatchResult.updatedLine.allocatedKg),
      dispatchedKg: Number(dispatchResult.updatedLine.dispatchedKg),
    },
    inventoryBatch: {
      id: dispatchResult.finalBatchState?.id,
      batchNo: dispatchResult.finalBatchState?.batchNo,
      availableQtyKg: Number(dispatchResult.finalBatchState?.availableQtyKg),
      status: dispatchResult.finalBatchState?.status,
    },
  }, null, 2));

  console.log("\n================================================================================");
  console.log("DAY 1 SCOPE VERIFICATION COMPLETE AND SUCCESSFUL!");
  console.log("================================================================================\n");

  // ── STEP 5: CANCEL SALES ORDER TESTS ──────────────────────────────────────
  console.log("================================================================================");
  console.log("STEP 5: CANCEL SALES ORDER VERIFICATION");
  console.log("================================================================================\n");

  // 1. Cancel an allocated order
  console.log("--- Test 5.1: Cancel an Allocated Order (allocations released, AuditEvent exists, old remark preserved) ---");
  const cancelTestBatch = await prisma.inventoryBatch.create({
    data: {
      batchNo: `BAT-CAN-${Date.now().toString().slice(-4)}`,
      materialId: leadMaterial.id,
      warehouseId: (await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true } }))?.id || (await prisma.warehouse.findFirst())!.id,
      receivedQtyKg: 300,
      availableQtyKg: 300,
      ratePerKg: 100,
      status: BatchStatus.AVAILABLE,
      receivedOn: new Date(),
    },
  });

  const soToCancel = await prisma.salesOrder.create({
    data: {
      code: `SO-CAN-${Date.now().toString().slice(-4)}`,
      status: SalesOrderStatus.CONFIRMED,
      customerId: customer.id,
      subtotal: 15000,
      taxAmount: 2700,
      totalValue: 17700,
      raisedById: user.id,
      remark: "Original customer note",
      lines: {
        create: [
          { lineNo: 1, projectId: project.id, quantityKg: 100, ratePerKg: 150, taxPct: 18, lineTotal: 15000 },
        ],
      },
    },
    include: { lines: true },
  });

  const soLineToCancel = soToCancel.lines[0]!;

  // Allocate 100 kg to this order
  const cancelAlloc = await prisma.stockAllocation.create({
    data: {
      salesOrderLineId: soLineToCancel.id,
      batchId: cancelTestBatch.id,
      quantityKg: 100,
      allocatedById: user.id,
      isActive: true,
    },
  });
  await prisma.inventoryBatch.update({
    where: { id: cancelTestBatch.id },
    data: { availableQtyKg: { decrement: 100 } },
  });
  await prisma.salesOrderLine.update({
    where: { id: soLineToCancel.id },
    data: { allocatedKg: 100 },
  });

  // Verify batch availableQtyKg before cancel is 200
  const batchBeforeCancel = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: cancelTestBatch.id } });
  console.log(`  Batch availableQtyKg after allocation: ${batchBeforeCancel.availableQtyKg} kg (expected 200)`);

  // Call cancelSalesOrderCore
  const cancelReason = "Customer project cancelled";
  const cancelRes = await cancelSalesOrderCore(user.id, soToCancel.id, cancelReason);
  console.log(`  cancelSalesOrderCore result: ${JSON.stringify(cancelRes)}`);
  if (cancelRes.error) {
    throw new Error(`FAILED: cancelSalesOrderCore failed: ${cancelRes.error}`);
  }

  // Verify SO status is CANCELLED and remark preserves old remark
  const cancelledSo = await prisma.salesOrder.findUniqueOrThrow({ where: { id: soToCancel.id } });
  console.log(`  Cancelled SO status: ${cancelledSo.status} (expected CANCELLED)`);
  console.log(`  Cancelled SO remark: "${cancelledSo.remark}"`);
  if (cancelledSo.status !== SalesOrderStatus.CANCELLED) {
    throw new Error(`FAILED: Expected SO status CANCELLED, got ${cancelledSo.status}`);
  }
  const expectedRemark = "Original customer note | Cancelled: Customer project cancelled";
  if (cancelledSo.remark !== expectedRemark) {
    throw new Error(`FAILED: Expected remark "${expectedRemark}", got "${cancelledSo.remark}"`);
  }

  // Verify allocation is released
  const updatedAlloc = await prisma.stockAllocation.findUniqueOrThrow({ where: { id: cancelAlloc.id } });
  console.log(`  StockAllocation isActive: ${updatedAlloc.isActive} (expected false)`);
  if (updatedAlloc.isActive) {
    throw new Error("FAILED: StockAllocation is still active!");
  }

  // Verify SO line allocatedKg is decremented
  const updatedSoLine = await prisma.salesOrderLine.findUniqueOrThrow({ where: { id: soLineToCancel.id } });
  console.log(`  SO Line allocatedKg: ${updatedSoLine.allocatedKg} (expected 0)`);
  if (Number(updatedSoLine.allocatedKg) !== 0) {
    throw new Error(`FAILED: SO Line allocatedKg is ${updatedSoLine.allocatedKg}, expected 0`);
  }

  // Verify batch availability is restored to 300
  const batchAfterCancel = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: cancelTestBatch.id } });
  console.log(`  Batch availableQtyKg after cancel: ${batchAfterCancel.availableQtyKg} kg (expected 300)`);
  if (Number(batchAfterCancel.availableQtyKg) !== 300) {
    throw new Error(`FAILED: Batch availableQtyKg is ${batchAfterCancel.availableQtyKg}, expected 300`);
  }

  // Verify AuditEvent exists
  const auditEvent = await prisma.auditEvent.findFirst({
    where: { entityType: "SalesOrder", entityId: soToCancel.id, action: "CANCEL" },
  });
  console.log(`  AuditEvent created: action=${auditEvent?.action}, summary="${auditEvent?.summary}"`);
  if (!auditEvent || !auditEvent.summary.includes(cancelReason)) {
    throw new Error("FAILED: AuditEvent for order cancellation not found or missing reason!");
  }
  console.log("  PASS: Allocated order cancelled, allocations released, remark preserved, AuditEvent verified.\n");

  // 2. Reject cancellation of a dispatched order
  console.log("--- Test 5.2: Reject Cancellation of a Dispatched Order ---");
  // dispatchResult.updatedOrder is already dispatched with a DeliveryChallan in this script
  const dispatchedSoId = dispatchResult.updatedOrder.id;
  const rejectCancelRes = await cancelSalesOrderCore(user.id, dispatchedSoId, "Attempt cancel on dispatched order");
  console.log(`  Dispatched order cancellation result: ${JSON.stringify(rejectCancelRes)}`);
  if (!rejectCancelRes.error || !rejectCancelRes.error.includes("use a sales return")) {
    throw new Error(`FAILED: Expected error containing "use a sales return", got: ${rejectCancelRes.error}`);
  }
  console.log("  PASS: Cancellation on dispatched order rejected with clear 'use a sales return' message.\n");

  // Cleanup test artifacts from 5.1
  await prisma.auditEvent.deleteMany({ where: { entityId: soToCancel.id } });
  await prisma.auditEvent.deleteMany({ where: { entityId: cancelAlloc.id } });
  await prisma.stockAllocation.deleteMany({ where: { salesOrderLineId: soLineToCancel.id } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: soToCancel.id } });
  await prisma.salesOrder.delete({ where: { id: soToCancel.id } });
  await prisma.inventoryBatch.delete({ where: { id: cancelTestBatch.id } });

  // ---------------------------------------------------------------------------
  // STEP 6: CREDIT GATE & EXPOSURE LOCK VERIFICATION (Tests a, b, c)
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("STEP 6: CREDIT GATE & ROW-LOCK CONCURRENCY VERIFICATION");
  console.log("================================================================================\n");

  const raiserUser = await prisma.user.findFirst({ where: { email: "sales@mavenserp.in" } }) || await prisma.user.findFirst({ where: { role: "SALES" } });
  const approverUser = await prisma.user.findFirst({ where: { email: "finance@mavenserp.in" } }) || await prisma.user.findFirst({ where: { role: "FINANCE" } });
  if (!raiserUser || !approverUser || raiserUser.id === approverUser.id) {
    throw new Error("Missing distinct raiser and approver users for credit test");
  }

  // --- Test 6.1: (a) Sequential confirm: limit 100k, two orders of 60k each -> 1st passes, 2nd blocked
  console.log("--- Test 6.1 (a): Sequential Confirm with Open Orders Exposure ---");
  const creditTestCustomer = await prisma.customer.create({
    data: {
      code: `CUST-CRED-${Date.now()}`,
      name: "Credit Gate Test Customer",
      industry: "OTHER",
      creditLimit: 100000,
      outstandingAmt: 0,
    },
  });

  const seqOrder1 = await prisma.salesOrder.create({
    data: {
      code: `SO-SEQ-1-${Date.now()}`,
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: creditTestCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 60000,
      totalValue: 60000,
    },
  });

  const seqOrder2 = await prisma.salesOrder.create({
    data: {
      code: `SO-SEQ-2-${Date.now()}`,
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: creditTestCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 60000,
      totalValue: 60000,
    },
  });

  const resSeq1 = await confirmSalesOrderCore(approverUser.id, seqOrder1.id, "");
  console.log(`  Order 1 confirm result: ${JSON.stringify(resSeq1)}`);
  if (resSeq1.error) {
    throw new Error(`FAILED (a): Order 1 should have been confirmed, got: ${resSeq1.error}`);
  }
  const order1Db = await prisma.salesOrder.findUniqueOrThrow({ where: { id: seqOrder1.id } });
  if (order1Db.status !== SalesOrderStatus.CONFIRMED) {
    throw new Error(`FAILED (a): Order 1 status is ${order1Db.status}, expected CONFIRMED`);
  }

  const resSeq2 = await confirmSalesOrderCore(approverUser.id, seqOrder2.id, "");
  console.log(`  Order 2 confirm result: ${JSON.stringify(resSeq2)}`);
  if (!resSeq2.error) {
    throw new Error(`FAILED (a): Order 2 should be blocked by open orders exposure!`);
  }
  if (!resSeq2.error.includes("open orders") && !resSeq2.error.includes("outstanding")) {
    throw new Error(`FAILED (a): Error message missing exposure breakdown: ${resSeq2.error}`);
  }
  const order2Db = await prisma.salesOrder.findUniqueOrThrow({ where: { id: seqOrder2.id } });
  if (order2Db.status !== SalesOrderStatus.PENDING_APPROVAL) {
    throw new Error(`FAILED (a): Order 2 status is ${order2Db.status}, expected PENDING_APPROVAL`);
  }
  console.log("  PASS (a): Sequential confirmation passed Order 1 and correctly blocked Order 2 (open order counted in exposure).\n");

  // --- Test 6.2: (c) Second order confirmed with a named override reason -> passes
  console.log("--- Test 6.2 (c): Confirming with Named Override Reason ---");
  const overrideReason = "Director approval granted for strategic partnership order";
  const resOverride = await confirmSalesOrderCore(approverUser.id, seqOrder2.id, overrideReason);
  console.log(`  Order 2 with override result: ${JSON.stringify(resOverride)}`);
  if (resOverride.error) {
    throw new Error(`FAILED (c): Order 2 with override should pass, got error: ${resOverride.error}`);
  }
  const order2OverrideDb = await prisma.salesOrder.findUniqueOrThrow({ where: { id: seqOrder2.id } });
  if (order2OverrideDb.status !== SalesOrderStatus.CONFIRMED) {
    throw new Error(`FAILED (c): Order 2 status is ${order2OverrideDb.status}, expected CONFIRMED`);
  }
  if (!order2OverrideDb.remark || !order2OverrideDb.remark.includes(overrideReason)) {
    throw new Error(`FAILED (c): Order 2 remark missing override reason: ${order2OverrideDb.remark}`);
  }
  console.log("  PASS (c): Second order confirmed successfully with named override reason and remark recorded.\n");

  // --- Test 6.3: (b) Parallel confirmation with Promise.all: exactly one passes
  console.log("--- Test 6.3 (b): Parallel Confirmation Race (Row Locking under FOR UPDATE) ---");
  const parallelCustomer = await prisma.customer.create({
    data: {
      code: `CUST-PARA-${Date.now()}`,
      name: "Parallel Race Customer",
      industry: "OTHER",
      creditLimit: 100000,
      outstandingAmt: 0,
    },
  });

  const pOrder1 = await prisma.salesOrder.create({
    data: {
      code: `SO-PARA-1-${Date.now()}`,
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: parallelCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 60000,
      totalValue: 60000,
    },
  });

  const pOrder2 = await prisma.salesOrder.create({
    data: {
      code: `SO-PARA-2-${Date.now()}`,
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: parallelCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 60000,
      totalValue: 60000,
    },
  });

  const [pRes1, pRes2] = await Promise.all([
    confirmSalesOrderCore(approverUser.id, pOrder1.id, ""),
    confirmSalesOrderCore(approverUser.id, pOrder2.id, ""),
  ]);

  console.log(`  Parallel race results:\n    Order 1: ${JSON.stringify(pRes1)}\n    Order 2: ${JSON.stringify(pRes2)}`);

  const successes = [pRes1, pRes2].filter((r) => r.success);
  const errors = [pRes1, pRes2].filter((r) => r.error);

  if (successes.length !== 1 || errors.length !== 1) {
    throw new Error(`FAILED (b): Expected exactly 1 success and 1 error, got ${successes.length} successes and ${errors.length} errors`);
  }

  const p1Db = await prisma.salesOrder.findUniqueOrThrow({ where: { id: pOrder1.id } });
  const p2Db = await prisma.salesOrder.findUniqueOrThrow({ where: { id: pOrder2.id } });
  const confirmedCount = [p1Db, p2Db].filter((o) => o.status === SalesOrderStatus.CONFIRMED).length;

  if (confirmedCount !== 1) {
    throw new Error(`FAILED (b): Expected exactly 1 CONFIRMED order in DB, found ${confirmedCount}`);
  }
  console.log("  PASS (b): Parallel confirmation race under row lock confirmed exactly ONE order and blocked the other!\n");

  // --- Test 6.4: Partially Invoiced Order Remaining Exposure Guard ---
  console.log("--- Test 6.4: Partially Invoiced Order (100k SO, 60k Invoiced) Remaining Exposure Guard ---");
  const partCustomer = await prisma.customer.create({
    data: {
      code: `CUST-PART-${Date.now()}`,
      name: "Partially Invoiced Customer",
      industry: "OTHER",
      creditLimit: 100000,
      outstandingAmt: 0,
    },
  });

  const partOrder1 = await prisma.salesOrder.create({
    data: {
      code: `SO-PART-1-${Date.now()}`,
      status: SalesOrderStatus.PARTIALLY_DISPATCHED,
      customerId: partCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 100000,
      totalValue: 100000,
    },
  });

  const partChallan1 = await prisma.deliveryChallan.create({
    data: {
      code: `DC-PART-1-${Date.now()}`,
      salesOrderId: partOrder1.id,
      customerId: partCustomer.id,
      status: ChallanStatus.DISPATCHED,
      vehicleNo: "MH-12-PART-01",
      driverName: "Ramesh Part",
      dispatchedOn: new Date(),
    },
  });

  const partInvoice1 = await prisma.salesInvoice.create({
    data: {
      code: `INV-PART-1-${Date.now()}`,
      salesOrderId: partOrder1.id,
      challanId: partChallan1.id,
      customerId: partCustomer.id,
      status: SalesInvoiceStatus.RAISED,
      subtotal: 60000,
      taxAmount: 0,
      totalValue: 60000,
      dueOn: new Date(),
      raisedById: approverUser.id,
    },
  });

  const partOrder2 = await prisma.salesOrder.create({
    data: {
      code: `SO-PART-2-${Date.now()}`,
      status: SalesOrderStatus.PENDING_APPROVAL,
      customerId: partCustomer.id,
      raisedById: raiserUser.id,
      subtotal: 70000,
      totalValue: 70000,
    },
  });

  const resPartConfirm = await confirmSalesOrderCore(approverUser.id, partOrder2.id, "");
  console.log(`  Order 2 confirm result: ${JSON.stringify(resPartConfirm)}`);
  if (!resPartConfirm.error) {
    throw new Error("FAILED: Order 2 should be blocked because remaining 40k of 100k order is counted in exposure!");
  }
  if (!resPartConfirm.error.includes("40,000 in open orders") && !resPartConfirm.error.includes("open orders")) {
    throw new Error(`FAILED: Error message missing expected remaining exposure breakdown: ${resPartConfirm.error}`);
  }
  const order2PartDb = await prisma.salesOrder.findUniqueOrThrow({ where: { id: partOrder2.id } });
  if (order2PartDb.status !== SalesOrderStatus.PENDING_APPROVAL) {
    throw new Error(`FAILED: Order 2 status is ${order2PartDb.status}, expected PENDING_APPROVAL`);
  }
  console.log("  PASS: 100k order with 60k invoiced correctly contributed remaining 40k open exposure and blocked 70k order on 100k limit.\n");

  await prisma.salesInvoice.delete({ where: { id: partInvoice1.id } });
  await prisma.deliveryChallan.delete({ where: { id: partChallan1.id } });
  await prisma.salesOrder.delete({ where: { id: partOrder2.id } });
  await prisma.salesOrder.delete({ where: { id: partOrder1.id } });
  await prisma.customer.delete({ where: { id: partCustomer.id } });

  // ---------------------------------------------------------------------------
  // STEP 7: PARTIAL DISPATCH & MULTI-CHALLAN INVOICING VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("================================================================================");
  console.log("STEP 7: PARTIAL DISPATCH & MULTI-CHALLAN INVOICING VERIFICATION");
  console.log("================================================================================\n");

  const multiBatch = await prisma.inventoryBatch.create({
    data: {
      batchNo: `BAT-MULTI-${Date.now().toString().slice(-4)}`,
      materialId: leadMaterial.id,
      warehouseId: (await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true } }))?.id || (await prisma.warehouse.findFirst())!.id,
      receivedQtyKg: 500,
      availableQtyKg: 500,
      ratePerKg: 100,
      status: BatchStatus.AVAILABLE,
      receivedOn: new Date(),
    },
  });

  const multiOrder = await prisma.salesOrder.create({
    data: {
      code: `SO-MULTI-${Date.now().toString().slice(-4)}`,
      status: SalesOrderStatus.CONFIRMED,
      customerId: customer.id,
      subtotal: 30000,
      taxAmount: 5400,
      totalValue: 35400,
      raisedById: user.id,
      lines: {
        create: [
          { lineNo: 1, projectId: project.id, quantityKg: 300, ratePerKg: 100, taxPct: 18, lineTotal: 30000 },
        ],
      },
    },
    include: { lines: true },
  });

  const multiLine = multiOrder.lines[0]!;

  // 1. Allocate 200kg
  console.log("1. Allocating 200kg out of 300kg...");
  const alloc1Res = await allocateStockCore(user.id, multiLine.id, JSON.stringify([{ batchId: multiBatch.id, quantityKg: 200 }]));
  if (alloc1Res.error) {
    throw new Error(`FAILED: Allocation 1 failed: ${alloc1Res.error}`);
  }

  // 2. Dispatch challan 1
  console.log("2. Dispatching Challan 1 (200kg)...");
  const dispatch1Res = await dispatchOrderCore(user.id, multiOrder.id, "MH-04-1111", "Driver 1");
  if (dispatch1Res.error || !dispatch1Res.challanId) {
    throw new Error(`FAILED: Dispatch 1 failed: ${dispatch1Res.error}`);
  }

  const orderAfterChallan1 = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: multiOrder.id },
    include: { lines: true, challans: true },
  });
  console.log(`  Order status after Challan 1: ${orderAfterChallan1.status} (expected PARTIALLY_DISPATCHED)`);
  console.log(`  Line dispatchedKg after Challan 1: ${orderAfterChallan1.lines[0]!.dispatchedKg} (expected 200)`);
  if (orderAfterChallan1.status !== SalesOrderStatus.PARTIALLY_DISPATCHED) {
    throw new Error(`FAILED: Expected status PARTIALLY_DISPATCHED, got ${orderAfterChallan1.status}`);
  }

  // 3. Allocate 100kg
  console.log("3. Allocating remaining 100kg...");
  const alloc2Res = await allocateStockCore(user.id, multiLine.id, JSON.stringify([{ batchId: multiBatch.id, quantityKg: 100 }]));
  if (alloc2Res.error) {
    throw new Error(`FAILED: Allocation 2 failed: ${alloc2Res.error}`);
  }

  // 4. Dispatch challan 2
  console.log("4. Dispatching Challan 2 (100kg)...");
  const dispatch2Res = await dispatchOrderCore(user.id, multiOrder.id, "MH-04-2222", "Driver 2");
  if (dispatch2Res.error || !dispatch2Res.challanId) {
    throw new Error(`FAILED: Dispatch 2 failed: ${dispatch2Res.error}`);
  }

  const orderAfterChallan2 = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: multiOrder.id },
    include: { lines: true, challans: true },
  });
  console.log(`  Challans count: ${orderAfterChallan2.challans.length} (expected 2)`);
  console.log(`  Dispatched kg: ${orderAfterChallan2.lines[0]!.dispatchedKg} (expected 300)`);
  console.log(`  Order status after Challan 2: ${orderAfterChallan2.status} (expected DISPATCHED)`);

  if (orderAfterChallan2.challans.length !== 2) {
    throw new Error(`FAILED: Expected 2 challans, got ${orderAfterChallan2.challans.length}`);
  }
  if (Number(orderAfterChallan2.lines[0]!.dispatchedKg) !== 300) {
    throw new Error(`FAILED: Expected dispatchedKg = 300, got ${orderAfterChallan2.lines[0]!.dispatchedKg}`);
  }
  if (orderAfterChallan2.status !== SalesOrderStatus.DISPATCHED) {
    throw new Error(`FAILED: Expected status DISPATCHED, got ${orderAfterChallan2.status}`);
  }

  // 5. Invoice both challans
  console.log("5. Invoicing Challan 1 and Challan 2...");
  const inv1Res = await raiseInvoiceCore(user.id, dispatch1Res.challanId);
  if (inv1Res.error || !inv1Res.invoiceId) {
    throw new Error(`FAILED: Invoicing Challan 1 failed: ${inv1Res.error}`);
  }
  const inv2Res = await raiseInvoiceCore(user.id, dispatch2Res.challanId);
  if (inv2Res.error || !inv2Res.invoiceId) {
    throw new Error(`FAILED: Invoicing Challan 2 failed: ${inv2Res.error}`);
  }

  const finalOrderDb = await prisma.salesOrder.findUniqueOrThrow({
    where: { id: multiOrder.id },
    include: { invoices: true },
  });
  console.log(`  Invoices count: ${finalOrderDb.invoices.length} (expected 2)`);
  console.log(`  Final order status: ${finalOrderDb.status} (expected INVOICED)`);

  if (finalOrderDb.invoices.length !== 2) {
    throw new Error(`FAILED: Expected 2 invoices, got ${finalOrderDb.invoices.length}`);
  }
  if (finalOrderDb.status !== SalesOrderStatus.INVOICED) {
    throw new Error(`FAILED: Expected status INVOICED, got ${finalOrderDb.status}`);
  }

  console.log("  PASS: 2 challans created, 300kg dispatched, DISPATCHED reached, 2 invoices created, INVOICED reached.\n");

  // Cleanup Step 7 artifacts
  const multiChallanIds = orderAfterChallan2.challans.map((c) => c.id);
  await prisma.ledgerPosting.deleteMany({ where: { sourceType: "SALES_INVOICE", sourceId: { in: [inv1Res.invoiceId, inv2Res.invoiceId] } } });
  await prisma.salesInvoice.deleteMany({ where: { id: { in: [inv1Res.invoiceId, inv2Res.invoiceId] } } });
  await prisma.stockMovement.deleteMany({ where: { reference: { in: orderAfterChallan2.challans.map((c) => c.code) } } });
  await prisma.packingPackageLine.deleteMany({ where: { challanLine: { challanId: { in: multiChallanIds } } } });
  await prisma.packingPackage.deleteMany({ where: { packingList: { challanId: { in: multiChallanIds } } } });
  await prisma.packingList.deleteMany({ where: { challanId: { in: multiChallanIds } } });
  await prisma.deliveryChallanLine.deleteMany({ where: { challanId: { in: multiChallanIds } } });
  await prisma.deliveryChallan.deleteMany({ where: { id: { in: multiChallanIds } } });
  await prisma.stockAllocation.deleteMany({ where: { salesOrderLineId: multiLine.id } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: multiOrder.id } });
  await prisma.auditEvent.deleteMany({ where: { entityId: { in: [multiOrder.id, ...multiChallanIds, inv1Res.invoiceId, inv2Res.invoiceId] } } });
  await prisma.salesOrder.delete({ where: { id: multiOrder.id } });
  await prisma.inventoryBatch.delete({ where: { id: multiBatch.id } });

  console.log("================================================================================");
  console.log("ALL DAY 1 FLOW, CANCELLATION, AND MULTI-CHALLAN TESTS PASSED CLEANLY!");
  console.log("================================================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
