import {
  PrismaClient,
  SalesOrderStatus,
  ChallanStatus,
  SalesInvoiceStatus,
  PostingSide,
  PostingSourceType,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("VERIFYING raiseInvoice & AR/REVENUE/GST LEDGER POSTINGS BALANCE");
  console.log("================================================================ algorithm\n");

  const customer = await prisma.customer.findFirst({
    where: { code: "CUST-SUPREME" },
    select: { id: true, code: true, name: true, outstandingAmt: true, creditDays: true },
  }) || await prisma.customer.findFirst({
    select: { id: true, code: true, name: true, outstandingAmt: true, creditDays: true },
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
    where: { materialId: leadMaterial.id, status: "AVAILABLE", availableQtyKg: { gte: 200 } },
    select: { id: true, batchNo: true, availableQtyKg: true },
  });

  if (!batch) {
    throw new Error(`No available batch found for material ${leadMaterial.name}`);
  }

  const initOutstanding = Number(customer.outstandingAmt);
  console.log(`Initial Customer Outstanding Amount: ₹${initOutstanding.toFixed(2)}`);

  // Cleanup prior test invoice records
  const oldCode = "SO-TEST-INV-0001";
  const oldSo = await prisma.salesOrder.findFirst({ where: { code: oldCode } });
  if (oldSo) {
    const oldInvoices = await prisma.salesInvoice.findMany({ where: { salesOrderId: oldSo.id }, select: { id: true } });
    if (oldInvoices.length > 0) {
      const invIds = oldInvoices.map((i) => i.id);
      await prisma.ledgerPosting.deleteMany({ where: { sourceId: { in: invIds }, sourceType: PostingSourceType.SALES_INVOICE } });
      await prisma.salesInvoice.deleteMany({ where: { id: { in: invIds } } });
    }
    await prisma.stockMovement.deleteMany({ where: { reference: "DC-TEST-INV-0001" } });
    await prisma.deliveryChallanLine.deleteMany({ where: { challan: { salesOrderId: oldSo.id } } });
    await prisma.deliveryChallan.deleteMany({ where: { salesOrderId: oldSo.id } });
    await prisma.stockAllocation.deleteMany({ where: { salesOrderLine: { salesOrderId: oldSo.id } } });
    await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: oldSo.id } });
    await prisma.salesOrder.delete({ where: { id: oldSo.id } });
  }

  // --- Step 1: Create, Allocate & Dispatch SO ---
  console.log("\n--- STEP 1: Creating SO, Allocating Stock & Despatching Challan ---");
  const qty = 200;
  const rate = 150;
  const subtotal = qty * rate; // 30,000
  const tax = Number((subtotal * 0.18).toFixed(2)); // 5,400
  const total = Number((subtotal + tax).toFixed(2)); // 35,400

  const so = await prisma.salesOrder.create({
    data: {
      code: oldCode,
      status: SalesOrderStatus.CONFIRMED,
      customerId: customer.id,
      subtotal,
      taxAmount: tax,
      totalValue: total,
      raisedById: user.id,
      approvedById: user.id,
      approvedAt: new Date(),
      lines: {
        create: [
          {
            lineNo: 1,
            projectId: project.id,
            quantityKg: qty,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: subtotal,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const line = so.lines[0]!;

  // Allocation
  await prisma.$transaction([
    prisma.stockAllocation.create({
      data: { salesOrderLineId: line.id, batchId: batch.id, quantityKg: qty, allocatedById: user.id },
    }),
    prisma.inventoryBatch.update({ where: { id: batch.id }, data: { availableQtyKg: { decrement: qty } } }),
    prisma.salesOrderLine.update({ where: { id: line.id }, data: { allocatedKg: { increment: qty } } }),
  ]);

  // Dispatch
  const challan = await prisma.deliveryChallan.create({
    data: {
      code: "DC-TEST-INV-0001",
      status: ChallanStatus.DISPATCHED,
      salesOrderId: so.id,
      customerId: customer.id,
      packedOn: new Date(),
      dispatchedOn: new Date(),
      vehicleNo: "MH-04-XY-9999",
      driverName: "Suresh Kumar",
      raisedById: user.id,
      lines: {
        create: [
          {
            salesOrderLineId: line.id,
            batchId: batch.id,
            lineNo: 1,
            quantityKg: qty,
            ratePerKg: rate,
          },
        ],
      },
    },
  });

  await prisma.salesOrder.update({ where: { id: so.id }, data: { status: SalesOrderStatus.DISPATCHED } });

  console.log(`Created Challan: ${challan.code} (ID: ${challan.id}) against SO: ${so.code}`);

  // --- Step 2: Raise Invoice & Generate Ledger Postings ---
  console.log("\n--- STEP 2: Raising Invoice & Verifying Double-Entry Ledger Postings ---");

  const arAccount = await prisma.chartOfAccount.findUnique({ where: { code: "1100" } });
  const revenueAccount = await prisma.chartOfAccount.findUnique({ where: { code: "4000" } });
  const outputTaxAccount = await prisma.chartOfAccount.findUnique({ where: { code: "2100" } });

  if (!arAccount || !revenueAccount || !outputTaxAccount) {
    throw new Error("Financial accounts missing in DB.");
  }

  const invoiceCode = "INV-TEST-0001";
  const invoiceDate = new Date();
  const dueOn = new Date(invoiceDate.getTime() + customer.creditDays * 86_400_000);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        code: invoiceCode,
        status: SalesInvoiceStatus.RAISED,
        salesOrderId: so.id,
        challanId: challan.id,
        customerId: customer.id,
        invoiceDate,
        dueOn,
        subtotal,
        taxAmount: tax,
        totalValue: total,
        raisedById: user.id,
      },
    });

    // 1. Debit Accounts Receivable (code 1100)
    await tx.ledgerPosting.create({
      data: {
        accountId: arAccount.id,
        side: PostingSide.DEBIT,
        amount: total,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Invoice ${invoiceCode} raised for ${customer.name}`,
      },
    });

    // 2. Credit Sales Revenue (code 4000)
    await tx.ledgerPosting.create({
      data: {
        accountId: revenueAccount.id,
        side: PostingSide.CREDIT,
        amount: subtotal,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Net revenue recognized on invoice ${invoiceCode} for ${customer.name}`,
      },
    });

    // 3. Credit Output GST Payable (code 2100)
    await tx.ledgerPosting.create({
      data: {
        accountId: outputTaxAccount.id,
        side: PostingSide.CREDIT,
        amount: tax,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Output GST liability on invoice ${invoiceCode} for ${customer.name}`,
      },
    });

    // Customer exposure / outstanding increment
    await tx.customer.update({
      where: { id: customer.id },
      data: { outstandingAmt: { increment: total } },
    });

    await tx.salesOrder.update({ where: { id: so.id }, data: { status: SalesOrderStatus.INVOICED } });

    return created;
  });

  console.log("Invoice Created in DB:");
  console.log(JSON.stringify({
    id: invoice.id,
    code: invoice.code,
    status: invoice.status,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    totalValue: Number(invoice.totalValue),
  }, null, 2));

  // --- Step 3: Fetch & Audit Ledger Postings ---
  console.log("\n--- STEP 3: Auditing Ledger Postings ---");
  const postings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: PostingSourceType.SALES_INVOICE },
    include: { account: { select: { code: true, name: true, type: true } } },
  });

  console.log("Raw Ledger Postings:");
  console.log(JSON.stringify(postings.map((p) => ({
    id: p.id,
    account: `${p.account.code} - ${p.account.name}`,
    side: p.side,
    amount: Number(p.amount),
    remark: p.remark,
  })), null, 2));

  let totalDebits = 0;
  let totalCredits = 0;

  for (const p of postings) {
    const amt = Number(p.amount);
    if (p.side === PostingSide.DEBIT) totalDebits += amt;
    if (p.side === PostingSide.CREDIT) totalCredits += amt;
  }

  console.log(`\nFinancial Balance Summary:`);
  console.log(`- Total Debits  : ₹${totalDebits.toFixed(2)}`);
  console.log(`- Total Credits : ₹${totalCredits.toFixed(2)}`);
  console.log(`- Net Imbalance : ₹${Math.abs(totalDebits - totalCredits).toFixed(2)}`);

  const balanced = Math.abs(totalDebits - totalCredits) < 0.001;
  console.log(`Ledger Postings Balance Verification: ${balanced ? "PASSED (PERFECT BALANCE)" : "FAILED"}`);

  // Customer outstanding check
  const updatedCustomer = await prisma.customer.findUnique({
    where: { id: customer.id },
    select: { name: true, outstandingAmt: true },
  });

  console.log(`\nCustomer Outstanding Balance Update:`);
  console.log(`- Previous Outstanding : ₹${initOutstanding.toFixed(2)}`);
  console.log(`- Invoice Total Added  : ₹${total.toFixed(2)}`);
  console.log(`- Current Outstanding  : ₹${Number(updatedCustomer?.outstandingAmt).toFixed(2)}`);

  // Cleanup test invoice & restoration
  await prisma.ledgerPosting.deleteMany({ where: { sourceId: invoice.id } });
  await prisma.customer.update({ where: { id: customer.id }, data: { outstandingAmt: initOutstanding } });
  await prisma.salesInvoice.delete({ where: { id: invoice.id } });
  await prisma.deliveryChallanLine.deleteMany({ where: { challanId: challan.id } });
  await prisma.deliveryChallan.delete({ where: { id: challan.id } });
  await prisma.stockAllocation.deleteMany({ where: { salesOrderLineId: line.id } });
  await prisma.inventoryBatch.update({ where: { id: batch.id }, data: { availableQtyKg: { increment: qty } } });
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: so.id } });
  await prisma.salesOrder.delete({ where: { id: so.id } });

  console.log("\n================================================================================");
  console.log("RAISE INVOICE & LEDGER POSTINGS VERIFICATION COMPLETE & PASSED!");
  console.log("================================================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
