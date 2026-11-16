import { PrismaClient, QuotationStatus, InquiryStatus } from "@prisma/client";

const prisma = new PrismaClient();

/** Next sequence number for a document family, collision-safe. */
async function nextCode(prefix: string, table: "pq"): Promise<string> {
  const year = new Date().getFullYear();
  const prefixPattern = `${prefix}-${year}-`;

  const records = await prisma.purchaseQuotation.findMany({
    where: { code: { startsWith: prefixPattern } },
    select: { code: true },
  });

  let maxNum = 0;
  for (const r of records) {
    const raw = r.code.replace(prefixPattern, "");
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > maxNum) {
      maxNum = parsed;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;

  while (await prisma.purchaseQuotation.findUnique({ where: { code: candidate }, select: { id: true } })) {
    nextNum++;
    candidate = `${prefixPattern}${String(nextNum).padStart(4, "0")}`;
  }

  return candidate;
}

async function main() {
  const targetInquiryId = process.argv[2];

  let inquiry;
  if (targetInquiryId) {
    inquiry = await prisma.purchaseInquiry.findUnique({
      where: { id: targetInquiryId },
      include: {
        lines: { include: { material: true } },
        vendors: { include: { vendor: true } },
      },
    });
  } else {
    inquiry = await prisma.purchaseInquiry.findFirst({
      where: { status: { in: [InquiryStatus.SENT, InquiryStatus.QUOTES_IN] } },
      orderBy: { issuedOn: "desc" },
      include: {
        lines: { include: { material: true } },
        vendors: { include: { vendor: true } },
      },
    });
  }

  if (!inquiry) {
    console.error("No active purchase inquiry found. Issue an inquiry first.");
    process.exit(1);
  }

  console.log(`Seeding demo quotations for Inquiry ${inquiry.code} (ID: ${inquiry.id})...`);

  // Default rate overrides for vendors to make them competitive
  const vendorRates: Record<string, number> = {
    "VEN-0001": 160,
    "VEN-0002": 165,
  };

  const createdQuotes = [];

  for (let i = 0; i < inquiry.vendors.length; i++) {
    const invVendor = inquiry.vendors[i]!;
    const vendor = invVendor.vendor;

    const existing = await prisma.purchaseQuotation.findUnique({
      where: { inquiryId_vendorId: { inquiryId: inquiry.id, vendorId: vendor.id } },
    });

    if (existing) {
      console.log(`Vendor ${vendor.name} already has quotation ${existing.code}. Skipping.`);
      createdQuotes.push(existing);
      continue;
    }

    const code = await nextCode("PQ", "pq");

    let subtotal = 0;
    let taxAmount = 0;

    const lines = inquiry.lines.map((l) => {
      const baseRate = Number(l.material.currentPricePerKg ?? 100);
      const rate = vendorRates[vendor.code] ?? (baseRate + i * 5);
      const qty = Number(l.quantityKg);
      const taxPct = 18;
      const lineTotal = Number((qty * rate).toFixed(2));
      const lineTax = Number(((lineTotal * taxPct) / 100).toFixed(2));

      subtotal += lineTotal;
      taxAmount += lineTax;

      return {
        materialId: l.materialId,
        inquiryLineId: l.id,
        lineNo: l.lineNo,
        quantityKg: qty,
        ratePerKg: rate,
        taxPct,
        lineTotal,
      };
    });

    const freight = i === 0 ? 0 : 250;
    const totalValue = Number((subtotal + taxAmount + freight).toFixed(2));

    const quote = await prisma.purchaseQuotation.create({
      data: {
        code,
        status: QuotationStatus.SUBMITTED,
        inquiryId: inquiry.id,
        vendorId: vendor.id,
        leadTimeDays: 7 + i * 2,
        deliveryTerms: "FOR our works",
        paymentTerms: vendor.paymentTerms || "30 days credit",
        subtotal: Number(subtotal.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        freight,
        totalValue,
        lines: { create: lines },
      },
    });

    await prisma.purchaseInquiryVendor.updateMany({
      where: { inquiryId: inquiry.id, vendorId: vendor.id },
      data: { respondedAt: new Date() },
    });

    console.log(`Created Quotation ${quote.code} for Vendor ${vendor.name} (Total: ₹${totalValue})`);
    createdQuotes.push(quote);
  }

  await prisma.purchaseInquiry.update({
    where: { id: inquiry.id },
    data: { status: InquiryStatus.QUOTES_IN },
  });

  console.log(`Successfully seeded ${createdQuotes.length} quotations for ${inquiry.code}. Updated Inquiry status to QUOTES_IN.`);
}

main()
  .catch((e) => {
    console.error("Failed to seed demo quotations:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
