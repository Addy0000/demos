// Stub server-only, next/cache, and next/navigation in require.cache before requiring actions
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

import { PrismaClient, CostSheetStatus, SalesQuotationStatus, SalesInquiryStatus } from "@prisma/client";
const { createSalesInquiryCore, createSalesQuotationCore, acceptQuotationCore, rejectQuotationCore } = require("../src/app/(app)/sales/sales-core");

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("MODULE 7 (SALES) DAYS 6-7 NEGATIVE TESTS & CONCURRENCY SUITE");
  console.log("================================================================================\n");

  const salesUser = await prisma.user.findUnique({ where: { email: "sales@mavenserp.in" } });
  const financeUser = await prisma.user.findUnique({ where: { email: "finance@mavenserp.in" } });
  if (!salesUser || !financeUser) throw new Error("Missing seeded users");

  const customer = await prisma.customer.findFirst({ where: { code: "CUST-ACME" } }) || await prisma.customer.findFirst();
  const project = await prisma.project.findFirst({ where: { code: "PRJ-CONDUIT-01" }, include: { formulation: true } });
  const project2 = await prisma.project.findFirst({ where: { code: "PRJ-SHEATH-02" }, include: { formulation: true } }) || project;

  if (!customer || !project || !project.formulation || !project2) throw new Error("Missing test seed data");

  // ---------------------------------------------------------------------------
  // STEP 6.1: Quotation on CLOSED, LOST, and WON Inquiries
  // ---------------------------------------------------------------------------
  console.log("--- TEST 6.1: Quotation on CLOSED, LOST, and WON Inquiries ---");
  for (const status of [SalesInquiryStatus.WON, SalesInquiryStatus.LOST, SalesInquiryStatus.CLOSED]) {
    const inq = await prisma.salesInquiry.create({
      data: {
        code: `INQ-TEST-${status}-${Date.now()}`,
        status,
        customerId: customer.id,
        receivedOn: new Date(),
      },
    });

    const formData = new FormData();
    formData.append("customerId", customer.id);
    formData.append("inquiryId", inq.id);
    formData.append("lines", JSON.stringify([{ projectId: project.id, quantityKg: 100, ratePerKg: 150, taxPct: 18 }]));

    const res = await createSalesQuotationCore(salesUser.id, formData);
    console.log(`  Inquiry status ${status} -> Result: ${JSON.stringify(res)}`);
    if (!res.error?.includes("cannot be issued against it")) {
      throw new Error(`FAILED: Quotation creation on ${status} inquiry was not blocked!`);
    }

    await prisma.salesInquiry.delete({ where: { id: inq.id } });
  }
  console.log("  PASS: All closed, lost, and won inquiries correctly blocked.\n");

  // ---------------------------------------------------------------------------
  // TEST 2: Quotation from an UNAPPROVED Cost Sheet
  // ---------------------------------------------------------------------------
  console.log("--- TEST 2: Quotation on Unapproved Cost Sheet ---");
  const unapprovedCs = await prisma.costSheet.create({
    data: {
      code: `CS-TEST-UNAPP-${Date.now()}`,
      status: CostSheetStatus.PENDING_APPROVAL,
      formulationId: project.formulation.id,
      materialCostPerKg: 100,
      conversionPerKg: 10,
      overheadPct: 5,
      marginPct: 10,
      sellingRatePerKg: 126.50,
      preparedById: salesUser.id,
    },
  });

  const qtnUnappFormData = new FormData();
  qtnUnappFormData.append("customerId", customer.id);
  qtnUnappFormData.append("costSheetId", unapprovedCs.id);
  qtnUnappFormData.append("lines", JSON.stringify([{ projectId: project.id, quantityKg: 100, ratePerKg: 130, taxPct: 18 }]));

  const unappRes = await createSalesQuotationCore(salesUser.id, qtnUnappFormData);
  console.log(`  Result: ${JSON.stringify(unappRes)}`);
  if (!unappRes.error?.includes("Quotations require an approved cost sheet")) {
    throw new Error("FAILED: Quotation on unapproved cost sheet was not blocked!");
  }
  await prisma.costSheet.delete({ where: { id: unapprovedCs.id } });
  console.log("  PASS: Blocked quotation on unapproved cost sheet.\n");

  // ---------------------------------------------------------------------------
  // STEP 6.2: Multi-line quotation where only ONE line is below the floor rate
  // ---------------------------------------------------------------------------
  console.log("--- TEST 6.2: Multi-line Quotation with ONE Below-Floor Line ---");
  const approvedCs = await prisma.costSheet.create({
    data: {
      code: `CS-TEST-FLOOR-${Date.now()}`,
      status: CostSheetStatus.APPROVED,
      formulationId: project.formulation.id,
      materialCostPerKg: 100,
      conversionPerKg: 10,
      overheadPct: 5,
      marginPct: 10,
      sellingRatePerKg: 140.00, // Floor rate 140
      preparedById: salesUser.id,
      approvedById: financeUser.id,
      approvedAt: new Date(),
    },
  });

  const multiLineFormData = new FormData();
  multiLineFormData.append("customerId", customer.id);
  multiLineFormData.append("costSheetId", approvedCs.id);
  multiLineFormData.append(
    "lines",
    JSON.stringify([
      { projectId: project.id, quantityKg: 100, ratePerKg: 150.00, taxPct: 18 }, // Line 1 above floor
      { projectId: project.id, quantityKg: 200, ratePerKg: 120.00, taxPct: 18 }, // Line 2 BELOW floor (120 < 140)
    ]),
  );

  const multiRes = await createSalesQuotationCore(salesUser.id, multiLineFormData);
  console.log(`  Result: ${JSON.stringify(multiRes)}`);
  if (!multiRes.error?.includes("below the approved floor rate")) {
    throw new Error("FAILED: Multi-line quotation with 1 below-floor line was not rejected!");
  }
  await prisma.costSheet.delete({ where: { id: approvedCs.id } });
  console.log("  PASS: Multi-line quotation with single below-floor line correctly rejected.\n");

  // ---------------------------------------------------------------------------
  // STEP 6.3: Quotation created with NO cost sheet
  // ---------------------------------------------------------------------------
  console.log("--- TEST 6.3: Direct Quotation with NO Cost Sheet ---");
  const directQtnFormData = new FormData();
  directQtnFormData.append("customerId", customer.id);
  directQtnFormData.append("lines", JSON.stringify([{ projectId: project.id, quantityKg: 100, ratePerKg: 300.00, taxPct: 18 }]));

  let directQtnId = "";
  const directRes = await createSalesQuotationCore(salesUser.id, directQtnFormData).catch((e: any) => {
    if (e.digest?.startsWith("NEXT_REDIRECT")) {
      const parts = e.digest.split(";");
      directQtnId = parts[2].split("/").pop()!;
      return null;
    }
    throw e;
  });

  if (!directQtnId) throw new Error(`FAILED: Direct quotation with no cost sheet was not created. ${JSON.stringify(directRes)}`);
  const directQtn = await prisma.salesQuotation.findUnique({ where: { id: directQtnId } });
  console.log(`  Direct quotation created successfully without cost sheet: ${directQtn?.code}`);
  console.log("  Rate policy rule: Allowed as direct quote, but if an approved cost sheet exists for the project formulation, ratePerKg >= costSheet.sellingRatePerKg is enforced.\n");

  // Clean up direct quotation
  await prisma.salesQuotationLine.deleteMany({ where: { quotationId: directQtnId } });
  await prisma.salesQuotation.delete({ where: { id: directQtnId } });

  // ---------------------------------------------------------------------------
  // STEP 6.4: Sequential Accept on an ALREADY-ACCEPTED Quotation
  // ---------------------------------------------------------------------------
  console.log("--- TEST 6.4: Sequential Accept on ALREADY-ACCEPTED Quotation ---");
  const accQtn = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TEST-ACC-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      issuedOn: new Date(),
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
      lines: {
        create: [{ projectId: project.id, lineNo: 1, quantityKg: 10, ratePerKg: 100, taxPct: 18, lineTotal: 1000 }],
      },
    },
  });

  const firstAccept = await acceptQuotationCore(salesUser.id, accQtn.id);
  console.log(`  First accept result: ${JSON.stringify(firstAccept)}`);
  if (!("orderId" in firstAccept) || !firstAccept.orderId) throw new Error("First accept failed.");

  const secondAccept = await acceptQuotationCore(salesUser.id, accQtn.id);
  console.log(`  Second accept result: ${JSON.stringify(secondAccept)}`);
  if (!secondAccept.error?.includes("already been accepted") && !secondAccept.error?.includes("already been ordered")) {
    throw new Error("FAILED: Sequential accept on already-accepted quotation was not blocked!");
  }
  console.log("  PASS: Blocked sequential re-acceptance of accepted quotation.\n");

  // Clean up SO & Qtn
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: firstAccept.orderId } });
  await prisma.salesOrder.delete({ where: { id: firstAccept.orderId } });
  await prisma.salesQuotationLine.deleteMany({ where: { quotationId: accQtn.id } });
  await prisma.salesQuotation.delete({ where: { id: accQtn.id } });

  // ---------------------------------------------------------------------------
  // STEP 4: Double-Accept Concurrency Test (5 Fresh Parallel Races)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 4: Double-Accept Concurrency Test (5 Parallel Iterations) ---");

  for (let iter = 1; iter <= 5; iter++) {
    const raceQtn = await prisma.salesQuotation.create({
      data: {
        code: `QTN-RACE-RUN${iter}-${Date.now()}`,
        status: SalesQuotationStatus.SENT,
        customerId: customer.id,
        issuedOn: new Date(),
        subtotal: 1000,
        taxAmount: 180,
        totalValue: 1180,
        lines: {
          create: [{ projectId: project.id, lineNo: 1, quantityKg: 10, ratePerKg: 100, taxPct: 18, lineTotal: 1000 }],
        },
      },
    });

    const [res1, res2] = await Promise.all([
      acceptQuotationCore(salesUser.id, raceQtn.id).catch((err: any) => ({ error: err.message })),
      acceptQuotationCore(salesUser.id, raceQtn.id).catch((err: any) => ({ error: err.message })),
    ]);

    const createdOrders = await prisma.salesOrder.findMany({
      where: { quotationId: raceQtn.id },
    });

    const isRes1Order = "orderId" in res1 && !!res1.orderId;
    const isRes2Order = "orderId" in res2 && !!res2.orderId;

    const orderSuccessCount = (isRes1Order ? 1 : 0) + (isRes2Order ? 1 : 0);

    console.log(`  Race ${iter} (${raceQtn.code}):`);
    console.log(`    Call 1 Result: ${JSON.stringify(res1)}`);
    console.log(`    Call 2 Result: ${JSON.stringify(res2)}`);
    console.log(`    DB SalesOrder count for ${raceQtn.code}: ${createdOrders.length}`);

    if (createdOrders.length !== 1 || orderSuccessCount !== 1) {
      throw new Error(`CONCURRENCY RACE FAILED on iteration ${iter}: DB count = ${createdOrders.length}, orderSuccessCount = ${orderSuccessCount}`);
    }

    // Cleanup race iteration artifacts
    for (const o of createdOrders) {
      await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: o.id } });
      await prisma.salesOrder.delete({ where: { id: o.id } });
    }
    await prisma.salesQuotationLine.deleteMany({ where: { quotationId: raceQtn.id } });
    await prisma.salesQuotation.delete({ where: { id: raceQtn.id } });
  }

  console.log("\n  PASS: All 5 parallel double-accept races created EXACTLY ONE SalesOrder row!\n");

  // ---------------------------------------------------------------------------
  // STEP 5: Expired Quotation Acceptance Guard (validUntil < now in IST)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 5: Expired Quotation Acceptance Guard ---");

  // Create an expired quotation (validUntil set to 2 days ago in IST)
  const pastDate = new Date(Date.now() - 2 * 86_400_000);
  const expiredQtn = await prisma.salesQuotation.create({
    data: {
      code: `QTN-EXP-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      issuedOn: new Date(Date.now() - 5 * 86_400_000),
      validUntil: pastDate,
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
      lines: {
        create: [{ projectId: project.id, lineNo: 1, quantityKg: 10, ratePerKg: 100, taxPct: 18, lineTotal: 1000 }],
      },
    },
  });

  let expiredError: string | null = null;
  try {
    const res = await acceptQuotationCore(salesUser.id, expiredQtn.id);
    if (res.error) {
      expiredError = res.error;
    }
  } catch (err: any) {
    expiredError = err.message;
  }

  console.log(`  Accept expired quotation error message: "${expiredError}"`);
  if (!expiredError || !expiredError.includes("Quotation expired on")) {
    throw new Error(`FAILED: Expected "Quotation expired on <date>" error, but got: ${expiredError}`);
  }

  // Verify status in DB was NOT changed
  const qtnAfter = await prisma.salesQuotation.findUnique({ where: { id: expiredQtn.id } });
  if (qtnAfter?.status !== SalesQuotationStatus.SENT) {
    throw new Error(`FAILED: Quotation status in DB changed to ${qtnAfter?.status}; expected SENT!`);
  }

  // Verify SalesOrder was NOT created
  const createdOrder = await prisma.salesOrder.findFirst({ where: { quotationId: expiredQtn.id } });
  if (createdOrder) {
    throw new Error(`FAILED: SalesOrder ${createdOrder.code} was created for an expired quotation!`);
  }

  console.log("  PASS: Expired quotation rejected, status unchanged in DB, no SO created.\n");

  // Cleanup
  await prisma.salesQuotationLine.deleteMany({ where: { quotationId: expiredQtn.id } });
  await prisma.salesQuotation.delete({ where: { id: expiredQtn.id } });

  // ---------------------------------------------------------------------------
  // STEP 6: Valid Quotation Acceptance (validUntil = today must be accepted)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 6: Valid Quotation Acceptance (validUntil = today) ---");

  // Create a quotation with validUntil set to today
  const todayQtn = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TODAY-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      issuedOn: new Date(),
      validUntil: new Date(),
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
      lines: {
        create: [{ projectId: project.id, lineNo: 1, quantityKg: 10, ratePerKg: 100, taxPct: 18, lineTotal: 1000 }],
      },
    },
  });

  const todayAcceptRes = await acceptQuotationCore(salesUser.id, todayQtn.id);
  console.log(`  Accept today quotation result: ${JSON.stringify(todayAcceptRes)}`);
  if (!todayAcceptRes || !("orderId" in todayAcceptRes) || !todayAcceptRes.orderId) {
    throw new Error(`FAILED: Quotation with validUntil = today was not accepted! Result: ${JSON.stringify(todayAcceptRes)}`);
  }

  // Verify SO was created
  const todayCreatedOrder = await prisma.salesOrder.findUnique({ where: { id: todayAcceptRes.orderId } });
  if (!todayCreatedOrder) {
    throw new Error("FAILED: SalesOrder was not found in DB after accepting quotation with validUntil = today");
  }

  console.log(`  PASS: Quotation with validUntil = today successfully accepted -> SO ${todayCreatedOrder.code} created.\n`);

  // Cleanup
  await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: todayCreatedOrder.id } });
  await prisma.salesOrder.delete({ where: { id: todayCreatedOrder.id } });
  await prisma.salesQuotationLine.deleteMany({ where: { quotationId: todayQtn.id } });
  await prisma.salesQuotation.delete({ where: { id: todayQtn.id } });

  // ---------------------------------------------------------------------------
  // STEP 7: Parallel Inquiry Creation Concurrency (5 parallel calls)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 7: Parallel Inquiry Creation Concurrency (5 parallel calls) ---");

  async function invokeCreateInquiry(index: number): Promise<string> {
    const formData = new FormData();
    formData.append("customerId", customer!.id);
    formData.append(
      "lines",
      JSON.stringify([
        {
          description: `Parallel Requirement ${index + 1}`,
          quantityKg: 100 * (index + 1),
          targetRate: 150,
        },
      ]),
    );

    try {
      const res = await createSalesInquiryCore(salesUser!.id, formData);
      if (res && "inquiryId" in res && res.inquiryId) {
        return res.inquiryId;
      }
      throw new Error(`Unexpected result: ${JSON.stringify(res)}`);
    } catch (err: any) {
      if (err?.message?.startsWith("NEXT_REDIRECT:")) {
        const parts = err.message.split("/");
        const id = parts[parts.length - 1];
        return id;
      }
      throw err;
    }
  }

  const parallelInquiryIds = await Promise.all([
    invokeCreateInquiry(0),
    invokeCreateInquiry(1),
    invokeCreateInquiry(2),
    invokeCreateInquiry(3),
    invokeCreateInquiry(4),
  ]);

  console.log(`  Created 5 parallel inquiries with IDs: ${JSON.stringify(parallelInquiryIds)}`);

  if (parallelInquiryIds.length !== 5) {
    throw new Error(`FAILED: Expected 5 inquiry IDs, got ${parallelInquiryIds.length}`);
  }

  const createdInquiries = await prisma.salesInquiry.findMany({
    where: { id: { in: parallelInquiryIds } },
    select: { id: true, code: true },
  });

  if (createdInquiries.length !== 5) {
    throw new Error(`FAILED: Expected 5 inquiries in DB, found ${createdInquiries.length}`);
  }

  const inquiryCodes = createdInquiries.map((i) => i.code);
  console.log(`  Inquiry codes generated: ${JSON.stringify(inquiryCodes)}`);

  const uniqueCodes = new Set(inquiryCodes);
  if (uniqueCodes.size !== 5) {
    throw new Error(`FAILED: Expected 5 unique codes, but got ${uniqueCodes.size}: ${JSON.stringify(inquiryCodes)}`);
  }

  console.log("  PASS: All 5 parallel createSalesInquiryCore calls succeeded with unique codes.\n");

  // Cleanup parallel inquiries
  await prisma.salesInquiryLine.deleteMany({ where: { inquiryId: { in: parallelInquiryIds } } });
  await prisma.salesInquiry.deleteMany({ where: { id: { in: parallelInquiryIds } } });

  // ---------------------------------------------------------------------------
  // STEP 8: Reject Quotation Tests
  // ---------------------------------------------------------------------------
  console.log("--- STEP 8: Reject Quotation Tests ---");

  // (a) The only quotation rejected -> inquiry LOST + AuditEvent
  console.log("  Testing (a): Single quotation rejected -> inquiry becomes LOST");
  const inqA = await prisma.salesInquiry.create({
    data: {
      code: `INQ-TEST-REJ-A-${Date.now()}`,
      status: SalesInquiryStatus.QUOTED,
      customerId: customer.id,
      receivedOn: new Date(),
    },
  });

  const qtnA = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TEST-REJ-A-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      inquiryId: inqA.id,
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
    },
  });

  const resA = await rejectQuotationCore(salesUser.id, qtnA.id, "Price too high for customer");
  console.log(`  rejectQuotationCore (a) result: ${JSON.stringify(resA)}`);
  if (resA.error) throw new Error(`FAILED (a): Reject quotation returned error: ${resA.error}`);

  const updatedQtnA = await prisma.salesQuotation.findUnique({ where: { id: qtnA.id } });
  const updatedInqA = await prisma.salesInquiry.findUnique({ where: { id: inqA.id } });

  if (updatedQtnA?.status !== SalesQuotationStatus.REJECTED) {
    throw new Error(`FAILED (a): Expected quotation status REJECTED, got ${updatedQtnA?.status}`);
  }
  if (updatedInqA?.status !== SalesInquiryStatus.LOST) {
    throw new Error(`FAILED (a): Expected inquiry status LOST, got ${updatedInqA?.status}`);
  }

  const auditA = await prisma.auditEvent.findFirst({
    where: { entityType: "SalesQuotation", entityId: qtnA.id, action: "REJECT" },
    orderBy: { createdAt: "desc" },
  });
  if (!auditA) {
    throw new Error(`FAILED (a): AuditEvent not created for quotation rejection`);
  }
  console.log("  PASS (a): Only quotation rejected -> inquiry LOST & AuditEvent created.");

  // (b) A second live quotation exists -> inquiry stays QUOTED
  console.log("  Testing (b): Second live quotation exists -> inquiry stays QUOTED");
  const inqB = await prisma.salesInquiry.create({
    data: {
      code: `INQ-TEST-REJ-B-${Date.now()}`,
      status: SalesInquiryStatus.QUOTED,
      customerId: customer.id,
      receivedOn: new Date(),
    },
  });

  const tomorrow = new Date(Date.now() + 86_400_000);
  const qtnB1 = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TEST-REJ-B1-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      inquiryId: inqB.id,
      validUntil: tomorrow,
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
    },
  });

  const qtnB2 = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TEST-REJ-B2-${Date.now()}`,
      status: SalesQuotationStatus.SENT,
      customerId: customer.id,
      inquiryId: inqB.id,
      validUntil: tomorrow,
      subtotal: 1200,
      taxAmount: 216,
      totalValue: 1416,
    },
  });

  const resB = await rejectQuotationCore(salesUser.id, qtnB1.id, "Option 1 rejected");
  console.log(`  rejectQuotationCore (b) result: ${JSON.stringify(resB)}`);
  if (resB.error) throw new Error(`FAILED (b): Reject quotation returned error: ${resB.error}`);

  const updatedQtnB1 = await prisma.salesQuotation.findUnique({ where: { id: qtnB1.id } });
  const updatedInqB = await prisma.salesInquiry.findUnique({ where: { id: inqB.id } });

  if (updatedQtnB1?.status !== SalesQuotationStatus.REJECTED) {
    throw new Error(`FAILED (b): Expected quotation 1 status REJECTED, got ${updatedQtnB1?.status}`);
  }
  if (updatedInqB?.status !== SalesInquiryStatus.QUOTED) {
    throw new Error(`FAILED (b): Expected inquiry status to remain QUOTED, got ${updatedInqB?.status}`);
  }
  console.log("  PASS (b): Second live quotation exists -> inquiry stays QUOTED.");

  // (c) Reject an ACCEPTED quotation -> error
  console.log("  Testing (c): Reject an ACCEPTED quotation -> error");
  const qtnC = await prisma.salesQuotation.create({
    data: {
      code: `QTN-TEST-REJ-C-${Date.now()}`,
      status: SalesQuotationStatus.ACCEPTED,
      customerId: customer.id,
      subtotal: 1000,
      taxAmount: 180,
      totalValue: 1180,
    },
  });

  const resC = await rejectQuotationCore(salesUser.id, qtnC.id, "Attempt to reject accepted");
  console.log(`  rejectQuotationCore (c) result: ${JSON.stringify(resC)}`);
  if (!resC.error) {
    throw new Error(`FAILED (c): Expected error when rejecting ACCEPTED quotation, but succeeded!`);
  }

  const updatedQtnC = await prisma.salesQuotation.findUnique({ where: { id: qtnC.id } });
  if (updatedQtnC?.status !== SalesQuotationStatus.ACCEPTED) {
    throw new Error(`FAILED (c): Expected quotation to remain ACCEPTED, got ${updatedQtnC?.status}`);
  }
  console.log("  PASS (c): Rejecting an ACCEPTED quotation correctly returned an error.\n");

  // Cleanup test records for Step 8
  await prisma.auditEvent.deleteMany({ where: { entityId: { in: [qtnA.id, qtnB1.id, qtnB2.id, qtnC.id] } } });
  await prisma.salesQuotation.deleteMany({ where: { id: { in: [qtnA.id, qtnB1.id, qtnB2.id, qtnC.id] } } });
  await prisma.salesInquiry.deleteMany({ where: { id: { in: [inqA.id, inqB.id] } } });

  console.log("================================================================================");
  console.log("SUCCESS: ALL NEGATIVE & CONCURRENCY TESTS PASSED CLEANLY!");
  console.log("================================================================================");
}

main()
  .catch((e) => {
    console.error("Negative/Concurrency Test Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
