import fs from "fs";
import path from "path";

// 1. Load env variables programmatically
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const index = trimmed.indexOf("=");
      if (index !== -1) {
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        if (key && value) {
          process.env[key] = value;
        }
      }
    }
  });
}

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

import { prisma } from "../src/lib/prisma";
import { POST as receivePayment } from "../src/app/api/finance/receivable/[invoiceId]/receive/route";
import { GET as getReceivables } from "../src/app/api/finance/receivable/route";
import { postBankTransaction } from "../src/lib/postBankTransaction";
import { PostingSide, PostingSourceType, SalesInvoiceStatus, Industry } from "@prisma/client";

async function runTests() {
  console.log("=== AR SYSTEM VERIFICATION START ===");

  // STEP 1: Verify Chart of Accounts has 1100 (AR), 4000 (Sales Revenue), and 2100 (Output GST Payable)
  console.log("\n[STEP 1] Checking Chart of Accounts for AR (1100), Revenue (4000), Output GST (2100)...");
  const arAccount = await prisma.chartOfAccount.findUnique({
    where: { code: "1100" },
  });
  const revenueAccount = await prisma.chartOfAccount.findUnique({
    where: { code: "4000" },
  });
  const outputTaxAccount = await prisma.chartOfAccount.findUnique({
    where: { code: "2100" },
  });
  const bankAccount = await prisma.chartOfAccount.findUnique({
    where: { code: "1000" },
  });

  if (!arAccount || arAccount.type !== "ASSET") {
    console.error("ERROR: Account 1100 (Accounts Receivable) missing or not ASSET!");
    process.exit(1);
  }
  if (!revenueAccount || revenueAccount.type !== "REVENUE") {
    console.error("ERROR: Account 4000 (Sales Revenue) missing or not REVENUE!");
    process.exit(1);
  }
  if (!outputTaxAccount || outputTaxAccount.type !== "LIABILITY") {
    console.error("ERROR: Account 2100 (Output GST Payable) missing or not LIABILITY!");
    process.exit(1);
  }
  if (!bankAccount || bankAccount.type !== "ASSET") {
    console.error("ERROR: Account 1000 (Bank/Asset) missing!");
    process.exit(1);
  }
  console.log("SUCCESS: Accounts 1100 (AR), 4000 (Revenue), 2100 (Output GST), and 1000 (Bank) are verified in Chart of Accounts.");

  // STEP 2: Find or create Admin User and Customer for test
  console.log("\n[STEP 2] Locating Admin user and active Customer...");
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });
  if (!adminUser) {
    console.error("ERROR: No ADMIN user found in database!");
    process.exit(1);
  }

  let customer = await prisma.customer.findFirst({
    where: { status: "ACTIVE" },
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        code: "CUST-TEST-AR",
        name: "Test AR Customer Ltd",
        status: "ACTIVE",
        industry: Industry.PIPES_AND_FITTINGS,
        outstandingAmt: 0,
        creditLimit: 500000,
        creditDays: 30,
      },
    });
    console.log(`Created test customer: ${customer.name} (${customer.id})`);
  } else {
    console.log(`Using customer: ${customer.name} (${customer.id})`);
  }

  // Find or create a sales order for reference
  let salesOrder = await prisma.salesOrder.findFirst({
    where: { customerId: customer.id },
  });
  if (!salesOrder) {
    salesOrder = await prisma.salesOrder.create({
      data: {
        code: `SO-TEST-${Date.now().toString().slice(-4)}`,
        status: "CONFIRMED",
        customerId: customer.id,
        subtotal: 150000,
        taxAmount: 27000,
        totalValue: 177000,
      },
    });
  }

  // STEP 3: Create a Sales Invoice and post AR + Revenue + Output GST ledger entries
  console.log("\n[STEP 3] Creating Sales Invoice and posting AR (Debit 1100) / Revenue (Credit 4000) / Output GST (Credit 2100)...");
  const invoiceSubtotal = 127118.64;
  const invoiceTax = 22881.36;
  const invoiceTotal = 150000.00;
  const initialOutstanding = Number(customer.outstandingAmt);
  const invCode = `INV-TEST-${Date.now().toString().slice(-4)}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.salesInvoice.create({
      data: {
        code: invCode,
        status: SalesInvoiceStatus.RAISED,
        salesOrderId: salesOrder.id,
        customerId: customer.id,
        subtotal: invoiceSubtotal,
        taxAmount: invoiceTax,
        totalValue: invoiceTotal,
        paidAmount: 0,
        raisedById: adminUser.id,
      },
    });

    // 1. Debit Accounts Receivable (code 1100) — customer asset increases
    await tx.ledgerPosting.create({
      data: {
        accountId: arAccount.id,
        side: PostingSide.DEBIT,
        amount: invoiceTotal,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Invoice ${invCode} raised for ${customer.name}`,
      },
    });

    // 2. Credit Sales Revenue (code 4000) — net product revenue recognized
    await tx.ledgerPosting.create({
      data: {
        accountId: revenueAccount.id,
        side: PostingSide.CREDIT,
        amount: invoiceSubtotal,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Net revenue recognized on invoice ${invCode}`,
      },
    });

    // 3. Credit Output GST Payable (code 2100) — tax liability recognized
    await tx.ledgerPosting.create({
      data: {
        accountId: outputTaxAccount.id,
        side: PostingSide.CREDIT,
        amount: invoiceTax,
        sourceType: PostingSourceType.SALES_INVOICE,
        sourceId: created.id,
        remark: `Output GST liability recognized on invoice ${invCode}`,
      },
    });

    // Increase customer's outstanding exposure
    await tx.customer.update({
      where: { id: customer.id },
      data: { outstandingAmt: { increment: invoiceTotal } },
    });

    return created;
  });

  console.log(`Created Sales Invoice: ${invoice.code} (ID: ${invoice.id}) for ₹${invoiceTotal.toFixed(2)} (Net: ₹${invoiceSubtotal.toFixed(2)}, GST: ₹${invoiceTax.toFixed(2)})`);

  // Verify LedgerPosting for invoice creation
  const invoicePostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: PostingSourceType.SALES_INVOICE },
    include: { account: true },
  });

  console.log(`Found ${invoicePostings.length} LedgerPostings for invoice creation:`);
  invoicePostings.forEach((p) => {
    console.log(`  - Account: ${p.account.code} (${p.account.name}), Side: ${p.side}, Amount: ₹${Number(p.amount).toFixed(2)}, Type: ${p.sourceType}`);
  });

  if (invoicePostings.length !== 3) {
    console.error(`ERROR: Expected exactly 3 postings (AR, Revenue, Output GST), got ${invoicePostings.length}`);
    process.exit(1);
  }

  const arDebit = invoicePostings.find((p) => p.side === PostingSide.DEBIT && p.account.code === "1100");
  const revCredit = invoicePostings.find((p) => p.side === PostingSide.CREDIT && p.account.code === "4000");
  const taxCredit = invoicePostings.find((p) => p.side === PostingSide.CREDIT && p.account.code === "2100");

  if (!arDebit || !revCredit || !taxCredit) {
    console.error("ERROR: Did not find required Debit 1100, Credit 4000, and Credit 2100 postings!");
    process.exit(1);
  }
  if (Number(arDebit.amount) !== invoiceTotal) {
    console.error("ERROR: AR Debit does not match gross invoice total!");
    process.exit(1);
  }
  if (Number(revCredit.amount) !== invoiceSubtotal) {
    console.error("ERROR: Revenue Credit does not match net subtotal!");
    process.exit(1);
  }
  if (Number(taxCredit.amount) !== invoiceTax) {
    console.error("ERROR: Tax Credit does not match GST tax amount!");
    process.exit(1);
  }
  if (Number(revCredit.amount) + Number(taxCredit.amount) !== Number(arDebit.amount)) {
    console.error("ERROR: Double entry equality violated! Credits do not equal Debits!");
    process.exit(1);
  }
  console.log("SUCCESS: Initial invoice 3-way split (AR Debit 1100 / Revenue Credit 4000 / Output GST Credit 2100) verified!");

  // STEP 4: Record Partial Payment (₹50,000) via /api/finance/receivable/[invoiceId]/receive
  console.log("\n[STEP 4] Recording partial payment of ₹50,000.00 via receive API...");
  const partialAmount = 50000.00;

  const partialReq = new Request(`http://localhost/api/finance/receivable/${invoice.id}/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": adminUser.id,
    },
    body: JSON.stringify({ amount: partialAmount }),
  });

  const partialRes = await receivePayment(partialReq, {
    params: Promise.resolve({ invoiceId: invoice.id }),
  });
  const partialBody = await partialRes.json();
  console.log(`Partial Payment Response Status: ${partialRes.status}`);

  if (partialRes.status !== 200) {
    console.error("ERROR: Partial payment failed!", partialBody);
    process.exit(1);
  }

  console.log(`Invoice status after partial payment: ${partialBody.status} (Expected: PART_PAID)`);
  console.log(`Invoice paid amount: ₹${Number(partialBody.paidAmount).toFixed(2)}`);

  if (partialBody.status !== SalesInvoiceStatus.PART_PAID || Number(partialBody.paidAmount) !== partialAmount) {
    console.error("ERROR: Invoice did not transition to PART_PAID or paidAmount is incorrect!");
    process.exit(1);
  }

  // Verify LedgerPosting for partial payment: Debit 1000 (Bank) / Credit 1100 (AR)
  const partialPostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: PostingSourceType.PAYMENT },
    include: { account: true },
  });

  console.log(`Found ${partialPostings.length} LedgerPostings for payment:`);
  partialPostings.forEach((p) => {
    console.log(`  - Account: ${p.account.code} (${p.account.name}), Side: ${p.side}, Amount: ₹${Number(p.amount).toFixed(2)}, Type: ${p.sourceType}`);
  });

  const bankDebit1 = partialPostings.find((p) => p.side === PostingSide.DEBIT && p.account.code === "1000");
  const arCredit1 = partialPostings.find((p) => p.side === PostingSide.CREDIT && p.account.code === "1100");

  if (!bankDebit1 || !arCredit1) {
    console.error("ERROR: Expected Debit 1000 (Bank) and Credit 1100 (AR) for payment!");
    process.exit(1);
  }
  console.log("SUCCESS: Partial payment ledger postings (Debit 1000 / Credit 1100) verified!");

  // STEP 5: Record Final Payment (₹100,000) to settle invoice
  console.log("\n[STEP 5] Recording final payment of ₹100,000.00 to fully settle invoice...");
  const finalAmount = 100000.00;

  const finalReq = new Request(`http://localhost/api/finance/receivable/${invoice.id}/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": adminUser.id,
    },
    body: JSON.stringify({ amount: finalAmount }),
  });

  const finalRes = await receivePayment(finalReq, {
    params: Promise.resolve({ invoiceId: invoice.id }),
  });
  const finalBody = await finalRes.json();
  console.log(`Final Payment Response Status: ${finalRes.status}`);

  if (finalRes.status !== 200) {
    console.error("ERROR: Final payment failed!", finalBody);
    process.exit(1);
  }

  console.log(`Invoice status after final payment: ${finalBody.status} (Expected: PAID)`);
  console.log(`Invoice total paid: ₹${Number(finalBody.paidAmount).toFixed(2)} / ₹${invoiceTotal.toFixed(2)}`);

  if (finalBody.status !== SalesInvoiceStatus.PAID || Number(finalBody.paidAmount) !== invoiceTotal) {
    console.error("ERROR: Invoice did not transition to PAID or total is not settled!");
    process.exit(1);
  }
  console.log("SUCCESS: Invoice transitioned to PAID and is fully settled!");

  // STEP 6: Verify Account Balances & Ledger Reconciliation for this invoice
  console.log("\n[STEP 6] Account Balances & Ledger Reconciliation for this invoice:");
  const allInvoicePostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id },
    include: { account: true },
    orderBy: { createdAt: "asc" },
  });

  console.log("\nAll Ledger Postings for this transaction chain:");
  allInvoicePostings.forEach((p, idx) => {
    console.log(`  ${idx + 1}. [${p.sourceType}] ${p.side} ${p.account.code} (${p.account.name}): ₹${Number(p.amount).toFixed(2)}`);
  });

  // Calculate Net AR balance (should be 0 after full settlement)
  const arDebits = allInvoicePostings
    .filter((p) => p.account.code === "1100" && p.side === PostingSide.DEBIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const arCredits = allInvoicePostings
    .filter((p) => p.account.code === "1100" && p.side === PostingSide.CREDIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const netArBalance = arDebits - arCredits;

  // Calculate Total Cash/Bank Received
  const bankDebits = allInvoicePostings
    .filter((p) => p.account.code === "1000" && p.side === PostingSide.DEBIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Calculate Total Sales Revenue Recognized
  const revCredits = allInvoicePostings
    .filter((p) => p.account.code === "4000" && p.side === PostingSide.CREDIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Calculate Total Output GST Liability Recognized
  const taxCredits = allInvoicePostings
    .filter((p) => p.account.code === "2100" && p.side === PostingSide.CREDIT)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  console.log("\nLedger Summary for Invoice:");
  console.log(`  Net Sales Revenue Recognized (Account 4000 Credit): ₹${revCredits.toFixed(2)}`);
  console.log(`  Output GST Liability Recognized (Account 2100 Credit): ₹${taxCredits.toFixed(2)}`);
  console.log(`  Total Cash/Bank Inflow (Account 1000 Debit):        ₹${bankDebits.toFixed(2)}`);
  console.log(`  Accounts Receivable Debits (Invoiced):             ₹${arDebits.toFixed(2)}`);
  console.log(`  Accounts Receivable Credits (Collected):           ₹${arCredits.toFixed(2)}`);
  console.log(`  Net Accounts Receivable Balance (1100):            ₹${netArBalance.toFixed(2)} (Expected: ₹0.00)`);

  if (Math.abs(netArBalance) > 0.001) {
    console.error(`ERROR: AR Account balance is not zero after full settlement! Got ₹${netArBalance.toFixed(2)}`);
    process.exit(1);
  }
  if (Math.abs(revCredits + taxCredits - arDebits) > 0.001) {
    console.error(`ERROR: Revenue + Tax does not match AR Invoiced! Got ₹${(revCredits + taxCredits).toFixed(2)} vs ₹${arDebits.toFixed(2)}`);
    process.exit(1);
  }

  // STEP 7: Security verification: Test unauthenticated request rejection
  console.log("\n[STEP 7] Verifying security rejection on unauthenticated request...");
  const unauthReq = new Request(`http://localhost/api/finance/receivable/${invoice.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 100 }),
  });
  const unauthRes = await receivePayment(unauthReq, {
    params: Promise.resolve({ invoiceId: invoice.id }),
  });
  console.log(`Unauthenticated Request Status: ${unauthRes.status} (Expected: 401)`);
  if (unauthRes.status !== 401) {
    console.error("ERROR: Unauthenticated request was not rejected with 401!");
    process.exit(1);
  }
  console.log("SUCCESS: Unauthenticated request correctly rejected with 401.");

  // STEP 8: Check 1 & Check 3 — Segregation of Duties & RBAC authorization
  console.log("\n[STEP 8] Verifying Segregation of Duties & RBAC authorization...");
  let salesUser = await prisma.user.findFirst({ where: { role: "SALES" } });
  if (!salesUser) {
    salesUser = await prisma.user.create({
      data: {
        email: `sales-test-${Date.now()}@example.com`,
        name: "Test Sales User",
        role: "SALES",
        passwordHash: "test_hash",
      },
    });
  }

  let financeUser = await prisma.user.findFirst({ where: { role: "FINANCE" } });
  if (!financeUser) {
    financeUser = await prisma.user.create({
      data: {
        email: `finance-test-${Date.now()}@example.com`,
        name: "Test Finance User",
        role: "FINANCE",
        passwordHash: "test_hash",
      },
    });
  }

  // 8a: Sales user attempting GET /api/finance/receivable -> Expect 403
  const salesGetReq = new Request("http://localhost/api/finance/receivable", {
    method: "GET",
    headers: { "x-test-user-id": salesUser.id },
  });
  const salesGetRes = await getReceivables(salesGetReq);
  console.log(`Sales GET /api/finance/receivable status: ${salesGetRes.status} (Expected: 403)`);
  if (salesGetRes.status !== 403) {
    console.error("ERROR: Sales role was not rejected with 403 on GET /api/finance/receivable!");
    process.exit(1);
  }

  // 8b: Sales user attempting POST /api/finance/receivable/[id]/receive -> Expect 403
  const salesPostReq = new Request(`http://localhost/api/finance/receivable/${invoice.id}/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": salesUser.id,
    },
    body: JSON.stringify({ amount: 100 }),
  });
  const salesPostRes = await receivePayment(salesPostReq, {
    params: Promise.resolve({ invoiceId: invoice.id }),
  });
  console.log(`Sales POST /receive status: ${salesPostRes.status} (Expected: 403)`);
  if (salesPostRes.status !== 403) {
    console.error("ERROR: Sales role was not rejected with 403 on POST receive payment!");
    process.exit(1);
  }

  // 8c: Finance user attempting GET /api/finance/receivable -> Expect 200
  const finGetReq = new Request("http://localhost/api/finance/receivable", {
    method: "GET",
    headers: { "x-test-user-id": financeUser.id },
  });
  const finGetRes = await getReceivables(finGetReq);
  console.log(`Finance GET /api/finance/receivable status: ${finGetRes.status} (Expected: 200)`);
  if (finGetRes.status !== 200) {
    console.error("ERROR: Finance role was rejected on GET /api/finance/receivable!");
    process.exit(1);
  }
  console.log("SUCCESS: Segregation of duties verified — Sales cannot view/receive, Finance can!");

  // STEP 9: Check 2 — Concurrency & Atomicity (Race Condition Prevention)
  console.log("\n[STEP 9] Verifying Atomicity & Concurrency Lock on concurrent receive requests...");
  const concurrentInvoice = await prisma.salesInvoice.create({
    data: {
      code: `INV-RACE-${Date.now().toString().slice(-4)}`,
      status: SalesInvoiceStatus.RAISED,
      salesOrderId: salesOrder.id,
      customerId: customer.id,
      subtotal: 8474.58,
      taxAmount: 1525.42,
      totalValue: 10000.00,
      paidAmount: 0.00,
      raisedById: adminUser.id,
    },
  });

  // Launch two concurrent payment requests of ₹7,000 each against the ₹10,000 invoice
  const reqA = new Request(`http://localhost/api/finance/receivable/${concurrentInvoice.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user-id": financeUser.id },
    body: JSON.stringify({ amount: 7000 }),
  });
  const reqB = new Request(`http://localhost/api/finance/receivable/${concurrentInvoice.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user-id": financeUser.id },
    body: JSON.stringify({ amount: 7000 }),
  });

  const [resA, resB] = await Promise.all([
    receivePayment(reqA, { params: Promise.resolve({ invoiceId: concurrentInvoice.id }) }),
    receivePayment(reqB, { params: Promise.resolve({ invoiceId: concurrentInvoice.id }) }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  console.log(`Concurrent payment statuses: [${resA.status}, ${resB.status}] (Expected: [200, 400])`);

  if (statuses[0] !== 200 || statuses[1] !== 400) {
    console.error("ERROR: Concurrency test failed! Both requests did not serialize properly:", statuses);
    process.exit(1);
  }

  const updatedConcurrentInv = await prisma.salesInvoice.findUnique({
    where: { id: concurrentInvoice.id },
  });
  console.log(`Final paid amount after concurrent attempts: ₹${Number(updatedConcurrentInv?.paidAmount).toFixed(2)} (Expected: ₹7000.00)`);
  if (Number(updatedConcurrentInv?.paidAmount) !== 7000) {
    console.error(`ERROR: Concurrent overpayment occurred! Paid amount is ₹${updatedConcurrentInv?.paidAmount}`);
    process.exit(1);
  }
  console.log("SUCCESS: Row-level lock serialized concurrent requests — one succeeded, one rejected!");

  // STEP 10: Check 5 — Validation location in postBankTransaction
  console.log("\n[STEP 10] Verifying validation inside postBankTransaction primitive...");
  let negativeAmountCaught = false;
  try {
    await prisma.$transaction(async (tx) => {
      await postBankTransaction({
        tx,
        direction: "IN",
        counterpartyAccountCode: "1100",
        amount: -100,
        sourceType: PostingSourceType.PAYMENT,
        sourceId: "test-negative",
      });
    });
  } catch (err: any) {
    if (err.message.includes("greater than zero")) {
      negativeAmountCaught = true;
    }
  }

  if (!negativeAmountCaught) {
    console.error("ERROR: postBankTransaction failed to reject negative amount internally!");
    process.exit(1);
  }
  console.log("  - Negative amount validation inside postBankTransaction: PASSED");

  let missingAccountCaught = false;
  try {
    await prisma.$transaction(async (tx) => {
      await postBankTransaction({
        tx,
        direction: "IN",
        counterpartyAccountCode: "999999",
        amount: 500,
        sourceType: PostingSourceType.PAYMENT,
        sourceId: "test-missing-account",
      });
    });
  } catch (err: any) {
    if (err.message.includes("was not found")) {
      missingAccountCaught = true;
    }
  }

  if (!missingAccountCaught) {
    console.error("ERROR: postBankTransaction failed to reject missing counterparty account internally!");
    process.exit(1);
  }
  console.log("  - Account existence validation inside postBankTransaction: PASSED");
  console.log("SUCCESS: postBankTransaction self-validates amount and accounts internally!");

  // STEP 11: Invoice 23,600 + Return Credit 11,800 -> balance 11,800; paying 23,600 rejected; paying 11,800 -> PAID; customer.outstandingAmt back to pre-invoice
  console.log("\n[STEP 11] Verifying Sales Return Credit integration on Sales Invoice (₹23,600 total + ₹11,800 credit)...");
  
  let testProject = await prisma.project.findFirst();
  if (!testProject) {
    testProject = await prisma.project.create({
      data: {
        code: `PRJ-AR-${Date.now().toString().slice(-4)}`,
        name: "Test AR Project",
        application: "Test AR compound",
      },
    });
  }

  const custBefore11 = await prisma.customer.findUnique({ where: { id: customer.id } });
  const preInvoiceOutstanding11 = Number(custBefore11?.outstandingAmt || 0);

  // Create SO and line for 100kg @ ₹200/kg + 18% GST = ₹23,600
  const so11 = await prisma.salesOrder.create({
    data: {
      code: `SO-CR-${Date.now().toString().slice(-4)}`,
      status: "CONFIRMED",
      customerId: customer.id,
      subtotal: 20000,
      taxAmount: 3600,
      totalValue: 23600,
      lines: {
        create: [
          {
            lineNo: 1,
            projectId: testProject.id,
            ratePerKg: 200,
            taxPct: 18,
            quantityKg: 100,
            dispatchedKg: 100,
            lineTotal: 20000,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const soLine11Id = so11.lines[0]!.id;

  // Create Invoice 23,600 and increment customer outstanding
  const inv11 = await prisma.salesInvoice.create({
    data: {
      code: `INV-CR-${Date.now().toString().slice(-4)}`,
      status: SalesInvoiceStatus.RAISED,
      salesOrderId: so11.id,
      customerId: customer.id,
      subtotal: 20000,
      taxAmount: 3600,
      totalValue: 23600,
      paidAmount: 0,
      creditedAmount: 0,
      raisedById: adminUser.id,
    },
  });

  await prisma.customer.update({
    where: { id: customer.id },
    data: { outstandingAmt: { increment: 23600 } },
  });

  // Create Sales Return for 50kg (50 * 200 = 10,000 + 1,800 GST = ₹11,800 credit)
  const ret11 = await prisma.salesReturn.create({
    data: {
      code: `SRN-CR-${Date.now().toString().slice(-4)}`,
      status: "PENDING_QC",
      salesOrderId: so11.id,
      customerId: customer.id,
      receivedById: adminUser.id,
      lines: {
        create: [
          {
            lineNo: 1,
            projectId: testProject.id,
            salesOrderLineId: soLine11Id,
            quantityKg: 50,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const retLine11Id = ret11.lines[0]!.id;

  const { inspectSalesReturnCore } = require("../src/app/(app)/sales/sales-core");
  const { QcResult } = require("@prisma/client");

  const settle11Payload = JSON.stringify([
    {
      lineId: retLine11Id,
      restockedKg: 50,
      scrappedKg: 0,
      resendKg: 0,
      qcResult: QcResult.PASS,
    },
  ]);

  const settle11Res = await inspectSalesReturnCore(adminUser.id, ret11.id, settle11Payload, "Return 50kg for credit");
  if (settle11Res.error) {
    console.error("ERROR: Failed to settle return for step 11:", settle11Res.error);
    process.exit(1);
  }

  // Verify CreditNote record created for step 11
  const cn11 = await prisma.creditNote.findUnique({
    where: { salesReturnId_salesInvoiceId: { salesReturnId: ret11.id, salesInvoiceId: inv11.id } },
    include: { lines: true },
  });
  console.log(`  - CreditNote created: ${cn11?.number}, totalValue: ₹${Number(cn11?.totalValue).toFixed(2)}, taxAmount: ₹${Number(cn11?.taxAmount).toFixed(2)}, taxableValue: ₹${Number(cn11?.taxableValue).toFixed(2)}`);
  if (!cn11 || Number(cn11.totalValue) !== 11800 || Number(cn11.taxAmount) !== 1800 || Number(cn11.taxableValue) !== 10000) {
    console.error("ERROR: CreditNote header was not created correctly for Step 11!", cn11);
    process.exit(1);
  }
  if (cn11.lines.length !== 1 || Number(cn11.lines[0]?.totalValue) !== 11800) {
    console.error("ERROR: CreditNoteLine was not created correctly for Step 11!", cn11?.lines);
    process.exit(1);
  }
  // Verify postings sourceType is CREDIT_NOTE and references cn11.number
  const cnPostings11 = await prisma.ledgerPosting.findMany({ where: { sourceId: ret11.id } });
  const allCnPostings = cnPostings11.every((p) => p.sourceType === "CREDIT_NOTE" && p.remark?.includes(cn11.number));
  console.log(`  - Postings have sourceType CREDIT_NOTE & reference ${cn11.number}: ${allCnPostings}`);
  if (!allCnPostings || cnPostings11.length !== 3) {
    console.error("ERROR: Postings for return credit do not have sourceType CREDIT_NOTE or missing CN number reference!", cnPostings11);
    process.exit(1);
  }

  // Verify Invoice creditedAmount and balance
  const inv11AfterReturn = await prisma.salesInvoice.findUnique({ where: { id: inv11.id } });
  console.log(`  - Invoice creditedAmount: ₹${Number(inv11AfterReturn?.creditedAmount).toFixed(2)} (Expected: ₹11800.00)`);
  console.log(`  - Invoice status: ${inv11AfterReturn?.status} (Expected: RAISED)`);
  if (Number(inv11AfterReturn?.creditedAmount) !== 11800) {
    console.error("ERROR: Invoice creditedAmount was not updated to ₹11800.00!");
    process.exit(1);
  }

  const balance11 = Number(inv11AfterReturn!.totalValue) - Number(inv11AfterReturn!.paidAmount) - Number(inv11AfterReturn!.creditedAmount);
  console.log(`  - Calculated remaining balance: ₹${balance11.toFixed(2)} (Expected: ₹11800.00)`);
  if (balance11 !== 11800) {
    console.error(`ERROR: Expected remaining balance of ₹11800.00, got ₹${balance11}`);
    process.exit(1);
  }

  // Attempting to pay full ₹23,600 must be rejected
  console.log("  - Attempting to receive ₹23,600 payment against invoice with ₹11,800 balance...");
  const pay23600Req = new Request(`http://localhost/api/finance/receivable/${inv11.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
    body: JSON.stringify({ amount: 23600 }),
  });
  const pay23600Res = await receivePayment(pay23600Req, { params: Promise.resolve({ invoiceId: inv11.id }) });
  const pay23600Body = await pay23600Res.json();
  console.log(`  - Response status: ${pay23600Res.status} (Expected: 400 or 500 rejection)`);
  if (pay23600Res.status === 200) {
    console.error("ERROR: Payment of ₹23,600 should have been rejected due to credit reduction!");
    process.exit(1);
  }
  console.log("  SUCCESS: Overpayment of ₹23,600 rejected as expected!");

  // Paying exactly ₹11,800 must succeed and move invoice to PAID
  console.log("  - Receiving payment of remaining balance ₹11,800...");
  const pay11800Req = new Request(`http://localhost/api/finance/receivable/${inv11.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
    body: JSON.stringify({ amount: 11800 }),
  });
  const pay11800Res = await receivePayment(pay11800Req, { params: Promise.resolve({ invoiceId: inv11.id }) });
  const pay11800Body = await pay11800Res.json();
  if (pay11800Res.status !== 200) {
    console.error("ERROR: Payment of ₹11,800 failed:", pay11800Body);
    process.exit(1);
  }
  console.log(`  - Invoice status after payment: ${pay11800Body.status} (Expected: PAID)`);
  if (pay11800Body.status !== SalesInvoiceStatus.PAID) {
    console.error(`ERROR: Expected status PAID, got ${pay11800Body.status}`);
    process.exit(1);
  }

  // Customer outstandingAmt must be back to pre-invoice value
  const custAfter11 = await prisma.customer.findUnique({ where: { id: customer.id } });
  const postPaymentOutstanding11 = Number(custAfter11?.outstandingAmt || 0);
  console.log(`  - Customer outstanding: ₹${postPaymentOutstanding11.toFixed(2)} (Expected pre-invoice: ₹${preInvoiceOutstanding11.toFixed(2)})`);
  if (Math.abs(postPaymentOutstanding11 - preInvoiceOutstanding11) > 0.01) {
    console.error(`ERROR: Customer outstanding ₹${postPaymentOutstanding11} does not match pre-invoice value ₹${preInvoiceOutstanding11}!`);
    process.exit(1);
  }
  console.log("SUCCESS: Step 11 invoice return credit & settlement verified!");

  // STEP 12: Credit applied on a PART_PAID invoice
  console.log("\n[STEP 12] Verifying Credit applied on a PART_PAID invoice...");
  const so12 = await prisma.salesOrder.create({
    data: {
      code: `SO-CR2-${Date.now().toString().slice(-4)}`,
      status: "CONFIRMED",
      customerId: customer.id,
      subtotal: 10000,
      taxAmount: 1800,
      totalValue: 11800,
      lines: {
        create: [
          { lineNo: 1, projectId: testProject.id, ratePerKg: 100, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 10000 },
        ],
      },
    },
    include: { lines: true },
  });

  const soLine12Id = so12.lines[0]!.id;

  const inv12 = await prisma.salesInvoice.create({
    data: {
      code: `INV-CR2-${Date.now().toString().slice(-4)}`,
      status: SalesInvoiceStatus.RAISED,
      salesOrderId: so12.id,
      customerId: customer.id,
      subtotal: 10000,
      taxAmount: 1800,
      totalValue: 11800,
      paidAmount: 0,
      creditedAmount: 0,
      raisedById: adminUser.id,
    },
  });

  // Pay ₹5,000 -> invoice becomes PART_PAID with balance ₹6,800
  const payPartReq = new Request(`http://localhost/api/finance/receivable/${inv12.id}/receive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
    body: JSON.stringify({ amount: 5000 }),
  });
  await receivePayment(payPartReq, { params: Promise.resolve({ invoiceId: inv12.id }) });

  const inv12Part = await prisma.salesInvoice.findUnique({ where: { id: inv12.id } });
  console.log(`  - Invoice status after ₹5,000 payment: ${inv12Part?.status} (Expected: PART_PAID)`);

  // Return 50kg (50 * 100 = 5,000 + 900 = ₹5,900 credit)
  const ret12 = await prisma.salesReturn.create({
    data: {
      code: `SRN-CR2-${Date.now().toString().slice(-4)}`,
      status: "PENDING_QC",
      salesOrderId: so12.id,
      customerId: customer.id,
      receivedById: adminUser.id,
      lines: { create: [{ lineNo: 1, projectId: testProject.id, salesOrderLineId: soLine12Id, quantityKg: 50 }] },
    },
    include: { lines: true },
  });

  const retLine12Id = ret12.lines[0]!.id;

  const settle12Res = await inspectSalesReturnCore(
    adminUser.id,
    ret12.id,
    JSON.stringify([{ lineId: retLine12Id, restockedKg: 50, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS }]),
    "Return 50kg for part-paid invoice"
  );
  if (settle12Res.error) {
    console.error("ERROR: Settle 12 failed:", settle12Res.error);
    process.exit(1);
  }

  const inv12AfterReturn = await prisma.salesInvoice.findUnique({ where: { id: inv12.id } });
  const remaining12 = Number(inv12AfterReturn!.totalValue) - Number(inv12AfterReturn!.paidAmount) - Number(inv12AfterReturn!.creditedAmount);
  console.log(`  - Invoice creditedAmount: ₹${Number(inv12AfterReturn?.creditedAmount).toFixed(2)} (Expected: ₹5900.00)`);
  console.log(`  - Remaining balance: ₹${remaining12.toFixed(2)} (Expected: ₹900.00: 11800 - 5000 - 5900)`);
  if (Math.abs(remaining12 - 900) > 0.01) {
    console.error(`ERROR: Expected balance ₹900.00, got ₹${remaining12}`);
    process.exit(1);
  }
  console.log("SUCCESS: Step 12 credit on PART_PAID invoice verified!");

  // STEP 13: Credit larger than balance (excess unapplied)
  console.log("\n[STEP 13] Verifying Credit larger than remaining balance (excess unapplied)...");
  const so13 = await prisma.salesOrder.create({
    data: {
      code: `SO-CR3-${Date.now().toString().slice(-4)}`,
      status: "CONFIRMED",
      customerId: customer.id,
      subtotal: 5000,
      taxAmount: 900,
      totalValue: 5900,
      lines: {
        create: [
          { lineNo: 1, projectId: testProject.id, ratePerKg: 100, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 10000 },
        ],
      },
    },
    include: { lines: true },
  });

  const soLine13Id = so13.lines[0]!.id;

  // Invoice total is only ₹5,900
  const inv13 = await prisma.salesInvoice.create({
    data: {
      code: `INV-CR3-${Date.now().toString().slice(-4)}`,
      status: SalesInvoiceStatus.RAISED,
      salesOrderId: so13.id,
      customerId: customer.id,
      subtotal: 5000,
      taxAmount: 900,
      totalValue: 5900,
      paidAmount: 0,
      creditedAmount: 0,
      raisedById: adminUser.id,
    },
  });

  // Return is 100kg = ₹10,000 + ₹1,800 GST = ₹11,800 credit (> ₹5,900 balance)
  const ret13 = await prisma.salesReturn.create({
    data: {
      code: `SRN-CR3-${Date.now().toString().slice(-4)}`,
      status: "PENDING_QC",
      salesOrderId: so13.id,
      customerId: customer.id,
      receivedById: adminUser.id,
      lines: { create: [{ lineNo: 1, projectId: testProject.id, salesOrderLineId: soLine13Id, quantityKg: 100 }] },
    },
    include: { lines: true },
  });

  const retLine13Id = ret13.lines[0]!.id;

  const settle13Res = await inspectSalesReturnCore(
    adminUser.id,
    ret13.id,
    JSON.stringify([{ lineId: retLine13Id, restockedKg: 100, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS }]),
    "Return 100kg with excess credit"
  );
  if (settle13Res.error) {
    console.error("ERROR: Settle 13 failed:", settle13Res.error);
    process.exit(1);
  }

  const inv13After = await prisma.salesInvoice.findUnique({ where: { id: inv13.id } });
  console.log(`  - Invoice creditedAmount: ₹${Number(inv13After?.creditedAmount).toFixed(2)} (Expected: ₹5900.00, capped at total)`);
  console.log(`  - Invoice status: ${inv13After?.status} (Expected: PAID)`);
  if (Number(inv13After?.creditedAmount) !== 5900 || inv13After?.status !== SalesInvoiceStatus.PAID) {
    console.error("ERROR: Invoice was not capped at ₹5900 or not marked PAID!");
    process.exit(1);
  }

  // Check AuditEvent summary for excess note
  const audit13 = await prisma.auditEvent.findFirst({
    where: { entityType: "SalesReturn", entityId: ret13.id, action: "CREDIT" },
  });
  console.log(`  - AuditEvent summary: "${audit13?.summary}"`);
  if (!audit13?.summary.includes("Excess unapplied: ₹5900.00")) {
    console.error("ERROR: Audit event did not record unapplied excess!");
    process.exit(1);
  }
  console.log("SUCCESS: Step 13 excess unapplied credit verified!");

  // STEP 14: Verifying Re-running inspectSalesReturnCore for the same return must not credit twice
  console.log("\n[STEP 14] Verifying Re-running inspectSalesReturnCore for the same return does not credit twice...");
  const custBefore14 = await prisma.customer.findUnique({ where: { id: customer.id } });
  const custOutstandingBefore14 = Number(custBefore14?.outstandingAmt || 0);

  const inv13Before14 = await prisma.salesInvoice.findUnique({ where: { id: inv13.id } });
  const inv13CreditedBefore14 = Number(inv13Before14?.creditedAmount || 0);

  const postingsCountBefore14 = await prisma.ledgerPosting.count({
    where: { sourceId: ret13.id },
  });

  // Re-run inspection on already settled return
  const duplicateSettleRes = await inspectSalesReturnCore(
    adminUser.id,
    ret13.id,
    JSON.stringify([{ lineId: retLine13Id, restockedKg: 100, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS }]),
    "Duplicate inspection attempt"
  );

  console.log(`  - Re-run response error: "${duplicateSettleRes.error}" (Expected: settled error)`);
  if (!duplicateSettleRes.error) {
    console.error("ERROR: Re-running inspectSalesReturnCore should have failed with an error!");
    process.exit(1);
  }

  const inv13After14 = await prisma.salesInvoice.findUnique({ where: { id: inv13.id } });
  const inv13CreditedAfter14 = Number(inv13After14?.creditedAmount || 0);
  console.log(`  - Invoice creditedAmount after re-run: ₹${inv13CreditedAfter14.toFixed(2)} (Expected: ₹${inv13CreditedBefore14.toFixed(2)})`);
  if (Math.abs(inv13CreditedAfter14 - inv13CreditedBefore14) > 0.001) {
    console.error(`ERROR: Invoice creditedAmount changed from ₹${inv13CreditedBefore14} to ₹${inv13CreditedAfter14}!`);
    process.exit(1);
  }

  const custAfter14 = await prisma.customer.findUnique({ where: { id: customer.id } });
  const custOutstandingAfter14 = Number(custAfter14?.outstandingAmt || 0);
  console.log(`  - Customer outstanding after re-run: ₹${custOutstandingAfter14.toFixed(2)} (Expected: ₹${custOutstandingBefore14.toFixed(2)})`);
  if (Math.abs(custOutstandingAfter14 - custOutstandingBefore14) > 0.001) {
    console.error(`ERROR: Customer outstanding changed from ₹${custOutstandingBefore14} to ₹${custOutstandingAfter14}!`);
    process.exit(1);
  }

  const postingsCountAfter14 = await prisma.ledgerPosting.count({
    where: { sourceId: ret13.id },
  });
  console.log(`  - Postings count after re-run: ${postingsCountAfter14} (Expected: ${postingsCountBefore14})`);
  if (postingsCountAfter14 !== postingsCountBefore14) {
    console.error(`ERROR: Duplicate ledger postings created! Found ${postingsCountAfter14}, expected ${postingsCountBefore14}.`);
    process.exit(1);
  }
  console.log("SUCCESS: Step 14 re-running inspectSalesReturnCore did not credit twice!");

  // STEP 15: Verifying a fully credited invoice marked PAID does not count in customer outstanding
  console.log("\n[STEP 15] Verifying a fully credited invoice marked PAID does not count in customer outstanding...");
  const cust15 = await prisma.customer.create({
    data: {
      code: `CUST-F3-${Date.now().toString().slice(-4)}`,
      name: `F3 Credit Test Customer ${Date.now().toString().slice(-4)}`,
      creditLimit: 50000,
      outstandingAmt: 0,
      industry: Industry.OTHER,
    },
  });

  const so15 = await prisma.salesOrder.create({
    data: {
      code: `SO-F3-${Date.now().toString().slice(-4)}`,
      status: "INVOICED",
      customerId: cust15.id,
      subtotal: 5000,
      taxAmount: 900,
      totalValue: 5900,
      lines: {
        create: [
          { lineNo: 1, projectId: testProject.id, ratePerKg: 100, taxPct: 18, quantityKg: 50, dispatchedKg: 50, lineTotal: 5900 },
        ],
      },
    },
    include: { lines: true },
  });
  const soLine15Id = so15.lines[0]!.id;

  const inv15 = await prisma.salesInvoice.create({
    data: {
      code: `INV-F3-${Date.now().toString().slice(-4)}`,
      status: SalesInvoiceStatus.RAISED,
      salesOrderId: so15.id,
      customerId: cust15.id,
      subtotal: 5000,
      taxAmount: 900,
      totalValue: 5900,
      paidAmount: 0,
      creditedAmount: 0,
      raisedById: adminUser.id,
    },
  });

  // Increment customer outstanding by ₹5,900 (as raiseSalesInvoiceCore does)
  await prisma.customer.update({
    where: { id: cust15.id },
    data: { outstandingAmt: 5900 },
  });

  // Create return for the entire 50kg (= ₹5,000 + ₹900 tax = ₹5,900 full credit)
  const ret15 = await prisma.salesReturn.create({
    data: {
      code: `SRN-F3-${Date.now().toString().slice(-4)}`,
      status: "PENDING_QC",
      salesOrderId: so15.id,
      customerId: cust15.id,
      receivedById: adminUser.id,
      lines: { create: [{ lineNo: 1, projectId: testProject.id, salesOrderLineId: soLine15Id, quantityKg: 50 }] },
    },
    include: { lines: true },
  });
  const retLine15Id = ret15.lines[0]!.id;

  // Inspect and settle return
  const settle15Res = await inspectSalesReturnCore(
    adminUser.id,
    ret15.id,
    JSON.stringify([{ lineId: retLine15Id, restockedKg: 50, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS }]),
    "Full credit return"
  );
  if (settle15Res.error) {
    console.error("ERROR: Settle 15 failed:", settle15Res.error);
    process.exit(1);
  }

  // 1. Verify invoice is PAID and fully credited
  const inv15After = await prisma.salesInvoice.findUnique({ where: { id: inv15.id } });
  console.log(`  - Invoice status: ${inv15After?.status} (Expected: PAID)`);
  console.log(`  - Invoice creditedAmount: ₹${Number(inv15After?.creditedAmount).toFixed(2)} (Expected: ₹5900.00)`);
  const inv15Remaining = Math.max(0, Number(inv15After?.totalValue) - Number(inv15After?.paidAmount) - Number(inv15After?.creditedAmount));
  console.log(`  - Invoice remaining balance: ₹${inv15Remaining.toFixed(2)} (Expected: ₹0.00)`);
  if (inv15After?.status !== SalesInvoiceStatus.PAID || Math.abs(inv15Remaining) > 0.01) {
    console.error(`ERROR: Fully credited invoice is not PAID or balance is not 0!`);
    process.exit(1);
  }

  // 2. Verify customer.outstandingAmt is 0 (decremented by the credit)
  const cust15After = await prisma.customer.findUnique({ where: { id: cust15.id } });
  const cust15Outstanding = Number(cust15After?.outstandingAmt || 0);
  console.log(`  - Customer outstandingAmt: ₹${cust15Outstanding.toFixed(2)} (Expected: ₹0.00)`);
  if (Math.abs(cust15Outstanding) > 0.01) {
    console.error(`ERROR: Customer outstandingAmt is ₹${cust15Outstanding}, expected ₹0.00!`);
    process.exit(1);
  }

  // 3. Verify receivable API reports remainingAmount 0
  const recvReq = new Request("http://localhost/api/finance/receivable", {
    method: "GET",
    headers: { "x-test-user-id": adminUser.id },
  });
  const recvRes = await getReceivables(recvReq);
  const recvInvoices = await recvRes.json();
  const recvInv15 = recvInvoices.find((i: any) => i.id === inv15.id);
  console.log(`  - Receivable API remainingAmount: ₹${recvInv15?.remainingAmount} (Expected: 0)`);
  if (recvInv15 && recvInv15.remainingAmount !== 0) {
    console.error(`ERROR: Receivable API reports remainingAmount ₹${recvInv15.remainingAmount} for fully credited invoice!`);
    process.exit(1);
  }

  // 4. Verify confirmSalesOrderCore exposure calculation:
  // cust15 has creditLimit: ₹50,000. New order total is ₹45,000.
  // Because the fully credited invoice does not count in customer outstanding,
  // exposure is 0 (outstanding) + 0 (open orders) + 45000 (new order) = 45000 <= 50000.
  const { confirmSalesOrderCore } = require("../src/app/(app)/sales/sales-core");
  const so15New = await prisma.salesOrder.create({
    data: {
      code: `SO-F3-NEW-${Date.now().toString().slice(-4)}`,
      status: "PENDING_APPROVAL",
      customerId: cust15.id,
      subtotal: 38135.59,
      taxAmount: 6864.41,
      totalValue: 45000,
      raisedById: adminUser.id,
      lines: {
        create: [
          { lineNo: 1, projectId: testProject.id, ratePerKg: 450, taxPct: 18, quantityKg: 100, dispatchedKg: 0, lineTotal: 45000 },
        ],
      },
    },
  });

  const signerUser = (await prisma.user.findFirst({
    where: { role: "ADMIN", id: { not: adminUser.id } },
  })) || (await prisma.user.create({
    data: {
      email: `signer-${Date.now()}@example.com`,
      name: "Second Signer",
      role: "ADMIN",
      passwordHash: "test",
    },
  }));

  const confirmRes = await confirmSalesOrderCore(signerUser.id, so15New.id, "");
  console.log(`  - confirmSalesOrderCore result:`, confirmRes);
  if (confirmRes.error) {
    console.error("ERROR: confirmSalesOrderCore failed unexpectedly:", confirmRes.error);
    process.exit(1);
  }
  console.log("SUCCESS: Step 15 fully credited invoice marked PAID does not count in customer outstanding!");

  console.log("\n=== AR SYSTEM VERIFICATION COMPLETED SUCCESSFULLY ===");
}

runTests()
  .catch((err) => {
    console.error("Fatal Test Run Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
