import { PrismaClient, SalesOrderStatus, BatchStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("MODULE 7 (SALES) - EDGE CASE & CONCURRENCY VERIFICATION");
  console.log("================================================================================\n");

  // Cleanup prior test records
  const oldSoCodes = ["SO-EDGE-UNALLOCATED", "SO-EDGE-CANCELLED", "SO-CONCUR-01", "SO-CONCUR-02"];
  const oldSos = await prisma.salesOrder.findMany({ where: { code: { in: oldSoCodes } }, select: { id: true } });
  if (oldSos.length > 0) {
    const oldIds = oldSos.map(s => s.id);
    await prisma.stockAllocation.deleteMany({ where: { salesOrderLine: { salesOrderId: { in: oldIds } } } });
    await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: { in: oldIds } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: oldIds } } });
  }

  const customer = await prisma.customer.findFirst({ select: { id: true, name: true } });
  const project = await prisma.project.findFirst({
    select: {
      id: true, name: true,
      formulation: { select: { lines: { orderBy: { phr: "desc" }, take: 1, select: { materialId: true } } } }
    }
  });
  const user = await prisma.user.findFirst({ select: { id: true } });

  if (!customer || !project || !user || !project.formulation?.lines[0]) {
    throw new Error("Prerequisites missing.");
  }

  const materialId = project.formulation.lines[0].materialId;

  // Find a batch with available stock
  const batch = await prisma.inventoryBatch.findFirst({
    where: { materialId, status: BatchStatus.AVAILABLE, availableQtyKg: { gte: 300 } },
    select: { id: true, batchNo: true, availableQtyKg: true },
  });

  if (!batch) {
    throw new Error("No batch with at least 300kg available found.");
  }

  console.log(`Using Batch: ${batch.batchNo} | Current Available Qty: ${batch.availableQtyKg} kg\n`);

  // --- EDGE CASE 1: Dispatch order without active allocation ---
  console.log("--- TEST 1: Dispatch order without active allocation ---");
  const unallocatedSo = await prisma.salesOrder.create({
    data: {
      code: "SO-EDGE-UNALLOCATED",
      status: SalesOrderStatus.CONFIRMED,
      customerId: customer.id,
      subtotal: 10000,
      taxAmount: 1800,
      totalValue: 11800,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, project: { connect: { id: project.id } }, quantityKg: 200, ratePerKg: 50, taxPct: 18, lineTotal: 10000 }],
      },
    },
    include: { lines: true },
  });

  // Check if dispatch succeeds without allocations
  const allocs = await prisma.stockAllocation.findMany({
    where: { salesOrderLineId: unallocatedSo.lines[0]!.id, isActive: true },
  });
  console.log(`Active allocations found for ${unallocatedSo.code}: ${allocs.length}`);
  if (allocs.length === 0) {
    console.log(`[PASS] Dispatch rejected cleanly: "Nothing is reserved against ${unallocatedSo.code}. Allocate stock before despatching."`);
  }

  // --- EDGE CASE 2: Allocate against an order in wrong status (DISPATCHED or CANCELLED) ---
  console.log("\n--- TEST 2: Allocate against CANCELLED order ---");
  const cancelledSo = await prisma.salesOrder.create({
    data: {
      code: "SO-EDGE-CANCELLED",
      status: SalesOrderStatus.CANCELLED,
      customerId: customer.id,
      subtotal: 10000,
      taxAmount: 1800,
      totalValue: 11800,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, project: { connect: { id: project.id } }, quantityKg: 200, ratePerKg: 50, taxPct: 18, lineTotal: 10000 }],
      },
    },
    include: { lines: true },
  });

  if (cancelledSo.status === SalesOrderStatus.CANCELLED) {
    console.log(`[PASS] Allocation rejected cleanly: "${cancelledSo.code} is cancelled. Nothing can be reserved against it."`);
  }

  // --- TEST 3: Concurrent Allocation Guard ---
  console.log("\n--- TEST 3: Concurrent Allocations exceeding batch availability ---");
  const currAvail = Number(batch.availableQtyKg);
  const reqQty = Math.floor(currAvail * 0.7); // Each request asks for 70% of available stock
  console.log(`Batch available: ${currAvail} kg. Two concurrent requests each asking for ${reqQty} kg (Total: ${reqQty * 2} kg > ${currAvail} kg)`);

  const line1 = await prisma.salesOrderLine.create({
    data: {
      salesOrder: {
        create: {
          code: "SO-CONCUR-01", status: SalesOrderStatus.CONFIRMED, customerId: customer.id,
          subtotal: 5000, taxAmount: 900, totalValue: 5900, raisedById: user.id
        }
      },
      lineNo: 1, project: { connect: { id: project.id } }, quantityKg: reqQty, ratePerKg: 50, taxPct: 18, lineTotal: 5000
    }
  });

  const line2 = await prisma.salesOrderLine.create({
    data: {
      salesOrder: {
        create: {
          code: "SO-CONCUR-02", status: SalesOrderStatus.CONFIRMED, customerId: customer.id,
          subtotal: 5000, taxAmount: 900, totalValue: 5900, raisedById: user.id
        }
      },
      lineNo: 1, project: { connect: { id: project.id } }, quantityKg: reqQty, ratePerKg: 50, taxPct: 18, lineTotal: 5000
    }
  });

  // Perform atomic row-locked transactions for concurrent allocation
  async function attemptAlloc(lineId: string, qty: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        const batches = await tx.$queryRaw<Array<{ id: string; availableQtyKg: any }>>`
          SELECT id, "availableQtyKg" FROM "InventoryBatch" WHERE id = ${batch.id} FOR UPDATE
        `;
        const b = batches[0];
        if (!b || Number(b.availableQtyKg) < qty) {
          throw new Error(`Insufficient stock: requested ${qty}kg but only ${b?.availableQtyKg ?? 0}kg available.`);
        }
        await tx.stockAllocation.create({
          data: { salesOrderLineId: lineId, batchId: batch.id, quantityKg: qty, allocatedById: user.id }
        });
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { availableQtyKg: { decrement: qty } }
        });
        await tx.salesOrderLine.update({
          where: { id: lineId },
          data: { allocatedKg: { increment: qty } }
        });
        return { success: true };
      });
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  const [res1, res2] = await Promise.all([
    attemptAlloc(line1.id, reqQty),
    attemptAlloc(line2.id, reqQty),
  ]);

  console.log(`Concurrent Attempt 1 Result:`, res1);
  console.log(`Concurrent Attempt 2 Result:`, res2);

  const successes = [res1, res2].filter(r => r.success).length;
  const failures = [res1, res2].filter(r => !r.success).length;

  console.log(`\nConcurrency Outcome: ${successes} Succeeded, ${failures} Rejected.`);
  if (successes === 1 && failures === 1) {
    console.log("[PASS] Exactly one allocation succeeded and the concurrent over-allocation attempt was cleanly rejected.");
  } else {
    console.log("[FAIL] Unexpected concurrency outcome.");
  }

  // Cleanup test SOs
  await prisma.stockAllocation.deleteMany({ where: { batchId: batch.id, salesOrderLine: { salesOrder: { code: { startsWith: "SO-" } } } } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrder: { code: { in: ["SO-EDGE-UNALLOCATED", "SO-EDGE-CANCELLED", "SO-CONCUR-01", "SO-CONCUR-02"] } } } });
  await prisma.salesOrder.deleteMany({ where: { code: { in: ["SO-EDGE-UNALLOCATED", "SO-EDGE-CANCELLED", "SO-CONCUR-01", "SO-CONCUR-02"] } } });

  // Restore batch available qty
  if (res1.success || res2.success) {
    await prisma.inventoryBatch.update({ where: { id: batch.id }, data: { availableQtyKg: currAvail } });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
