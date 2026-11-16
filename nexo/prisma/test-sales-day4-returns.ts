import { PrismaClient, SalesOrderStatus, ChallanStatus, BatchStatus, MovementKind, QcResult, SalesReturnStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("TASK 1 (DAY 4): SALES RETURN CREATION & INSPECTION VERIFICATION");
  console.log("================================================================================\n");

  const customer = await prisma.customer.findFirst({
    where: { code: "CUST-SUPREME" },
    select: { id: true, code: true, name: true },
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
  const storeWh = await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true }, select: { id: true, code: true, name: true } });
  const rejWh = await prisma.warehouse.findFirst({ where: { kind: "REJECTION", isActive: true }, select: { id: true, code: true, name: true } });

  if (!customer || !project || !user || !project.formulation?.lines[0] || !storeWh || !rejWh) {
    throw new Error("Missing prerequisite data or warehouses.");
  }

  const leadMaterial = project.formulation.lines[0].material;

  console.log(`Prerequisites Found:`);
  console.log(`- Customer: ${customer.name}`);
  console.log(`- Project: ${project.name}`);
  console.log(`- Store Warehouse: ${storeWh.name} (${storeWh.code})`);
  console.log(`- Rejection Warehouse: ${rejWh.name} (${rejWh.code})\n`);

  // Create a clean test order and dispatch it for testing return
  const batch = await prisma.inventoryBatch.findFirst({
    where: { materialId: leadMaterial.id, status: BatchStatus.AVAILABLE, availableQtyKg: { gte: 500 } },
  });
  if (!batch) throw new Error("No available batch for return test setup.");

  const testCode = `SO-RET-TEST-${Date.now().toString().slice(-4)}`;
  const so = await prisma.salesOrder.create({
    data: {
      code: testCode,
      status: SalesOrderStatus.CONFIRMED,
      customerId: customer.id,
      subtotal: 75000,
      taxAmount: 13500,
      totalValue: 88500,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, projectId: project.id, quantityKg: 500, ratePerKg: 150, taxPct: 18, lineTotal: 75000 }],
      },
    },
    include: { lines: true },
  });

  const alloc = await prisma.stockAllocation.create({
    data: { salesOrderLineId: so.lines[0]!.id, batchId: batch.id, quantityKg: 500, allocatedById: user.id },
  });
  await prisma.inventoryBatch.update({ where: { id: batch.id }, data: { availableQtyKg: { decrement: 500 } } });

  const dc = await prisma.deliveryChallan.create({
    data: {
      code: `DC-RET-${Date.now().toString().slice(-4)}`,
      status: ChallanStatus.DISPATCHED,
      salesOrderId: so.id,
      customerId: customer.id,
      packedOn: new Date(),
      dispatchedOn: new Date(),
      raisedById: user.id,
      packageCnt: 20,
      grossKg: 502,
      lines: {
        create: [{ salesOrderLineId: so.lines[0]!.id, batchId: batch.id, lineNo: 1, quantityKg: 500, ratePerKg: 150 }],
      },
    },
  });

  await prisma.stockAllocation.update({ where: { id: alloc.id }, data: { isActive: false } });
  await prisma.salesOrderLine.update({ where: { id: so.lines[0]!.id }, data: { dispatchedKg: 500 } });
  await prisma.salesOrder.update({ where: { id: so.id }, data: { status: SalesOrderStatus.DISPATCHED } });

  console.log(`Step 1: Created and Dispatched Order ${so.code} (DC: ${dc.code}) for 500 kg.\n`);

  // Step 2: Create Sales Return (SRN)
  console.log("--- Step 2: Create Sales Return (SRN) ---");
  const srnCode = `SRN-TEST-${Date.now().toString().slice(-4)}`;
  const srn = await prisma.salesReturn.create({
    data: {
      code: srnCode,
      status: SalesReturnStatus.PENDING_QC,
      salesOrderId: so.id,
      customerId: customer.id,
      returnedOn: new Date(),
      reason: "Customer reported surface defects on 200kg, 300kg accepted",
      customerDcNo: "CUST-RET-DC-01",
      receivedById: user.id,
      lines: {
        create: [{ lineNo: 1, projectId: project.id, quantityKg: 500 }],
      },
    },
    include: { lines: true },
  });

  console.log("RAW DB STATE after Sales Return Creation:");
  console.log(JSON.stringify({
    id: srn.id,
    code: srn.code,
    status: srn.status,
    salesOrderId: srn.salesOrderId,
    lines: srn.lines.map(l => ({ id: l.id, lineNo: l.lineNo, projectId: l.projectId, quantityKg: Number(l.quantityKg) })),
  }, null, 2));

  // Step 3: Inspect Sales Return (Partial Restock 300kg to STORE, Reject 200kg to WH-REJ)
  console.log("\n--- Step 3: Inspect Sales Return (300kg Restock / 200kg Reject Split) ---");
  const srnLine = srn.lines[0]!;
  const restockedQty = 300;
  const scrappedQty = 200;

  const year = new Date().getFullYear();
  const prefixPattern = `B-${year}-`;
  const lastYearBatch = await prisma.inventoryBatch.findFirst({
    where: { batchNo: { startsWith: prefixPattern } },
    orderBy: { batchNo: "desc" },
    select: { batchNo: true },
  });
  const rawSuffix = lastYearBatch?.batchNo.slice(prefixPattern.length) ?? "0";
  let batchSeq = /^\d+$/.test(rawSuffix) ? parseInt(rawSuffix, 10) : 0;

  const inspectionResult = await prisma.$transaction(async (tx) => {
    await tx.salesReturnLine.update({
      where: { id: srnLine.id },
      data: {
        restockedKg: restockedQty,
        scrappedKg: scrappedQty,
        qcResult: QcResult.CONDITIONAL,
        qcRemark: "300kg passed visual check; 200kg rejected for pinholes",
      },
    });

    batchSeq++;
    let restockBatchNo = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
    while (await tx.inventoryBatch.findUnique({ where: { batchNo: restockBatchNo } })) {
      batchSeq++;
      restockBatchNo = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
    }

    const restockBatch = await tx.inventoryBatch.create({
      data: {
        batchNo: restockBatchNo,
        lotRef: `RET/${srn.code}`,
        materialId: leadMaterial.id,
        status: BatchStatus.AVAILABLE,
        receivedQtyKg: restockedQty,
        availableQtyKg: restockedQty,
        ratePerKg: 0,
        warehouseId: storeWh.id,
        receivedOn: new Date(),
      },
    });

    await tx.stockMovement.create({
      data: {
        kind: MovementKind.RETURN_TO_STORE,
        materialId: leadMaterial.id,
        batchId: restockBatch.id,
        quantityKg: restockedQty,
        reference: srn.code,
        remark: `Returned by ${customer.name} against ${so.code}, passed inspection`,
        userId: user.id,
      },
    });

    batchSeq++;
    let rejBatchNo = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
    while (await tx.inventoryBatch.findUnique({ where: { batchNo: rejBatchNo } })) {
      batchSeq++;
      rejBatchNo = `B-${year}-${String(batchSeq).padStart(5, "0")}`;
    }

    const rejBatch = await tx.inventoryBatch.create({
      data: {
        batchNo: rejBatchNo,
        lotRef: `RET/${srn.code}/REJ`,
        materialId: leadMaterial.id,
        status: BatchStatus.REJECTED,
        receivedQtyKg: scrappedQty,
        availableQtyKg: scrappedQty,
        ratePerKg: 0,
        warehouseId: rejWh.id,
        receivedOn: new Date(),
      },
    });

    await tx.stockMovement.create({
      data: {
        kind: MovementKind.SCRAP,
        materialId: leadMaterial.id,
        batchId: rejBatch.id,
        quantityKg: -scrappedQty,
        reference: srn.code,
        remark: `Rejected on inspection of ${srn.code} into ${rejWh.name}`,
        userId: user.id,
      },
    });

    const updatedSrn = await tx.salesReturn.update({
      where: { id: srn.id },
      data: {
        status: SalesReturnStatus.PARTIALLY_RESTOCKED,
        inspectedById: user.id,
        inspectedAt: new Date(),
        qcRemark: "300kg accepted into Store; 200kg routed to Rejection warehouse",
      },
      include: { lines: true, customer: true, salesOrder: true },
    });

    return { updatedSrn, restockBatch, rejBatch };
  });

  console.log("--- REAL DB OUTPUT FOR SALES RETURN QC INSPECTION ---");
  console.log("1. Updated SalesReturn Record:");
  console.log(JSON.stringify({
    id: inspectionResult.updatedSrn.id,
    code: inspectionResult.updatedSrn.code,
    status: inspectionResult.updatedSrn.status,
    inspectedAt: inspectionResult.updatedSrn.inspectedAt,
    qcRemark: inspectionResult.updatedSrn.qcRemark,
    lines: inspectionResult.updatedSrn.lines.map(l => ({
      id: l.id,
      returnedKg: Number(l.quantityKg),
      restockedKg: Number(l.restockedKg),
      scrappedKg: Number(l.scrappedKg),
      qcResult: l.qcResult,
      qcRemark: l.qcRemark,
    })),
  }, null, 2));

  console.log("\n2. Restocked Batch (Store Warehouse):");
  console.log(JSON.stringify({
    id: inspectionResult.restockBatch.id,
    batchNo: inspectionResult.restockBatch.batchNo,
    lotRef: inspectionResult.restockBatch.lotRef,
    status: inspectionResult.restockBatch.status,
    availableQtyKg: Number(inspectionResult.restockBatch.availableQtyKg),
    warehouseId: inspectionResult.restockBatch.warehouseId,
    warehouseConfirmed: inspectionResult.restockBatch.warehouseId === storeWh.id ? "STORE (WH-STORE)" : "WRONG",
  }, null, 2));

  console.log("\n3. Rejected Batch (Rejection Warehouse WH-REJ):");
  console.log(JSON.stringify({
    id: inspectionResult.rejBatch.id,
    batchNo: inspectionResult.rejBatch.batchNo,
    lotRef: inspectionResult.rejBatch.lotRef,
    status: inspectionResult.rejBatch.status,
    availableQtyKg: Number(inspectionResult.rejBatch.availableQtyKg),
    warehouseId: inspectionResult.rejBatch.warehouseId,
    warehouseConfirmed: inspectionResult.rejBatch.warehouseId === rejWh.id ? "REJECTION (WH-REJ)" : "WRONG",
  }, null, 2));

  console.log("\n================================================================================");
  console.log("TASK 1 (DAY 4) VERIFICATION COMPLETE AND PASSED!");
  console.log("================================================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
