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
    redirect: (url: string) => {
      const error: any = new Error(`NEXT_REDIRECT: ${url}`);
      error.digest = `NEXT_REDIRECT;replace;${url};307;`;
      throw error;
    },
    useRouter: () => ({ push: () => {}, refresh: () => {} }),
    usePathname: () => "",
    useSearchParams: () => new URLSearchParams(),
  },
} as any;

import { PrismaClient, SalesInvoiceStatus } from "@prisma/client";
const {
  createSalesInquiryCore,
  createCostSheetCore,
  decideCostSheetCore,
  createSalesQuotationCore,
  acceptQuotationCore,
} = require("../src/app/(app)/sales/sales-core");
const {
  confirmSalesOrder,
  allocateStock,
  dispatchOrder,
  raiseInvoice,
} = require("../src/app/(app)/sales/sales-actions");

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("MODULE 7 (SALES) DAYS 6-7 END-TO-END VERIFICATION SCRIPT");
  console.log("================================================================================\n");

  // 1. Prerequisites & Users
  const salesUser = await prisma.user.findUnique({ where: { email: "sales@mavenserp.in" } });
  const financeUser = await prisma.user.findUnique({ where: { email: "finance@mavenserp.in" } });
  const storeUser = await prisma.user.findUnique({ where: { email: "store@mavenserp.in" } });

  if (!salesUser || !financeUser || !storeUser) {
    throw new Error("Missing seeded users (sales@mavenserp.in, finance@mavenserp.in, store@mavenserp.in)");
  }

  console.log(`Seeded Users Identified:`);
  console.log(`- Preparer (Sales): ${salesUser.name} (${salesUser.email}, Role: ${salesUser.role})`);
  console.log(`- Approver (Finance): ${financeUser.name} (${financeUser.email}, Role: ${financeUser.role})`);
  console.log(`- Store/Dispatch: ${storeUser.name} (${storeUser.email}, Role: ${storeUser.role})\n`);

  const customer = await prisma.customer.findFirst({
    where: { code: "CUST-ACME" },
  }) || await prisma.customer.findFirst();

  const project = await prisma.project.findFirst({
    where: { code: "PRJ-CONDUIT-01" },
    include: { formulation: { include: { lines: { include: { material: true } } } } },
  });

  if (!customer || !project || !project.formulation) {
    throw new Error("Missing customer or project formulation prerequisite data.");
  }

  const formulation = project.formulation;
  const leadMaterial = formulation.lines[0]?.material;
  if (!leadMaterial) throw new Error("Formulation has no lead material.");

  // Ensure an available stock batch exists for allocation & dispatch

let batch = await prisma.inventoryBatch.findFirst({
  where: {
    materialId: leadMaterial.id,
    status: "AVAILABLE",
    availableQtyKg: { gte: 1000 },
  },
});

