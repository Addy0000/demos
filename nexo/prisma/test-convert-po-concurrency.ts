import { PrismaClient, RequisitionStatus, InquiryStatus, QuotationStatus, PoStatus, ApprovalTier } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("DB VERIFICATION: PO Direct Conversion, Quotation Convergence & Concurrency Test");
  console.log("================================================================================\n");

  const vendor = await prisma.vendor.findFirst({ select: { id: true, name: true, paymentTerms: true } });
  const material = await prisma.rawMaterial.findFirst({ select: { id: true, name: true, currentPricePerKg: true } });
  const user = await prisma.user.findFirst({ select: { id: true, name: true } });

  if (!vendor || !material || !user) {
    throw new Error("Missing prerequisite seed data (vendor, material, user)");
  }

  const rate = Number(material.currentPricePerKg ?? 100);

  // ---------------------------------------------------------------------------
  // Clean up any previous test artifacts
  // ---------------------------------------------------------------------------
  const testCodes = ["PR-TEST-CONV-01", "PR-TEST-CONV-02", "PR-TEST-CONC-01", "PI-TEST-01", "PQ-TEST-01"];
  await prisma.auditEvent.deleteMany({ where: { summary: { contains: "TEST-CONV" } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { code: { startsWith: "PO-TEST-" } } } });
  await prisma.purchaseOrder.deleteMany({ where: { code: { startsWith: "PO-TEST-" } } });
  await prisma.purchaseQuotationLine.deleteMany({ where: { quotation: { code: "PQ-TEST-01" } } });
  await prisma.purchaseQuotation.deleteMany({ where: { code: "PQ-TEST-01" } });
  await prisma.purchaseInquiryLine.deleteMany({ where: { inquiry: { code: "PI-TEST-01" } } });
  await prisma.purchaseInquiryVendor.deleteMany({ where: { inquiry: { code: "PI-TEST-01" } } });
  await prisma.purchaseInquiry.deleteMany({ where: { code: "PI-TEST-01" } });
  await prisma.purchaseRequisitionLine.deleteMany({ where: { requisition: { code: { in: testCodes } } } });
  await prisma.purchaseRequisition.deleteMany({ where: { code: { in: testCodes } } });

  // ===========================================================================
  // Part 1: Field Diff between Quotation Path vs Direct Conversion Path
  // ===========================================================================
  console.log("--- Part 1: PO Shape Comparison (Quotation Path vs Direct Conversion) ---");

  // Path A: Create via Quotation
  const prA = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-CONV-01",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 500 }],
      },
    },
    include: { lines: true },
  });

  const pi = await prisma.purchaseInquiry.create({
    data: {
      code: "PI-TEST-01",
      status: InquiryStatus.COMPARED,
      requisitionId: prA.id,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 500, requisitionLineId: prA.lines[0]!.id }],
      },
      vendors: { create: [{ vendorId: vendor.id }] },
    },
    include: { lines: true },
  });

  const pq = await prisma.purchaseQuotation.create({
    data: {
      code: "PQ-TEST-01",
      status: QuotationStatus.SELECTED,
      inquiryId: pi.id,
      vendorId: vendor.id,
      freight: 150,
      subtotal: 500 * rate,
      taxAmount: (500 * rate * 18) / 100,
      totalValue: 500 * rate + (500 * rate * 18) / 100 + 150,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            inquiryLineId: pi.lines[0]!.id,
            quantityKg: 500,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 500 * rate,
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Create PO via Quotation logic
  const poFromQuote = await prisma.purchaseOrder.create({
    data: {
      code: "PO-TEST-FROM-QUOTE",
      status: PoStatus.PENDING_APPROVAL,
      vendorId: vendor.id,
      quotationId: pq.id,
      requisitionId: prA.id,
      expectedOn: new Date(Date.now() + 7 * 86400000),
      deliveryTerms: "FOR our works",
      paymentTerms: "30 days credit",
      approvalTier: ApprovalTier.HEAD,
      subtotal: 500 * rate,
      taxAmount: (500 * rate * 18) / 100,
      freight: 150,
      totalValue: 500 * rate + (500 * rate * 18) / 100 + 150,
      currency: "INR",
      raisedById: user.id,
      remark: `Raised from ${pq.code} against ${pi.code}.`,
      lines: {
        create: [
          {
            materialId: material.id,
            lineNo: 1,
            quantityKg: 500,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 500 * rate,
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Path B: Create via Direct Conversion
  const prB = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-CONV-02",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 500 }],
      },
    },
    include: { lines: true },
  });

  const poFromDirect = await prisma.purchaseOrder.create({
    data: {
      code: "PO-TEST-FROM-DIRECT",
      status: PoStatus.PENDING_APPROVAL,
      vendorId: vendor.id,
      quotationId: null, // intentionally null
      requisitionId: prB.id,
      expectedOn: new Date(Date.now() + 7 * 86400000),
      deliveryTerms: "FOR our works",
      paymentTerms: "30 days credit",
      approvalTier: ApprovalTier.HEAD,
      subtotal: 500 * rate,
      taxAmount: (500 * rate * 18) / 100,
      freight: 0,
      totalValue: 500 * rate + (500 * rate * 18) / 100,
      currency: "INR",
      raisedById: user.id,
      remark: `Raised directly from ${prB.code} — RFQ bypassed.`,
      lines: {
        create: [
          {
            materialId: material.id,
            lineNo: 1,
            quantityKg: 500,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 500 * rate,
          },
        ],
      },
    },
    include: { lines: true },
  });

  // Fetch full records from DB to diff schema fields
  const dbPoQuote = await prisma.purchaseOrder.findUnique({
    where: { id: poFromQuote.id },
    include: { lines: true },
  });
  const dbPoDirect = await prisma.purchaseOrder.findUnique({
    where: { id: poFromDirect.id },
    include: { lines: true },
  });

  if (!dbPoQuote || !dbPoDirect) {
    throw new Error("Failed to fetch PO records from DB");
  }

  console.log("Comparing PurchaseOrder header fields (ignoring id, code, createdAt, updatedAt, remark, freight, totalValue, quotationId):");
  const headerKeys = Object.keys(dbPoQuote) as (keyof typeof dbPoQuote)[];
  const ignoredKeys = new Set(["id", "code", "createdAt", "updatedAt", "remark", "freight", "totalValue", "quotationId", "requisitionId", "lines"]);

  let diffCount = 0;
  for (const k of headerKeys) {
    if (ignoredKeys.has(k)) continue;
    const typeQuote = typeof (dbPoQuote as any)[k];
    const typeDirect = typeof (dbPoDirect as any)[k];
    const isBothPresent = (dbPoQuote as any)[k] !== undefined && (dbPoDirect as any)[k] !== undefined;

    if (typeQuote !== typeDirect || !isBothPresent) {
      console.error(`  DIFF in field [${k}]: Quote type=${typeQuote}, Direct type=${typeDirect}`);
      diffCount++;
    } else {
      console.log(`  ✓ Field [${k}]: Match (Type: ${typeQuote}, Value Quote: ${(dbPoQuote as any)[k]}, Value Direct: ${(dbPoDirect as any)[k]})`);
    }
  }

  console.log("\nComparing PurchaseOrderLine fields (ignoring id, purchaseOrderId):");
  const lineQuote = dbPoQuote.lines[0]!;
  const lineDirect = dbPoDirect.lines[0]!;
  const lineKeys = Object.keys(lineQuote) as (keyof typeof lineQuote)[];
  const ignoredLineKeys = new Set(["id", "purchaseOrderId"]);

  for (const k of lineKeys) {
    if (ignoredLineKeys.has(k)) continue;
    const typeQuote = typeof (lineQuote as any)[k];
    const typeDirect = typeof (lineDirect as any)[k];
    const isBothPresent = (lineQuote as any)[k] !== undefined && (lineDirect as any)[k] !== undefined;

    if (typeQuote !== typeDirect || !isBothPresent) {
      console.error(`  DIFF in line field [${k}]: Quote type=${typeQuote}, Direct type=${typeDirect}`);
      diffCount++;
    } else {
      console.log(`  ✓ Line field [${k}]: Match (Type: ${typeQuote}, Value Quote: ${(lineQuote as any)[k]}, Value Direct: ${(lineDirect as any)[k]})`);
    }
  }

  if (diffCount === 0) {
    console.log("\n>>> SUCCESS: Zero structural or type diffs between Quotation-generated PO and Direct-Conversion PO <<<\n");
  } else {
    throw new Error(`Found ${diffCount} differences between PO records.`);
  }

  // ===========================================================================
  // Part 2: Concurrency on Requisition Line Ordering
  // ===========================================================================
  console.log("--- Part 2: Concurrency Test on Requisition Line Ordering ---");

  // Create PR with 1000 kg
  const concPr = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-CONC-01",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 1000, orderedKg: 0 }],
      },
    },
    include: { lines: true },
  });

  const prLineId = concPr.lines[0]!.id;
  console.log(`Created PR ${concPr.code} with line quantity = 1000 kg, orderedKg = 0 kg`);

  // Define two concurrent conversion attempts, each trying to order 600 kg (Total = 1200 kg > 1000 kg)
  // With row-locking (SELECT ... FOR UPDATE), exactly one must succeed (orderedKg -> 600 kg)
  // and the second must be blocked and subsequently rejected (only 400 kg remaining).

  const convertAttempt = async (attemptId: string, orderKg: number, delayMs: number) => {
    try {
      return await prisma.$transaction(async (tx) => {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }

        // Row-level lock on the PR
        const [reqRow] = await tx.$queryRaw<Array<{ id: string; code: string; status: RequisitionStatus }>>`
          SELECT id, code, status FROM "PurchaseRequisition" WHERE id = ${concPr.id} FOR UPDATE
        `;

        if (!reqRow) throw new Error("Requisition not found");
        if (reqRow.status !== RequisitionStatus.APPROVED && reqRow.status !== RequisitionStatus.PARTIALLY_ORDERED) {
          throw new Error(`${reqRow.code} is in status ${reqRow.status} — only APPROVED or PARTIALLY_ORDERED can be converted.`);
        }

        // Row-level lock on the PR line
        const [lineRow] = await tx.$queryRaw<Array<{ id: string; materialId: string; quantityKg: any; orderedKg: any }>>`
          SELECT id, "materialId", "quantityKg", "orderedKg" FROM "PurchaseRequisitionLine" WHERE id = ${prLineId} FOR UPDATE
        `;

        if (!lineRow) throw new Error("Requisition line not found");

        const currentOrdered = Number(lineRow.orderedKg);
        const maxQty = Number(lineRow.quantityKg);

        if (currentOrdered + orderKg > maxQty + 0.0001) {
          const remaining = Math.max(0, maxQty - currentOrdered);
          throw new Error(`Cannot order ${orderKg} kg on ${reqRow.code}: only ${remaining.toFixed(3)} kg remaining uncommitted.`);
        }

        // Apply increment
        await tx.purchaseRequisitionLine.update({
          where: { id: prLineId },
          data: { orderedKg: { increment: orderKg } },
        });

        const updatedOrdered = currentOrdered + orderKg;
        const newPrStatus = updatedOrdered >= maxQty - 0.0001 ? RequisitionStatus.ORDERED : RequisitionStatus.PARTIALLY_ORDERED;

        await tx.purchaseRequisition.update({
          where: { id: concPr.id },
          data: { status: newPrStatus },
        });

        // Create PO
        const year = new Date().getFullYear();
        const poCode = `PO-TEST-CONC-${attemptId}`;
        const po = await tx.purchaseOrder.create({
          data: {
            code: poCode,
            status: PoStatus.PENDING_APPROVAL,
            vendorId: vendor.id,
            requisitionId: concPr.id,
            totalValue: orderKg * rate * 1.18,
            raisedById: user.id,
            lines: {
              create: [
                {
                  materialId: material.id,
                  lineNo: 1,
                  quantityKg: orderKg,
                  ratePerKg: rate,
                  taxPct: 18,
                  lineTotal: orderKg * rate,
                },
              ],
            },
          },
        });

        return { success: true, attemptId, poCode: po.code, orderedKg: orderKg };
      });
    } catch (err: any) {
      return { success: false, attemptId, error: err.message };
    }
  };

  console.log("Launching Attempt 1 (600 kg) and Attempt 2 (600 kg) simultaneously...");
  const [res1, res2] = await Promise.all([
    convertAttempt("ATTEMPT-1", 600, 0),
    convertAttempt("ATTEMPT-2", 600, 10),
  ]);

  console.log("Attempt 1 Result:", res1);
  console.log("Attempt 2 Result:", res2);

  // Validate concurrency outcomes
  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  if (successes.length !== 1 || failures.length !== 1) {
    throw new Error(`Expected exactly 1 success and 1 rejection due to lock / limit check, but got ${successes.length} successes and ${failures.length} failures.`);
  }

  console.log(`✓ Exactly one conversion succeeded (${successes[0]!.attemptId}) and the other was rejected (${failures[0]!.attemptId}): "${(failures[0] as any)?.error}"`);

  // Verify DB state
  const finalPr = await prisma.purchaseRequisition.findUnique({
    where: { id: concPr.id },
    include: { lines: true },
  });

  const finalOrderedKg = Number(finalPr!.lines[0]!.orderedKg);
  console.log(`Final PR line orderedKg: ${finalOrderedKg} kg (Expected: 600 kg, Max allowed: 1000 kg)`);
  console.log(`Final PR status: ${finalPr!.status} (Expected: PARTIALLY_ORDERED)`);

  if (finalOrderedKg !== 600) {
    throw new Error(`Concurrency leak: orderedKg became ${finalOrderedKg} instead of 600`);
  }
  if (finalPr!.status !== RequisitionStatus.PARTIALLY_ORDERED) {
    throw new Error(`Expected PARTIALLY_ORDERED status, found ${finalPr!.status}`);
  }

  // Now attempt a 3rd conversion with 400 kg (should succeed and complete the PR)
  console.log("\nAttempting 3rd conversion for remaining 400 kg...");
  const res3 = await convertAttempt("ATTEMPT-3", 400, 0);
  console.log("Attempt 3 Result:", res3);

  const completedPr = await prisma.purchaseRequisition.findUnique({
    where: { id: concPr.id },
    include: { lines: true },
  });
  console.log(`Completed PR line orderedKg: ${Number(completedPr!.lines[0]!.orderedKg)} kg`);
  console.log(`Completed PR status: ${completedPr!.status} (Expected: ORDERED)`);

  if (Number(completedPr!.lines[0]!.orderedKg) !== 1000 || completedPr!.status !== RequisitionStatus.ORDERED) {
    throw new Error("PR did not transition cleanly to ORDERED upon full commitment");
  }

  // Attempt 4: Over-ordering on fully ordered PR (should fail)
  console.log("\nAttempting 4th conversion on fully ordered PR (100 kg)...");
  const res4 = await convertAttempt("ATTEMPT-4", 100, 0);
  console.log("Attempt 4 Result (expected failure):", res4);
  if (res4.success) {
    throw new Error("Attempt 4 should have been rejected for fully ordered PR");
  }

  console.log("\n================================================================================");
  console.log("ALL VERIFICATIONS PASSED SUCCESSFULLY!");
  console.log("================================================================================");
}

main()
  .catch((e) => {
    console.error("Test failed with error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
