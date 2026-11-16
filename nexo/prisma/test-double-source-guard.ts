import { PrismaClient, RequisitionStatus, InquiryStatus, QuotationStatus } from "@prisma/client";
import { createPurchaseOrderFromLines } from "../src/app/(app)/procurement/sourcing-actions";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("DB VERIFICATION: Double-Sourcing Soft Guard (Option A) Verification");
  console.log("================================================================================\n");

  const vendor = await prisma.vendor.findFirst({ select: { id: true, name: true, paymentTerms: true } });
  const material = await prisma.rawMaterial.findFirst({ select: { id: true, name: true, currentPricePerKg: true } });
  const user = await prisma.user.findFirst({ select: { id: true, name: true } });

  if (!vendor || !material || !user) {
    throw new Error("Missing prerequisite seed data (vendor, material, user)");
  }

  const rate = Number(material.currentPricePerKg ?? 100);

  // Clean up test codes
  const testCodes = ["PR-TEST-DS-01", "PR-TEST-DS-02", "PR-TEST-DS-03", "PI-TEST-DS-01", "PI-TEST-DS-02", "PI-TEST-DS-03", "PQ-TEST-DS-01", "PQ-TEST-DS-02", "PQ-TEST-DS-03"];
  await prisma.auditEvent.deleteMany({ where: { summary: { contains: "TEST-DS" } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { code: { startsWith: "PO-TEST-DS-" } } } });
  await prisma.purchaseOrder.deleteMany({ where: { code: { startsWith: "PO-TEST-DS-" } } });
  await prisma.purchaseQuotationLine.deleteMany({ where: { quotation: { code: { in: testCodes } } } });
  await prisma.purchaseQuotation.deleteMany({ where: { code: { in: testCodes } } });
  await prisma.purchaseInquiryLine.deleteMany({ where: { inquiry: { code: { in: testCodes } } } });
  await prisma.purchaseInquiryVendor.deleteMany({ where: { inquiry: { code: { in: testCodes } } } });
  await prisma.purchaseInquiry.deleteMany({ where: { code: { in: testCodes } } });
  await prisma.purchaseRequisitionLine.deleteMany({ where: { requisition: { code: { in: testCodes } } } });
  await prisma.purchaseRequisition.deleteMany({ where: { code: { in: testCodes } } });

  // Helper functions that invoke createPurchaseOrderFromLines directly with actorId
  const directConvertPR = async (reqId: string, vendorId: string) => {
    const req = await prisma.purchaseRequisition.findUnique({
      where: { id: reqId },
      include: { lines: { include: { material: true } } },
    });
    if (!req) return { error: "Requisition not found" };
    if (req.status !== RequisitionStatus.APPROVED && req.status !== RequisitionStatus.PARTIALLY_ORDERED) {
      return { error: `${req.code} is not in an approved state — it cannot be converted to a PO.` };
    }

    const linesToOrder = req.lines
      .map((l, i) => {
        const remainingKg = Math.max(0, Number(l.quantityKg) - Number(l.orderedKg));
        return {
          materialId: l.materialId,
          lineNo: i + 1,
          quantityKg: remainingKg,
          ratePerKg: Number(l.material.currentPricePerKg ?? 0),
          taxPct: 18,
          requisitionLineId: l.id,
        };
      })
      .filter((l) => l.quantityKg > 0.0001);

    if (linesToOrder.length === 0) {
      return { error: `${req.code} has no remaining uncommitted quantity to order.` };
    }

    return await createPurchaseOrderFromLines({
      vendorId,
      requisitionId: req.id,
      quotationId: null,
      expectedOn: new Date(Date.now() + 7 * 86400000),
      deliveryTerms: "FOR our works",
      paymentTerms: vendor.paymentTerms || "30 days credit",
      freight: 0,
      remark: `Raised directly from ${req.code} — RFQ bypassed.`,
      actorId: user.id,
      auditSummary: (poCode, totalValue) => `Raised ${poCode} directly from ${req.code}`,
      auditMetadata: { requisition: req.code },
      lines: linesToOrder,
    });
  };

  const directConvertQuotation = async (quotationId: string) => {
    const quote = await prisma.purchaseQuotation.findUnique({
      where: { id: quotationId },
      include: {
        vendor: true,
        inquiry: true,
        lines: { include: { inquiryLine: true } },
      },
    });
    if (!quote) return { error: "Quotation not found" };
    if (quote.status !== QuotationStatus.SELECTED) {
      return { error: `${quote.code} has not been selected.` };
    }

    const linesToOrder = quote.lines.map((l) => ({
      materialId: l.materialId,
      lineNo: l.lineNo,
      quantityKg: Number(l.quantityKg),
      ratePerKg: Number(l.ratePerKg),
      taxPct: Number(l.taxPct),
      requisitionLineId: l.inquiryLine?.requisitionLineId ?? null,
    }));

    return await createPurchaseOrderFromLines({
      vendorId: quote.vendor.id,
      quotationId: quote.id,
      requisitionId: quote.inquiry.requisitionId,
      expectedOn: new Date(Date.now() + 7 * 86400000),
      deliveryTerms: quote.deliveryTerms,
      paymentTerms: quote.paymentTerms ?? quote.vendor.paymentTerms,
      freight: Number(quote.freight),
      remark: `Raised from ${quote.code} against ${quote.inquiry.code}.`,
      actorId: user.id,
      auditSummary: (poCode, totalValue) => `Raised ${poCode} from ${quote.code}`,
      auditMetadata: { quotation: quote.code },
      lines: linesToOrder,
    });
  };

  // ===========================================================================
  // Verification 1: Reproduce Double-Source Scenario (PO direct first, then Quotation commit)
  // ===========================================================================
  console.log("--- Verification 1: Convert Direct PO first, then try committing Quotation ---");

  const pr1 = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-DS-01",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 1000 }],
      },
    },
    include: { lines: true },
  });

  const pi1 = await prisma.purchaseInquiry.create({
    data: {
      code: "PI-TEST-DS-01",
      status: InquiryStatus.SENT,
      requisitionId: pr1.id,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 1000, requisitionLineId: pr1.lines[0]!.id }],
      },
      vendors: { create: [{ vendorId: vendor.id }] },
    },
    include: { lines: true },
  });

  const pq1 = await prisma.purchaseQuotation.create({
    data: {
      code: "PQ-TEST-DS-01",
      status: QuotationStatus.SELECTED,
      inquiryId: pi1.id,
      vendorId: vendor.id,
      subtotal: 1000 * rate,
      taxAmount: (1000 * rate * 18) / 100,
      totalValue: 1000 * rate * 1.18,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            inquiryLineId: pi1.lines[0]!.id,
            quantityKg: 1000,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 1000 * rate,
          },
        ],
      },
    },
  });

  console.log(`Created PR ${pr1.code} (1000 kg), PI ${pi1.code}, PQ ${pq1.code} (SELECTED).`);

  console.log(`Converting ${pr1.code} directly to PO...`);
  const poRes1 = await directConvertPR(pr1.id, vendor.id);
  console.log("Direct conversion result:", poRes1);
  if (poRes1.error) throw new Error(`Direct conversion failed: ${poRes1.error}`);

  const pr1AfterDirect = await prisma.purchaseRequisition.findUnique({
    where: { id: pr1.id },
    include: { lines: true },
  });
  console.log(`PR ${pr1.code} status after direct conversion: ${pr1AfterDirect?.status}, orderedKg: ${pr1AfterDirect?.lines[0]?.orderedKg}`);

  console.log(`Attempting quotation conversion on stale quotation ${pq1.code}...`);
  const quoteOrderRes1 = await directConvertQuotation(pq1.id);
  console.log("Quotation conversion result:", quoteOrderRes1);

  if (quoteOrderRes1.order) {
    throw new Error("CRITICAL BUG: quotation conversion succeeded on already fully ordered PR line!");
  }
  console.log(`✓ Verification 1 PASSED: Quotation conversion properly rejected with error: "${quoteOrderRes1.error}"\n`);


  // ===========================================================================
  // Verification 2: Inverse Flow (Quotation commit first, then Direct PO attempt)
  // ===========================================================================
  console.log("--- Verification 2: Convert Quotation first, then try Direct PO conversion ---");

  const pr2 = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-DS-02",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 1000 }],
      },
    },
    include: { lines: true },
  });

  const pi2 = await prisma.purchaseInquiry.create({
    data: {
      code: "PI-TEST-DS-02",
      status: InquiryStatus.SENT,
      requisitionId: pr2.id,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 1000, requisitionLineId: pr2.lines[0]!.id }],
      },
      vendors: { create: [{ vendorId: vendor.id }] },
    },
    include: { lines: true },
  });

  const pq2 = await prisma.purchaseQuotation.create({
    data: {
      code: "PQ-TEST-DS-02",
      status: QuotationStatus.SELECTED,
      inquiryId: pi2.id,
      vendorId: vendor.id,
      subtotal: 1000 * rate,
      taxAmount: (1000 * rate * 18) / 100,
      totalValue: 1000 * rate * 1.18,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            inquiryLineId: pi2.lines[0]!.id,
            quantityKg: 1000,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 1000 * rate,
          },
        ],
      },
    },
  });

  console.log(`Converting ${pq2.code} to PO via quotation...`);
  const quoteOrderRes2 = await directConvertQuotation(pq2.id);
  console.log("Quotation conversion result:", quoteOrderRes2);
  if (quoteOrderRes2.error) throw new Error(`Quotation conversion failed: ${quoteOrderRes2.error}`);

  const pr2AfterQuote = await prisma.purchaseRequisition.findUnique({
    where: { id: pr2.id },
    include: { lines: true },
  });
  console.log(`PR ${pr2.code} status after quotation conversion: ${pr2AfterQuote?.status}, orderedKg: ${pr2AfterQuote?.lines[0]?.orderedKg}`);

  console.log(`Attempting direct PO conversion on now fully-ordered PR ${pr2.code}...`);
  const poRes2 = await directConvertPR(pr2.id, vendor.id);
  console.log("Direct conversion result:", poRes2);

  if (poRes2.order) {
    throw new Error("CRITICAL BUG: direct PO conversion succeeded on already fully ordered PR line!");
  }
  console.log(`✓ Verification 2 PASSED: Direct conversion properly rejected with error: "${poRes2.error}"\n`);


  // ===========================================================================
  // Verification 3: Normal Non-Conflicting Quotation-to-PO Flow
  // ===========================================================================
  console.log("--- Verification 3: Normal non-conflicting Quotation-to-PO flow ---");

  const pr3 = await prisma.purchaseRequisition.create({
    data: {
      code: "PR-TEST-DS-03",
      status: RequisitionStatus.APPROVED,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 500 }],
      },
    },
    include: { lines: true },
  });

  const pi3 = await prisma.purchaseInquiry.create({
    data: {
      code: "PI-TEST-DS-03",
      status: InquiryStatus.SENT,
      requisitionId: pr3.id,
      raisedById: user.id,
      lines: {
        create: [{ lineNo: 1, materialId: material.id, quantityKg: 500, requisitionLineId: pr3.lines[0]!.id }],
      },
      vendors: { create: [{ vendorId: vendor.id }] },
    },
    include: { lines: true },
  });

  const pq3 = await prisma.purchaseQuotation.create({
    data: {
      code: "PQ-TEST-DS-03",
      status: QuotationStatus.SELECTED,
      inquiryId: pi3.id,
      vendorId: vendor.id,
      subtotal: 500 * rate,
      taxAmount: (500 * rate * 18) / 100,
      totalValue: 500 * rate * 1.18,
      lines: {
        create: [
          {
            lineNo: 1,
            materialId: material.id,
            inquiryLineId: pi3.lines[0]!.id,
            quantityKg: 500,
            ratePerKg: rate,
            taxPct: 18,
            lineTotal: 500 * rate,
          },
        ],
      },
    },
  });

  console.log(`Converting ${pq3.code} to PO...`);
  const quoteOrderRes3 = await directConvertQuotation(pq3.id);
  console.log("Quotation conversion result:", quoteOrderRes3);
  if (quoteOrderRes3.error) throw new Error(`Normal quotation conversion failed: ${quoteOrderRes3.error}`);

  const pr3Final = await prisma.purchaseRequisition.findUnique({
    where: { id: pr3.id },
    include: { lines: true },
  });
  console.log(`PR ${pr3.code} status: ${pr3Final?.status} (Expected: ORDERED), orderedKg: ${pr3Final?.lines[0]?.orderedKg} (Expected: 500)`);

  if (pr3Final?.status !== RequisitionStatus.ORDERED || Number(pr3Final?.lines[0]?.orderedKg) !== 500) {
    throw new Error("Normal quotation conversion did not properly set ORDERED status or orderedKg.");
  }

  console.log(`✓ Verification 3 PASSED: Normal RFQ flow works as expected!\n`);

  // Clean up
  await prisma.auditEvent.deleteMany({ where: { summary: { contains: "TEST-DS" } } });
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { code: { startsWith: "PO-TEST-DS-" } } } });
  await prisma.purchaseOrder.deleteMany({ where: { code: { startsWith: "PO-TEST-DS-" } } });
  await prisma.purchaseQuotationLine.deleteMany({ where: { quotation: { code: { in: testCodes } } } });
  await prisma.purchaseQuotation.deleteMany({ where: { code: { in: testCodes } } });
  await prisma.purchaseInquiryLine.deleteMany({ where: { inquiry: { code: { in: testCodes } } } });
  await prisma.purchaseInquiryVendor.deleteMany({ where: { inquiry: { code: { in: testCodes } } } });
  await prisma.purchaseInquiry.deleteMany({ where: { code: { in: testCodes } } });
  await prisma.purchaseRequisitionLine.deleteMany({ where: { requisition: { code: { in: testCodes } } } });
  await prisma.purchaseRequisition.deleteMany({ where: { code: { in: testCodes } } });

  console.log("================================================================================");
  console.log("ALL 3 VERIFICATIONS COMPLETED SUCCESSFULLY WITHOUT AUTH BYPASS!");
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