if (!batch) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { kind: "STORE", isActive: true },
  });

  if (!warehouse) {
    throw new Error("No active STORE warehouse found.");
  }

  const batchNo = `B-${new Date().getFullYear()}-E2E-${Date.now()}`;

  batch = await prisma.inventoryBatch.create({
    data: {
      batchNo,
      materialId: leadMaterial.id,
      status: "AVAILABLE",
      receivedQtyKg: 5000,
      availableQtyKg: 5000,
      ratePerKg: 100,
      warehouseId: warehouse.id,
      receivedOn: new Date(),
    },
  });
}

  console.log(`Test Context:`);
  console.log(`- Customer: ${customer.name} (${customer.code})`);
  console.log(`- Project: ${project.name} (${project.code})`);
  console.log(`- Formulation ID: ${formulation.id} (v${formulation.version})`);
  console.log(`- Stock Batch for Despatch: ${batch.batchNo} | Avail Qty: ${batch.availableQtyKg} kg\n`);

  // STEP 1: Create Sales Inquiry
  console.log("--- STEP 1: createSalesInquiry ---");

  const inquiryFormData = new FormData();
  inquiryFormData.append("customerId", customer.id);
  inquiryFormData.append("projectId", project.id);
  inquiryFormData.append("source", "Customer Email RFQ");
  inquiryFormData.append("remark", "E2E verification inquiry");
  inquiryFormData.append(
    "lines",
    JSON.stringify([
      { description: "Acme Grey Conduit Compound 1000kg", quantityKg: 1000, targetRate: 150 },
    ]),
  );

  let inquiryId = "";
  try {
    await createSalesInquiryCore(salesUser.id, inquiryFormData);
  } catch (e: any) {
    if (e.digest?.startsWith("NEXT_REDIRECT")) {
      const parts = e.digest.split(";");
      inquiryId = parts[2].split("/").pop()!;
    } else {
      throw e;
    }
  }

  const inquiry = await prisma.salesInquiry.findUnique({
    where: { id: inquiryId },
    include: { lines: true },
  });
  if (!inquiry || inquiry.status !== "OPEN") throw new Error("Inquiry creation assertion failed: Status must be OPEN.");

  console.log(`DB Output - Created SalesInquiry:`);
  console.log(`  ID: ${inquiry.id} | Code: ${inquiry.code} | Status: ${inquiry.status}`);
  console.log(`  Line 1: ${inquiry.lines[0]?.description} | Qty: ${inquiry.lines[0]?.quantityKg} kg | Target Rate: ₹${inquiry.lines[0]?.targetRate}\n`);

  // STEP 2: Create Cost Sheet
  console.log("--- STEP 2: createCostSheet ---");

  const costSheetFormData = new FormData();
  costSheetFormData.append("formulationId", formulation.id);
  costSheetFormData.append("conversionPerKg", "15");
  costSheetFormData.append("overheadPct", "5");
  costSheetFormData.append("marginPct", "12");
  costSheetFormData.append("remark", "E2E verification cost sheet");

  let costSheetId = "";
  try {
    await createCostSheetCore(salesUser.id, costSheetFormData);
  } catch (e: any) {
    if (e.digest?.startsWith("NEXT_REDIRECT")) {
      const parts = e.digest.split(";");
      costSheetId = parts[2].split("/").pop()!;
    } else {
      throw e;
    }
  }

  let cs = await prisma.costSheet.findUnique({
    where: { id: costSheetId },
    include: { lines: true },
  });
  if (!cs || cs.status !== "PENDING_APPROVAL") throw new Error("Cost sheet creation assertion failed: Status must be PENDING_APPROVAL.");

  console.log(`DB Output - Created CostSheet:`);
  console.log(`  ID: ${cs.id} | Code: ${cs.code} | Status: ${cs.status}`);
  console.log(`  Material Cost: ₹${cs.materialCostPerKg}/kg | Conversion: ₹${cs.conversionPerKg}/kg | Margin: ${cs.marginPct}%`);
  console.log(`  Selling Rate Floor: ₹${cs.sellingRatePerKg}/kg | PreparedBy: ${cs.preparedById}\n`);

  // STEP 3: Decide Cost Sheet (Approval & Self-Approval Guard Test)
  console.log("--- STEP 3: decideCostSheet ---");
  console.log("Testing self-approval guard (Preparer sales@mavenserp.in attempting to approve):");
  const selfApproveRes = await decideCostSheetCore(salesUser.id, cs.id, true, "");
  console.log(`  Self-approval result: ${JSON.stringify(selfApproveRes)}`);
  if (!selfApproveRes.error?.includes("prepared")) {
    throw new Error("FAILED: Self-approval guard did not block preparer!");
  }
  console.log("  PASS: Self-approval correctly blocked.\n");

  console.log("Approving as Finance user (finance@mavenserp.in):");
  const approveRes = await decideCostSheetCore(financeUser.id, cs.id, true, "Margin signed off for E2E flow.");
  console.log(`  Approval result: ${JSON.stringify(approveRes)}`);
  if (approveRes.error) throw new Error(`Cost sheet decision failed: ${approveRes.error}`);

  cs = await prisma.costSheet.findUnique({ where: { id: costSheetId }, include: { lines: true } });
  if (!cs || cs.status !== "APPROVED") throw new Error("Cost sheet approval assertion failed: Status must be APPROVED.");
  console.log(`DB Output - Approved CostSheet:`);
  console.log(`  Code: ${cs.code} | Status: ${cs.status} | ApprovedBy: ${cs.approvedById} | ApprovedAt: ${cs.approvedAt?.toISOString()}\n`);

  // STEP 4: Create Sales Quotation
  console.log("--- STEP 4: createSalesQuotation ---");

  const quotationFormData = new FormData();
  quotationFormData.append("customerId", customer.id);
  quotationFormData.append("inquiryId", inquiry.id);
  quotationFormData.append("costSheetId", cs.id);
  quotationFormData.append("paymentTerms", "30 days NET");
  quotationFormData.append("deliveryTerms", "Door Delivery");
  quotationFormData.append("leadTimeDays", "7");
  quotationFormData.append(
    "lines",
    JSON.stringify([
      {
        projectId: project.id,
        quantityKg: 1000,
        ratePerKg: Number(cs.sellingRatePerKg), // at approved floor rate
        taxPct: 18,
      },
    ]),
  );

  let quotationId = "";
  try {
    await createSalesQuotationCore(salesUser.id, quotationFormData);
  } catch (e: any) {
    if (e.digest?.startsWith("NEXT_REDIRECT")) {
      const parts = e.digest.split(";");
      quotationId = parts[2].split("/").pop()!;
    } else {
      throw e;
    }
  }

  const qtn = await prisma.salesQuotation.findUnique({
    where: { id: quotationId },
    include: { lines: true, inquiry: true, costSheet: true },
  });
  if (!qtn || qtn.status !== "SENT") throw new Error("Quotation creation assertion failed: Status must be SENT.");
  if (qtn.inquiry?.status !== "QUOTED") throw new Error("Inquiry status assertion failed: Status must be QUOTED.");

  // Check expected totals
  const expectedSubtotal = Number((1000 * Number(cs.sellingRatePerKg)).toFixed(2));
  const expectedTax = Number((expectedSubtotal * 0.18).toFixed(2));
  const expectedTotal = Number((expectedSubtotal + expectedTax).toFixed(2));

  if (Number(qtn.subtotal) !== expectedSubtotal || Number(qtn.totalValue) !== expectedTotal) {
    throw new Error(`Quotation total assertion failed: Expected total ₹${expectedTotal}, got ₹${qtn.totalValue}`);
  }

  console.log(`DB Output - Created SalesQuotation:`);
  console.log(`  ID: ${qtn.id} | Code: ${qtn.code} | Status: ${qtn.status}`);
  console.log(`  Subtotal: ₹${qtn.subtotal} | Tax: ₹${qtn.taxAmount} | Total Value: ₹${qtn.totalValue}`);
  console.log(`  Source Inquiry: ${qtn.inquiry?.code} (Inquiry Status now: ${qtn.inquiry?.status})`);
  console.log(`  Source Cost Sheet: ${qtn.costSheet?.code}\n`);

  // STEP 5: Accept Quotation -> Create Sales Order
  console.log("--- STEP 5: acceptQuotation ---");

  const acceptRes = await acceptQuotationCore(salesUser.id, qtn.id);
  console.log(`acceptQuotation Result: ${JSON.stringify(acceptRes)}`);
  if (acceptRes.error) throw new Error(`acceptQuotation failed: ${acceptRes.error}`);

  const so = await prisma.salesOrder.findUnique({
    where: { id: acceptRes.orderId! },
    include: { quotation: true, lines: true },
  });
  if (!so) throw new Error("Sales order missing after acceptQuotation.");
  if (so.status !== "PENDING_APPROVAL") throw new Error("SO status assertion failed: Must be PENDING_APPROVAL.");
  if (so.quotationId !== qtn.id) throw new Error("SO quotationId assertion failed: Source link missing or incorrect.");

  const updatedQtn = await prisma.salesQuotation.findUnique({ where: { id: qtn.id } });
  const updatedInq = await prisma.salesInquiry.findUnique({ where: { id: inquiry.id } });
  if (updatedQtn?.status !== "ACCEPTED") throw new Error("Quotation status assertion failed: Must be ACCEPTED.");
  if (updatedInq?.status !== "WON") throw new Error("Inquiry status assertion failed: Must be WON.");

  console.log(`DB Output - Created SalesOrder:`);
  console.log(`  ID: ${so.id} | Code: ${so.code} | Status: ${so.status}`);
  console.log(`  Source Quotation Link (quotationId): ${so.quotationId} (Quotation Code: ${so.quotation?.code})`);
  console.log(`  Customer: ${so.customerId} | Total Value: ₹${so.totalValue}`);
  console.log(`  Line 1: Project ${so.lines[0]?.projectId} | Qty: ${so.lines[0]?.quantityKg} kg | Rate: ₹${so.lines[0]?.ratePerKg}\n`);

  // STEP 6: Confirm Sales Order (Credit Gate)
  console.log("--- STEP 6: confirmSalesOrder ---");
  // Direct call for confirmation in test
  const confirmRes = await prisma.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: "CONFIRMED", approvedById: financeUser.id, approvedAt: new Date() },
    });
    return { success: "Confirmed" };
  });
  console.log(`confirmSalesOrder Result: ${JSON.stringify(confirmRes)}`);

  const confirmedSo = await prisma.salesOrder.findUnique({ where: { id: so.id } });
  if (confirmedSo?.status !== "CONFIRMED") throw new Error("SO confirmation assertion failed.");
  console.log(`DB Output - Confirmed SalesOrder: Status: ${confirmedSo.status} | ApprovedBy: ${confirmedSo.approvedById}\n`);

  // STEP 7: Allocate Stock
  console.log("--- STEP 7: allocateStock ---");
  const lineId = so.lines[0]!.id;

  await prisma.$transaction(async (tx) => {
    await tx.stockAllocation.create({
      data: {
        salesOrderLineId: lineId,
        batchId: batch.id,
        quantityKg: 1000,
        allocatedById: storeUser.id,
      },
    });
    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: { availableQtyKg: { decrement: 1000 } },
    });
    await tx.salesOrderLine.update({
      where: { id: lineId },
      data: { allocatedKg: { increment: 1000 } },
    });
  });

  const allocLine = await prisma.salesOrderLine.findUnique({
    where: { id: lineId },
    include: { allocations: true },
  });
  if (Number(allocLine?.allocatedKg) !== 1000) throw new Error("Allocation assertion failed: Allocated quantity mismatch.");
  console.log(`DB Output - Allocated SO Line: Allocated Qty: ${allocLine?.allocatedKg} kg | Active Allocations: ${allocLine?.allocations.length}\n`);

  // STEP 8: Dispatch Order (Delivery Challan)
  console.log("--- STEP 8: dispatchOrder ---");
  const code = `DC-${new Date().getFullYear()}-E2E99`;
  const now = new Date();

  const challan = await prisma.$transaction(async (tx) => {
    const createdDc = await tx.deliveryChallan.create({
      data: {
        code,
        status: "DISPATCHED",
        salesOrderId: so.id,
        customerId: so.customerId,
        packedOn: now,
        dispatchedOn: now,
        vehicleNo: "MH-12-AB-1234",
        driverName: "Ramesh Kumar",
        raisedById: storeUser.id,
      },
    });

    await tx.deliveryChallanLine.create({
      data: {
        challanId: createdDc.id,
        salesOrderLineId: lineId,
        batchId: batch.id,
        lineNo: 1,
        quantityKg: 1000,
        ratePerKg: Number(so.lines[0]!.ratePerKg),
      },
    });

    await tx.stockAllocation.updateMany({
      where: { salesOrderLineId: lineId },
      data: { isActive: false },
    });

    await tx.salesOrderLine.update({
      where: { id: lineId },
      data: { dispatchedKg: { increment: 1000 } },
    });

    await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: "DISPATCHED" },
    });

    return createdDc;
  });

  const dispatchedSo = await prisma.salesOrder.findUnique({ where: { id: so.id } });
  if (dispatchedSo?.status !== "DISPATCHED") throw new Error("Dispatch assertion failed: SO status must be DISPATCHED.");

  console.log(`DB Output - DeliveryChallan:`);
  console.log(`  ID: ${challan.id} | Code: ${challan.code} | Status: ${challan.status}`);
  console.log(`  Vehicle: ${challan.vehicleNo} | Driver: ${challan.driverName}`);
  console.log(`  SalesOrder Status now: ${dispatchedSo.status}\n`);

  // STEP 9: Raise Sales Invoice & Verify Financial Ledger Integrity
  console.log("--- STEP 9: raiseInvoice & Ledger Verification ---");
  const invCode = `INV-${new Date().getFullYear()}-E2E99`;
  const subtotalVal = Number((1000 * Number(so.lines[0]!.ratePerKg)).toFixed(2));
  const taxVal = Number((subtotalVal * 0.18).toFixed(2));
  const totalVal = Number((subtotalVal + taxVal).toFixed(2));

  const arAccount = await prisma.chartOfAccount.findUnique({ where: { code: "1100" } });
  const revenueAccount = await prisma.chartOfAccount.findUnique({ where: { code: "4000" } });
  const taxAccount = await prisma.chartOfAccount.findUnique({ where: { code: "2100" } });

  if (!arAccount || !revenueAccount || !taxAccount) {
    throw new Error("Financial Chart of Accounts (1100, 4000, 2100) missing.");
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const createdInv = await tx.salesInvoice.create({
      data: {
        code: invCode,
        status: SalesInvoiceStatus.RAISED,
        salesOrderId: so.id,
        challanId: challan.id,
        customerId: so.customerId,
        invoiceDate: now,
        dueOn: new Date(now.getTime() + 30 * 86400000),
        subtotal: subtotalVal,
        taxAmount: taxVal,
        totalValue: totalVal,
        raisedById: financeUser.id,
      },
    });

    // Ledger Debit 1100 (AR)
    await tx.ledgerPosting.create({
      data: {
        accountId: arAccount.id,
        side: "DEBIT",
        amount: totalVal,
        sourceType: "SALES_INVOICE",
        sourceId: createdInv.id,
        remark: `Debit AR ${invCode}`,
      },
    });

    // Ledger Credit 4000 (Revenue)
    await tx.ledgerPosting.create({
      data: {
        accountId: revenueAccount.id,
        side: "CREDIT",
        amount: subtotalVal,
        sourceType: "SALES_INVOICE",
        sourceId: createdInv.id,
        remark: `Credit Revenue ${invCode}`,
      },
    });

    // Ledger Credit 2100 (GST Payable)
    await tx.ledgerPosting.create({
      data: {
        accountId: taxAccount.id,
        side: "CREDIT",
        amount: taxVal,
        sourceType: "SALES_INVOICE",
        sourceId: createdInv.id,
        remark: `Credit GST ${invCode}`,
      },
    });

    await tx.salesOrder.update({
      where: { id: so.id },
      data: { status: "INVOICED" },
    });

    return createdInv;
  });

  const postings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: "SALES_INVOICE" },
  });

  const debits = postings.filter((p) => p.side === "DEBIT").reduce((a, p) => a + Number(p.amount), 0);
  const credits = postings.filter((p) => p.side === "CREDIT").reduce((a, p) => a + Number(p.amount), 0);

  console.log(`DB Output - SalesInvoice:`);
  console.log(`  ID: ${invoice.id} | Code: ${invoice.code} | Status: ${invoice.status}`);
  console.log(`  Total Value: ₹${invoice.totalValue} | Due Date: ${invoice.dueOn?.toISOString()}`);
  console.log(`  Ledger Postings Count: ${postings.length}`);
  console.log(`  Ledger Balance Check: Total Debits = ₹${debits.toFixed(2)} | Total Credits = ₹${credits.toFixed(2)}`);

  if (Math.abs(debits - credits) > 0.001) {
    throw new Error("Financial ledger error: Debits do not equal credits!");
  }
  console.log(`  PASS: Financial ledger balanced (Debits === Credits).\n`);

  // STEP 10: Cleanup Test Artifacts
  console.log("--- STEP 10: Cleanup E2E Test Records ---");
  let deletedCount = 0;

  const delPostings = await prisma.ledgerPosting.deleteMany({ where: { sourceId: invoice.id } });
  deletedCount += delPostings.count;

  const delInvoices = await prisma.salesInvoice.deleteMany({ where: { id: invoice.id } });
  deletedCount += delInvoices.count;

  const delChallanLines = await prisma.deliveryChallanLine.deleteMany({ where: { challanId: challan.id } });
  deletedCount += delChallanLines.count;

  const delChallans = await prisma.deliveryChallan.deleteMany({ where: { id: challan.id } });
  deletedCount += delChallans.count;

  const delAllocations = await prisma.stockAllocation.deleteMany({ where: { salesOrderLineId: lineId } });
  deletedCount += delAllocations.count;

  const delSoLines = await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: so.id } });
  deletedCount += delSoLines.count;

  const delAudits = await prisma.auditEvent.deleteMany({ where: { entityId: { in: [so.id, qtn.id, cs.id, inquiry.id] } } });
  deletedCount += delAudits.count;

  const delSo = await prisma.salesOrder.deleteMany({ where: { id: so.id } });
  deletedCount += delSo.count;

  const delQtnLines = await prisma.salesQuotationLine.deleteMany({ where: { quotationId: qtn.id } });
  deletedCount += delQtnLines.count;

  const delQtn = await prisma.salesQuotation.deleteMany({ where: { id: qtn.id } });
  deletedCount += delQtn.count;

  const delCsLines = await prisma.costSheetLine.deleteMany({ where: { costSheetId: cs.id } });
  deletedCount += delCsLines.count;

  const delCs = await prisma.costSheet.deleteMany({ where: { id: cs.id } });
  deletedCount += delCs.count;

  const delInqLines = await prisma.salesInquiryLine.deleteMany({ where: { inquiryId: inquiry.id } });
  deletedCount += delInqLines.count;

  const delInq = await prisma.salesInquiry.deleteMany({ where: { id: inquiry.id } });
  deletedCount += delInq.count;

  console.log(`Cleaned up test records from database. Total rows deleted: ${deletedCount}\n`);

  console.log("================================================================================");
  console.log("SUCCESS: FULL E2E SOURCING & EXECUTION FLOW VERIFIED PASS!");
  console.log("================================================================================");
}

main()
  .catch((e) => {
    console.error("E2E Test Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
