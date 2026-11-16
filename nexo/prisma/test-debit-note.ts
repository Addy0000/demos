import fs from "fs";
import path from "path";
import assert from "assert";

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

// 2. Stub server-only, next/cache, and next/navigation in require.cache
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

import { prisma } from "../src/lib/prisma";
const { raiseDebitNoteCore } = require("../src/app/(app)/procurement/sourcing-actions");
import { POST as payBill } from "../src/app/api/finance/payable/[billId]/pay/route";
import {
  VendorBillStatus,
  PoStatus,
  GrnStatus,
  PostingSide,
  PostingSourceType,
  DebitNoteStatus,
  MaterialCategory,
  ItemType,
  Uom,
} from "@prisma/client";

const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const round3 = (num: number) => Math.round((num + Number.EPSILON) * 1000) / 1000;

async function runDebitNoteTests() {
  console.log("=== DEBIT NOTE SYSTEM TEST SUITE START ===");

  // Track created entity IDs for clean, hierarchical teardown
  const createdIds = {
    debitNoteLines: [] as string[],
    debitNotes: [] as string[],
    ledgerPostings: [] as string[],
    vendorBills: [] as string[],
    goodsReceiptLines: [] as string[],
    goodsReceipts: [] as string[],
    purchaseOrderLines: [] as string[],
    purchaseOrders: [] as string[],
    materials: [] as string[],
    vendors: [] as string[],
    auditEvents: [] as string[],
  };

  try {
    // ── Setup Shared Test Fixtures ───────────────────────────────────────────
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!adminUser) throw new Error("No ADMIN user found in database!");

    const apAccount = await prisma.chartOfAccount.findUnique({ where: { code: "2000" } });
    const purchaseAccount = await prisma.chartOfAccount.findUnique({ where: { code: "5000" } });
    if (!apAccount || !purchaseAccount) {
      throw new Error("Required COA accounts (2000 AP, 5000 Purchases) missing from database.");
    }

    const testVendor = await prisma.vendor.create({
      data: {
        code: `VEN-DN-${Date.now().toString().slice(-6)}`,
        name: `Debit Note Test Vendor ${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
      },
    });
    createdIds.vendors.push(testVendor.id);

    const testMaterial18 = await prisma.rawMaterial.create({
      data: {
        code: `RM-DN18-${Date.now().toString().slice(-5)}`,
        name: "DN PVC Resin K67 (18% Tax)",
        itemType: ItemType.RAW_MATERIAL,
        category: MaterialCategory.PVC_RESIN,
        uom: Uom.KG,
        currentPricePerKg: 200,
      },
    });
    createdIds.materials.push(testMaterial18.id);

    const testMaterial5 = await prisma.rawMaterial.create({
      data: {
        code: `RM-DN5-${Date.now().toString().slice(-5)}`,
        name: "DN Plasticiser DOP (5% Tax)",
        itemType: ItemType.RAW_MATERIAL,
        category: MaterialCategory.PLASTICISER,
        uom: Uom.KG,
        currentPricePerKg: 400,
      },
    });
    createdIds.materials.push(testMaterial5.id);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: One rejected line gives one note, lines sum to header
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 1] One rejected line gives one note, lines sum to header...");
    {
      const po1 = await prisma.purchaseOrder.create({
        data: {
          code: `PO-DN1-${Date.now().toString().slice(-5)}`,
          status: PoStatus.APPROVED,
          vendorId: testVendor.id,
          subtotal: 20000,
          taxAmount: 3600,
          totalValue: 23600,
          raisedById: adminUser.id,
          lines: {
            create: [
              {
                lineNo: 1,
                materialId: testMaterial18.id,
                quantityKg: 100,
                ratePerKg: 200,
                taxPct: 18,
                lineTotal: 23600,
              },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.purchaseOrders.push(po1.id);
      po1.lines.forEach((l) => createdIds.purchaseOrderLines.push(l.id));

      const grn1 = await prisma.goodsReceipt.create({
        data: {
          code: `GRN-DN1-${Date.now().toString().slice(-5)}`,
          status: GrnStatus.PARTIALLY_ACCEPTED,
          purchaseOrderId: po1.id,
          vendorId: testVendor.id,
          receivedById: adminUser.id,
          lines: {
            create: [
              {
                lineNo: 1,
                purchaseOrderLineId: po1.lines[0]!.id,
                challanQtyKg: 100,
                receivedQtyKg: 100,
                acceptedQtyKg: 80,
                rejectedQtyKg: 20,
              },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.goodsReceipts.push(grn1.id);
      grn1.lines.forEach((l) => createdIds.goodsReceiptLines.push(l.id));

      const bill1 = await prisma.vendorBill.create({
        data: {
          code: `AP-DN1-${Date.now().toString().slice(-5)}`,
          basis: "GRN",
          status: VendorBillStatus.APPROVED,
          vendorId: testVendor.id,
          purchaseOrderId: po1.id,
          goodsReceiptId: grn1.id,
          subtotal: 20000,
          taxAmount: 3600,
          totalValue: 23600,
          paidAmount: 0,
          debitedAmount: 0,
          createdById: adminUser.id,
        },
      });
      createdIds.vendorBills.push(bill1.id);

      await prisma.ledgerPosting.createMany({
        data: [
          {
            accountId: purchaseAccount.id,
            side: PostingSide.DEBIT,
            amount: 23600,
            sourceType: PostingSourceType.VENDOR_BILL,
            sourceId: bill1.id,
            vendorBillId: bill1.id,
          },
          {
            accountId: apAccount.id,
            side: PostingSide.CREDIT,
            amount: 23600,
            sourceType: PostingSourceType.VENDOR_BILL,
            sourceId: bill1.id,
            vendorBillId: bill1.id,
          },
        ],
      });

      // Debit 20kg of the 18% line: 20kg @ 200 = 4000 taxable + 720 tax = 4720 total
      const res1 = await raiseDebitNoteCore(
        adminUser.id,
        bill1.id,
        [{ grnLineId: grn1.lines[0]!.id, quantityKg: 20 }],
        "Test 1 single rejected line",
      );

      assert.ifError(res1.error);
      assert.ok(res1.debitNoteId, "Debit note ID must be returned");

      const dn1 = await prisma.debitNote.findUnique({
        where: { id: res1.debitNoteId },
        include: { lines: true },
      });
      assert.ok(dn1, "DebitNote row must exist in DB");
      createdIds.debitNotes.push(dn1.id);
      dn1.lines.forEach((l) => createdIds.debitNoteLines.push(l.id));

      assert.strictEqual(dn1.vendorBillId, bill1.id);
      assert.strictEqual(dn1.goodsReceiptId, grn1.id);
      assert.strictEqual(dn1.status, DebitNoteStatus.ISSUED);
      assert.strictEqual(dn1.lines.length, 1, "Exactly one line should be created");

      // Verify line maths: 20 kg @ 200 = 4000 taxable, 720 tax (18%), 4720 total
      const line1 = dn1.lines[0]!;
      assert.strictEqual(Number(line1.quantity), 20);
      assert.strictEqual(Number(line1.rate), 200);
      assert.strictEqual(Number(line1.taxPct), 18);
      assert.strictEqual(Number(line1.taxableValue), 4000.0);
      assert.strictEqual(Number(line1.taxAmount), 720.0);
      assert.strictEqual(Number(line1.totalValue), 4720.0);
      assert.strictEqual(
        round2(Number(line1.taxableValue) + Number(line1.taxAmount)),
        Number(line1.totalValue),
        "Line taxable + tax must equal line totalValue",
      );

      // Verify header matches lines exactly
      assert.strictEqual(Number(dn1.taxableValue), 4000.0, "Header taxableValue must be 4000.00");
      assert.strictEqual(Number(dn1.taxAmount), 720.0, "Header taxAmount must be 720.00");
      assert.strictEqual(Number(dn1.totalValue), 4720.0, "Header totalValue must be 4720.00");

      const sumLineTaxable = round2(dn1.lines.reduce((sum, l) => sum + Number(l.taxableValue), 0));
      const sumLineTax = round2(dn1.lines.reduce((sum, l) => sum + Number(l.taxAmount), 0));
      const sumLineTotal = round2(dn1.lines.reduce((sum, l) => sum + Number(l.totalValue), 0));

      assert.strictEqual(sumLineTaxable, Number(dn1.taxableValue), "Lines taxableValue must sum to header");
      assert.strictEqual(sumLineTax, Number(dn1.taxAmount), "Lines taxAmount must sum to header");
      assert.strictEqual(sumLineTotal, Number(dn1.totalValue), "Lines totalValue must sum to header");

      // Verify bill debitedAmount incremented
      const updatedBill1 = await prisma.vendorBill.findUnique({ where: { id: bill1.id } });
      assert.strictEqual(Number(updatedBill1?.debitedAmount), 4720.0, "Bill debitedAmount must increment by 4720.00");
      assert.strictEqual(updatedBill1?.status, VendorBillStatus.APPROVED, "Bill remains APPROVED since balance > 0");

      console.log(`  PASS: One rejected line gave 1 note (${dn1.number}) and lines sum exactly to header.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Mixed-rate bill (18% and 5% lines) debiting the 18% line gives the
    // correct tax and matches the posted input tax
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 2] Mixed-rate bill: debiting 18% line gives correct tax and matches posted input tax...");
    let test2BillId = "";
    let test2GrnLine18Id = "";
    {
      // PO with 18% line (100kg @ 200 = 20,000 + 3,600 = 23,600) and 5% line (50kg @ 400 = 20,000 + 1,000 = 21,000)
      // Total subtotal: 40000, taxAmount: 4600, totalValue: 44600
      const po2 = await prisma.purchaseOrder.create({
        data: {
          code: `PO-DN2-${Date.now().toString().slice(-5)}`,
          status: PoStatus.APPROVED,
          vendorId: testVendor.id,
          subtotal: 40000,
          taxAmount: 4600,
          totalValue: 44600,
          raisedById: adminUser.id,
          lines: {
            create: [
              {
                lineNo: 1,
                materialId: testMaterial18.id,
                quantityKg: 100,
                ratePerKg: 200,
                taxPct: 18,
                lineTotal: 23600,
              },
              {
                lineNo: 2,
                materialId: testMaterial5.id,
                quantityKg: 50,
                ratePerKg: 400,
                taxPct: 5,
                lineTotal: 21000,
              },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.purchaseOrders.push(po2.id);
      po2.lines.forEach((l) => createdIds.purchaseOrderLines.push(l.id));

      const grn2 = await prisma.goodsReceipt.create({
        data: {
          code: `GRN-DN2-${Date.now().toString().slice(-5)}`,
          status: GrnStatus.PARTIALLY_ACCEPTED,
          purchaseOrderId: po2.id,
          vendorId: testVendor.id,
          receivedById: adminUser.id,
          lines: {
            create: [
              {
                lineNo: 1,
                purchaseOrderLineId: po2.lines[0]!.id, // 18% line
                challanQtyKg: 100,
                receivedQtyKg: 100,
                acceptedQtyKg: 80,
                rejectedQtyKg: 20,
              },
              {
                lineNo: 2,
                purchaseOrderLineId: po2.lines[1]!.id, // 5% line
                challanQtyKg: 50,
                receivedQtyKg: 50,
                acceptedQtyKg: 40,
                rejectedQtyKg: 10,
              },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.goodsReceipts.push(grn2.id);
      grn2.lines.forEach((l) => createdIds.goodsReceiptLines.push(l.id));
      test2GrnLine18Id = grn2.lines[0]!.id;

      const bill2 = await prisma.vendorBill.create({
        data: {
          code: `AP-DN2-${Date.now().toString().slice(-5)}`,
          basis: "GRN",
          status: VendorBillStatus.APPROVED,
          vendorId: testVendor.id,
          purchaseOrderId: po2.id,
          goodsReceiptId: grn2.id,
          subtotal: 40000,
          taxAmount: 4600,
          totalValue: 44600,
          paidAmount: 0,
          debitedAmount: 0,
          createdById: adminUser.id,
        },
      });
      createdIds.vendorBills.push(bill2.id);
      test2BillId = bill2.id;

      await prisma.ledgerPosting.createMany({
        data: [
          {
            accountId: purchaseAccount.id,
            side: PostingSide.DEBIT,
            amount: 44600,
            sourceType: PostingSourceType.VENDOR_BILL,
            sourceId: bill2.id,
            vendorBillId: bill2.id,
          },
          {
            accountId: apAccount.id,
            side: PostingSide.CREDIT,
            amount: 44600,
            sourceType: PostingSourceType.VENDOR_BILL,
            sourceId: bill2.id,
            vendorBillId: bill2.id,
          },
        ],
      });

      // Debit ONLY the 20kg rejected from the 18% line
      // Correct line tax: 20kg * 200 = 4000 taxable, 4000 * 18% = 720 tax, 4720 total.
      // (If flawed effective ratio 4600/44600 were used, tax would be 486.82 - verify it is strictly 720.00!)
      const res2 = await raiseDebitNoteCore(
        adminUser.id,
        bill2.id,
        [{ grnLineId: test2GrnLine18Id, quantityKg: 20 }],
        "Test 2 mixed rate line debit",
      );

      assert.ifError(res2.error);
      const dn2 = await prisma.debitNote.findUnique({
        where: { id: res2.debitNoteId },
        include: { lines: true },
      });
      assert.ok(dn2);
      createdIds.debitNotes.push(dn2.id);
      dn2.lines.forEach((l) => createdIds.debitNoteLines.push(l.id));

      assert.strictEqual(Number(dn2.taxableValue), 4000.0, "Taxable value must be exactly 4000.00");
      assert.strictEqual(Number(dn2.taxAmount), 720.0, "Tax amount must be exactly 720.00 (not effective ratio)");
      assert.strictEqual(Number(dn2.totalValue), 4720.0, "Total value must be exactly 4720.00");

      // Verify postings: must carry DEBIT_NOTE, reverse AP and Purchases, and match posted input tax
      const postings2 = await prisma.ledgerPosting.findMany({
        where: {
          vendorBillId: bill2.id,
          sourceType: PostingSourceType.DEBIT_NOTE,
        },
        include: { account: true },
      });

      // Postings should have:
      // 1. DEBIT on 2000 Accounts Payable for 4720.00
      // 2. CREDIT on 5000 Purchases for 4000.00 (taxable)
      // 3. CREDIT on 2100 (Tax account) for 720.00 (input tax reversal)
      const debitAp = postings2.find((p) => p.account.code === "2000" && p.side === PostingSide.DEBIT);
      const creditPurchases = postings2.find((p) => p.account.code === "5000" && p.side === PostingSide.CREDIT);
      const creditTax = postings2.find((p) => (p.account.code === "2100" || p.account.code === "1500") && p.side === PostingSide.CREDIT);

      assert.ok(debitAp, "Debit posting on 2000 Accounts Payable must exist");
      assert.strictEqual(Number(debitAp.amount), 4720.0, "Debit to AP must be full note value 4720.00");

      assert.ok(creditPurchases, "Credit posting on 5000 Purchases must exist");
      assert.strictEqual(Number(creditPurchases.amount), 4000.0, "Credit to Purchases must equal taxable value 4000.00");

      assert.ok(creditTax, "Credit posting on Tax Account must exist");
      assert.strictEqual(Number(creditTax.amount), 720.0, "Credit to Tax Account must match note tax 720.00");

      // Header tax matches the posted input tax
      assert.strictEqual(
        Number(dn2.taxAmount),
        Number(creditTax.amount),
        "Debit note taxAmount must match the posted input tax",
      );

      // Verify double-entry balance: Debits === Credits
      const totalDebits = round2(postings2.filter((p) => p.side === PostingSide.DEBIT).reduce((s, p) => s + Number(p.amount), 0));
      const totalCredits = round2(postings2.filter((p) => p.side === PostingSide.CREDIT).reduce((s, p) => s + Number(p.amount), 0));
      assert.strictEqual(totalDebits, totalCredits, "Debit note ledger postings must be double-entry balanced");
      assert.strictEqual(totalDebits, 4720.0, "Total debit must equal note total value 4720.00");

      console.log(`  PASS: 18% line debited with exact tax ₹720.00 matching posted input tax ₹${creditTax.amount}.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Re-raising the same lines is rejected, no second note
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 3] Re-raising the same lines is rejected, no second note...");
    {
      const countBefore = await prisma.debitNote.count({
        where: { vendorBillId: test2BillId },
      });
      assert.strictEqual(countBefore, 1, "Should have 1 debit note before re-raising attempt");

      // Attempt to re-raise debit note for the exact same GRN line
      const repeatRes = await raiseDebitNoteCore(
        adminUser.id,
        test2BillId,
        [{ grnLineId: test2GrnLine18Id, quantityKg: 20 }],
        "Duplicate attempt",
      );

      assert.ok(repeatRes.error, "Re-raising debit note on the same lines must return an error");
      console.log(`  - Re-raise rejected with expected message: "${repeatRes.error}"`);

      const countAfter = await prisma.debitNote.count({
        where: { vendorBillId: test2BillId },
      });
      assert.strictEqual(countAfter, 1, "Count of debit notes must remain 1 — NO second note created");

      console.log("  PASS: Re-raising same lines was rejected and prevented duplicate note creation.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Debit above open balance is rejected or handled per notes
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 4] Debit above open balance is rejected or handled per notes...");
    {
      // 4A: Fully paid bill (open balance = 0) -> Rejected with error + UNAPPLIED_DEBIT audit event
      const po4a = await prisma.purchaseOrder.create({
        data: {
          code: `PO-DN4A-${Date.now().toString().slice(-5)}`,
          status: PoStatus.APPROVED,
          vendorId: testVendor.id,
          subtotal: 5000,
          taxAmount: 900,
          totalValue: 5900,
          raisedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, materialId: testMaterial18.id, quantityKg: 25, ratePerKg: 200, taxPct: 18, lineTotal: 5900 }],
          },
        },
        include: { lines: true },
      });
      createdIds.purchaseOrders.push(po4a.id);
      po4a.lines.forEach((l) => createdIds.purchaseOrderLines.push(l.id));

      const grn4a = await prisma.goodsReceipt.create({
        data: {
          code: `GRN-DN4A-${Date.now().toString().slice(-5)}`,
          status: GrnStatus.PARTIALLY_ACCEPTED,
          purchaseOrderId: po4a.id,
          vendorId: testVendor.id,
          receivedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, purchaseOrderLineId: po4a.lines[0]!.id, challanQtyKg: 25, receivedQtyKg: 25, acceptedQtyKg: 15, rejectedQtyKg: 10 }],
          },
        },
        include: { lines: true },
      });
      createdIds.goodsReceipts.push(grn4a.id);
      grn4a.lines.forEach((l) => createdIds.goodsReceiptLines.push(l.id));

      // Bill is FULLY PAID (paidAmount = 5900)
      const bill4a = await prisma.vendorBill.create({
        data: {
          code: `AP-DN4A-${Date.now().toString().slice(-5)}`,
          basis: "GRN",
          status: VendorBillStatus.PAID,
          vendorId: testVendor.id,
          purchaseOrderId: po4a.id,
          goodsReceiptId: grn4a.id,
          subtotal: 5000,
          taxAmount: 900,
          totalValue: 5900,
          paidAmount: 5900,
          debitedAmount: 0,
          createdById: adminUser.id,
        },
      });
      createdIds.vendorBills.push(bill4a.id);

      const res4a = await raiseDebitNoteCore(
        adminUser.id,
        bill4a.id,
        [{ grnLineId: grn4a.lines[0]!.id, quantityKg: 10 }],
        "Debit against paid bill",
      );

      assert.ok(res4a.error, "Debit against fully paid bill must return an error");
      assert.ok(res4a.error.includes("no remaining balance"), "Error message must state no remaining balance");

      const audit4a = await prisma.auditEvent.findFirst({
        where: { entityType: "VendorBill", entityId: bill4a.id, action: "UNAPPLIED_DEBIT" },
      });
      assert.ok(audit4a, "AuditEvent UNAPPLIED_DEBIT must be created for fully paid bill");
      assert.ok(audit4a.summary.includes("zero remaining balance"));

      // 4B: Partially open bill (open balance = 1000, debit calculated = 2360) -> Capped at open balance 1000
      const po4b = await prisma.purchaseOrder.create({
        data: {
          code: `PO-DN4B-${Date.now().toString().slice(-5)}`,
          status: PoStatus.APPROVED,
          vendorId: testVendor.id,
          subtotal: 10000,
          taxAmount: 1800,
          totalValue: 11800,
          raisedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, materialId: testMaterial18.id, quantityKg: 50, ratePerKg: 200, taxPct: 18, lineTotal: 11800 }],
          },
        },
        include: { lines: true },
      });
      createdIds.purchaseOrders.push(po4b.id);
      po4b.lines.forEach((l) => createdIds.purchaseOrderLines.push(l.id));

      const grn4b = await prisma.goodsReceipt.create({
        data: {
          code: `GRN-DN4B-${Date.now().toString().slice(-5)}`,
          status: GrnStatus.PARTIALLY_ACCEPTED,
          purchaseOrderId: po4b.id,
          vendorId: testVendor.id,
          receivedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, purchaseOrderLineId: po4b.lines[0]!.id, challanQtyKg: 50, receivedQtyKg: 50, acceptedQtyKg: 40, rejectedQtyKg: 10 }],
          },
        },
        include: { lines: true },
      });
      createdIds.goodsReceipts.push(grn4b.id);
      grn4b.lines.forEach((l) => createdIds.goodsReceiptLines.push(l.id));

      // Bill has open balance of 1000 (total 11800, paid 10800)
      const bill4b = await prisma.vendorBill.create({
        data: {
          code: `AP-DN4B-${Date.now().toString().slice(-5)}`,
          basis: "GRN",
          status: VendorBillStatus.PARTIALLY_PAID,
          vendorId: testVendor.id,
          purchaseOrderId: po4b.id,
          goodsReceiptId: grn4b.id,
          subtotal: 10000,
          taxAmount: 1800,
          totalValue: 11800,
          paidAmount: 10800,
          debitedAmount: 0,
          createdById: adminUser.id,
        },
      });
      createdIds.vendorBills.push(bill4b.id);

      // 10kg rejected @ 200 + 18% = 2360. Exceeds open balance 1000!
      const res4b = await raiseDebitNoteCore(
        adminUser.id,
        bill4b.id,
        [{ grnLineId: grn4b.lines[0]!.id, quantityKg: 10 }],
        "Debit exceeding open balance",
      );

      assert.ifError(res4b.error);
      const dn4b = await prisma.debitNote.findUnique({
        where: { id: res4b.debitNoteId },
        include: { lines: true },
      });
      assert.ok(dn4b);
      createdIds.debitNotes.push(dn4b.id);
      dn4b.lines.forEach((l) => createdIds.debitNoteLines.push(l.id));

      // Note must be capped at 1000.00
      assert.strictEqual(Number(dn4b.totalValue), 1000.0, "Capped debit note totalValue must equal open balance 1000.00");
      const sumLines4b = round2(dn4b.lines.reduce((s, l) => s + Number(l.totalValue), 0));
      assert.strictEqual(sumLines4b, 1000.0, "Capped lines must sum to header totalValue 1000.00");

      // Verify AuditEvent recorded excess unapplied
      const audit4b = await prisma.auditEvent.findFirst({
        where: { entityType: "VendorBill", entityId: bill4b.id, action: "UNAPPLIED_DEBIT" },
      });
      assert.ok(audit4b, "AuditEvent UNAPPLIED_DEBIT must exist for capped note");
      assert.ok(audit4b.summary.includes("Unapplied excess: ₹1360.00"));

      // Verify bill is settled to PAID
      const updatedBill4b = await prisma.vendorBill.findUnique({ where: { id: bill4b.id } });
      assert.strictEqual(Number(updatedBill4b?.debitedAmount), 1000.0);
      assert.strictEqual(updatedBill4b?.status, VendorBillStatus.PAID, "Bill should transition to PAID when balance is zero");

      console.log("  PASS: Zero open balance rejected with AuditEvent; partial open balance capped at 1000 with excess logged.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Debit then payment: payment above total - paid - debited is rejected
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 5] Debit then payment: payment above total - paid - debited is rejected...");
    {
      const po5 = await prisma.purchaseOrder.create({
        data: {
          code: `PO-DN5-${Date.now().toString().slice(-5)}`,
          status: PoStatus.APPROVED,
          vendorId: testVendor.id,
          subtotal: 10000,
          taxAmount: 1800,
          totalValue: 11800,
          raisedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, materialId: testMaterial18.id, quantityKg: 50, ratePerKg: 200, taxPct: 18, lineTotal: 11800 }],
          },
        },
        include: { lines: true },
      });
      createdIds.purchaseOrders.push(po5.id);
      po5.lines.forEach((l) => createdIds.purchaseOrderLines.push(l.id));

      const grn5 = await prisma.goodsReceipt.create({
        data: {
          code: `GRN-DN5-${Date.now().toString().slice(-5)}`,
          status: GrnStatus.PARTIALLY_ACCEPTED,
          purchaseOrderId: po5.id,
          vendorId: testVendor.id,
          receivedById: adminUser.id,
          lines: {
            create: [{ lineNo: 1, purchaseOrderLineId: po5.lines[0]!.id, challanQtyKg: 50, receivedQtyKg: 50, acceptedQtyKg: 30, rejectedQtyKg: 20 }],
          },
        },
        include: { lines: true },
      });
      createdIds.goodsReceipts.push(grn5.id);
      grn5.lines.forEach((l) => createdIds.goodsReceiptLines.push(l.id));

      const bill5 = await prisma.vendorBill.create({
        data: {
          code: `AP-DN5-${Date.now().toString().slice(-5)}`,
          basis: "GRN",
          status: VendorBillStatus.APPROVED,
          vendorId: testVendor.id,
          purchaseOrderId: po5.id,
          goodsReceiptId: grn5.id,
          subtotal: 10000,
          taxAmount: 1800,
          totalValue: 11800,
          paidAmount: 0,
          debitedAmount: 0,
          createdById: adminUser.id,
        },
      });
      createdIds.vendorBills.push(bill5.id);

      // Debit 10kg = 10 * 200 + 18% = 2360.00
      const res5 = await raiseDebitNoteCore(
        adminUser.id,
        bill5.id,
        [{ grnLineId: grn5.lines[0]!.id, quantityKg: 10 }],
        "Debit before payment test",
      );

      assert.ifError(res5.error);
      const dn5 = await prisma.debitNote.findUnique({ where: { id: res5.debitNoteId } });
      assert.ok(dn5);
      createdIds.debitNotes.push(dn5.id);

      const debitedBill5 = await prisma.vendorBill.findUnique({ where: { id: bill5.id } });
      assert.strictEqual(Number(debitedBill5?.debitedAmount), 2360.0);

      // Open balance = 11800 - 0 - 2360 = 9440.00
      // 1. Attempt payment exceeding open balance (e.g. 9440.01 or 9500)
      const overPayReq = new Request(`http://localhost/api/finance/payable/${bill5.id}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": adminUser.id,
        },
        body: JSON.stringify({ amount: 9441 }),
      });

      const overPayRes = await payBill(overPayReq, { params: Promise.resolve({ billId: bill5.id }) });
      const overPayBody = await overPayRes.json();

      assert.strictEqual(overPayRes.status, 400, "Payment above (total - paid - debited) must be rejected with status 400");
      assert.ok(overPayBody.error?.includes("exceeds remaining balance"), "Error message must indicate exceeding balance");

      // Verify paidAmount was not changed
      const unchangedBill5 = await prisma.vendorBill.findUnique({ where: { id: bill5.id } });
      assert.strictEqual(Number(unchangedBill5?.paidAmount), 0);

      // 2. Apply valid payment of exact remaining balance (9440.00)
      const validPayReq = new Request(`http://localhost/api/finance/payable/${bill5.id}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-user-id": adminUser.id,
        },
        body: JSON.stringify({ amount: 9440 }),
      });

      const validPayRes = await payBill(validPayReq, { params: Promise.resolve({ billId: bill5.id }) });
      assert.strictEqual(validPayRes.status, 200, "Payment of exact remaining balance must succeed with status 200");

      const settledBill5 = await prisma.vendorBill.findUnique({ where: { id: bill5.id } });
      assert.strictEqual(Number(settledBill5?.paidAmount), 9440.0);
      assert.strictEqual(settledBill5?.status, VendorBillStatus.PAID, "Bill status must transition to PAID");

      console.log("  PASS: Payment of ₹9,441 rejected (> remaining ₹9,440); payment of ₹9,440 settled bill to PAID.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Postings carry DEBIT_NOTE and balance
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 6] Postings carry DEBIT_NOTE and balance...");
    {
      const postings = await prisma.ledgerPosting.findMany({
        where: {
          vendorBillId: test2BillId,
          sourceType: PostingSourceType.DEBIT_NOTE,
        },
        include: { account: true },
      });

      assert.ok(postings.length >= 2, "Must have at least 2 postings for debit note");

      for (const p of postings) {
        assert.strictEqual(p.sourceType, PostingSourceType.DEBIT_NOTE, "Every posting must have sourceType DEBIT_NOTE");
        assert.ok(p.remark?.includes("Debit note DN-"), `Posting remark must reference debit note number: "${p.remark}"`);
      }

      const totalDebit = round2(postings.filter((p) => p.side === PostingSide.DEBIT).reduce((s, p) => s + Number(p.amount), 0));
      const totalCredit = round2(postings.filter((p) => p.side === PostingSide.CREDIT).reduce((s, p) => s + Number(p.amount), 0));

      assert.strictEqual(totalDebit, totalCredit, "Debits and Credits must be equal and balanced");
      assert.strictEqual(totalDebit, 4720.0, "Total debit must equal note total value 4720.00");

      console.log(`  PASS: Ledger postings verified with sourceType DEBIT_NOTE, reference DN code, and balanced at ₹4,720.00.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Number uniqueness
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 7] Number uniqueness...");
    {
      const createdNotes = await prisma.debitNote.findMany({
        where: { id: { in: createdIds.debitNotes } },
        select: { id: true, number: true },
      });

      assert.ok(createdNotes.length >= 3, "At least 3 debit notes should have been created across tests");

      const dnPattern = /^DN-\d{4}-\d{4}$/;
      const seenNumbers = new Set<string>();

      for (const note of createdNotes) {
        assert.ok(dnPattern.test(note.number), `Debit note number ${note.number} must match pattern DN-YYYY-NNNN`);
        assert.ok(!seenNumbers.has(note.number), `Duplicate debit note number detected: ${note.number}`);
        seenNumbers.add(note.number);
      }

      assert.strictEqual(seenNumbers.size, createdNotes.length, "All debit note numbers must be strictly unique");

      console.log(`  PASS: ${createdNotes.length} debit note numbers checked: all match DN-YYYY-NNNN and are strictly unique.`);
    }

    console.log("\n=== ALL DEBIT NOTE TESTS PASSED SUCCESSFULLY ===");
  } finally {
    // ── Teardown in Strict Dependency Order ───────────────────────────────────
    console.log("\n[TEARDOWN] Cleaning up test fixtures in strict dependency order...");

    try {
      if (createdIds.debitNoteLines.length > 0) {
        await prisma.debitNoteLine.deleteMany({ where: { id: { in: createdIds.debitNoteLines } } });
      }
      if (createdIds.debitNotes.length > 0) {
        await prisma.debitNote.deleteMany({ where: { id: { in: createdIds.debitNotes } } });
      }
      if (createdIds.vendorBills.length > 0) {
        await prisma.ledgerPosting.deleteMany({ where: { vendorBillId: { in: createdIds.vendorBills } } });
        await prisma.vendorBill.deleteMany({ where: { id: { in: createdIds.vendorBills } } });
      }
      if (createdIds.goodsReceiptLines.length > 0) {
        await prisma.goodsReceiptLine.deleteMany({ where: { id: { in: createdIds.goodsReceiptLines } } });
      }
      if (createdIds.goodsReceipts.length > 0) {
        await prisma.goodsReceipt.deleteMany({ where: { id: { in: createdIds.goodsReceipts } } });
      }
      if (createdIds.purchaseOrderLines.length > 0) {
        await prisma.purchaseOrderLine.deleteMany({ where: { id: { in: createdIds.purchaseOrderLines } } });
      }
      if (createdIds.purchaseOrders.length > 0) {
        await prisma.purchaseOrder.deleteMany({ where: { id: { in: createdIds.purchaseOrders } } });
      }
      if (createdIds.materials.length > 0) {
        await prisma.rawMaterial.deleteMany({ where: { id: { in: createdIds.materials } } });
      }
      if (createdIds.vendors.length > 0) {
        await prisma.vendor.deleteMany({ where: { id: { in: createdIds.vendors } } });
      }
      console.log("[TEARDOWN] Completed successfully.");
    } catch (teardownErr) {
      console.error("[TEARDOWN ERROR]:", teardownErr);
    }
  }
}

runDebitNoteTests()
  .catch((err) => {
    console.error("Fatal Test Suite Failure:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
