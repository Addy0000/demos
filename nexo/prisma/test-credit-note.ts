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
const { inspectSalesReturnCore } = require("../src/app/(app)/sales/sales-core");
import {
  SalesInvoiceStatus,
  SalesOrderStatus,
  PostingSide,
  PostingSourceType,
  QcResult,
  Industry,
  CreditNoteStatus,
} from "@prisma/client";

const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
const round3 = (num: number) => Math.round((num + Number.EPSILON) * 1000) / 1000;

async function runCreditNoteTests() {
  console.log("=== CREDIT NOTE SYSTEM TEST SUITE START ===");

  // Track created entity IDs for clean teardown
  const createdIds = {
    creditNoteLines: [] as string[],
    creditNotes: [] as string[],
    ledgerPostings: [] as string[],
    returns: [] as string[],
    invoices: [] as string[],
    orders: [] as string[],
    customers: [] as string[],
    projects: [] as string[],
  };

  try {
    // ── Setup Shared Test Fixtures ───────────────────────────────────────────
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!adminUser) throw new Error("No ADMIN user found in database!");

    const testCustomer = await prisma.customer.create({
      data: {
        code: `CUST-CN-${Date.now().toString().slice(-5)}`,
        name: `Credit Note Test Customer ${Date.now().toString().slice(-4)}`,
        status: "ACTIVE",
        industry: Industry.OTHER,
        outstandingAmt: 0,
        creditLimit: 1000000,
        creditDays: 30,
      },
    });
    createdIds.customers.push(testCustomer.id);

    const testProject1 = await prisma.project.create({
      data: {
        code: `PRJ-CN1-${Date.now().toString().slice(-4)}`,
        name: `CN PVC Compound Alpha`,
        application: "Rigid PVC Pipes",
        customerId: testCustomer.id,
      },
    });
    createdIds.projects.push(testProject1.id);

    const testProject2 = await prisma.project.create({
      data: {
        code: `PRJ-CN2-${Date.now().toString().slice(-4)}`,
        name: `CN Masterbatch Beta`,
        application: "Cable Sheathing",
        customerId: testCustomer.id,
      },
    });
    createdIds.projects.push(testProject2.id);

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Single-invoice return gives one note, and lines sum to the header
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 1] Single-invoice return gives one note, and lines sum to header...");
    {
      // Order with 2 lines: Line 1: 50 kg @ 100 (18% tax) = 5900; Line 2: 50 kg @ 200 (18% tax) = 11800. Total = 17700
      const so1 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN1-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 15000,
          taxAmount: 2700,
          totalValue: 17700,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 100, taxPct: 18, quantityKg: 50, dispatchedKg: 50, lineTotal: 5900 },
              { lineNo: 2, projectId: testProject2.id, ratePerKg: 200, taxPct: 18, quantityKg: 50, dispatchedKg: 50, lineTotal: 11800 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so1.id);

      const inv1 = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN1-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so1.id,
          customerId: testCustomer.id,
          subtotal: 15000,
          taxAmount: 2700,
          totalValue: 17700,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
        },
      });
      createdIds.invoices.push(inv1.id);

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 17700 } },
      });

      // Return 25 kg from Line 1 (25 * 100 * 1.18 = 2950) + 25 kg from Line 2 (25 * 200 * 1.18 = 5900). Total credit = 8850.
      const ret1 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN1-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so1.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          reason: "Quality variation across batch",
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so1.lines[0]!.id, quantityKg: 25 },
              { lineNo: 2, projectId: testProject2.id, salesOrderLineId: so1.lines[1]!.id, quantityKg: 25 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret1.id);

      const settleRes1 = await inspectSalesReturnCore(
        adminUser.id,
        ret1.id,
        JSON.stringify([
          { lineId: ret1.lines[0]!.id, restockedKg: 25, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
          { lineId: ret1.lines[1]!.id, restockedKg: 25, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 1 inspection"
      );
      if (settleRes1.error) throw new Error(`Test 1 inspect failed: ${settleRes1.error}`);

      // Verify single credit note
      const cns1 = await prisma.creditNote.findMany({
        where: { salesReturnId: ret1.id },
        include: { lines: true },
      });
      assert.strictEqual(cns1.length, 1, "Exactly ONE CreditNote must be created for single-invoice return");
      const cn1 = cns1[0]!;
      createdIds.creditNotes.push(cn1.id);
      cn1.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));

      assert.strictEqual(cn1.salesInvoiceId, inv1.id);
      assert.strictEqual(cn1.status, CreditNoteStatus.ISSUED);
      assert.strictEqual(Number(cn1.totalValue), 8850.0);
      assert.strictEqual(Number(cn1.taxAmount), 1350.0); // 8850 * (2700 / 17700) = 1350
      assert.strictEqual(Number(cn1.taxableValue), 7500.0); // 8850 - 1350 = 7500

      // Verify lines sum exactly to header
      assert.strictEqual(cn1.lines.length, 2, "Credit note must have 2 lines");
      const sumLineTotal = round2(cn1.lines.reduce((acc, l) => acc + Number(l.totalValue), 0));
      const sumLineTax = round2(cn1.lines.reduce((acc, l) => acc + Number(l.taxAmount), 0));
      const sumLineTaxable = round2(cn1.lines.reduce((acc, l) => acc + Number(l.taxableValue), 0));

      assert.strictEqual(sumLineTotal, Number(cn1.totalValue), "Line total values must sum exactly to header totalValue");
      assert.strictEqual(sumLineTax, Number(cn1.taxAmount), "Line tax amounts must sum exactly to header taxAmount");
      assert.strictEqual(sumLineTaxable, Number(cn1.taxableValue), "Line taxable values must sum exactly to header taxableValue");

      // Verify each line internal balance
      for (const line of cn1.lines) {
        const lineSum = round2(Number(line.taxableValue) + Number(line.taxAmount));
        assert.strictEqual(lineSum, Number(line.totalValue), `Line ${line.id} taxable + tax must equal line totalValue`);
      }

      console.log(`  PASS: Single-invoice return gave 1 note (${cn1.number}) and lines sum exactly to header.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: A return spanning two invoices gives two notes
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 2] Return spanning two invoices gives two notes...");
    let ret2Id = "";
    let inv2aId = "";
    let inv2bId = "";
    {
      const so2 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN2-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 25000,
          taxAmount: 4500,
          totalValue: 29500,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 100, taxPct: 18, quantityKg: 250, dispatchedKg: 250, lineTotal: 29500 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so2.id);

      // Invoice 2a: ₹11,800 (100 kg)
      const inv2a = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN2A-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so2.id,
          customerId: testCustomer.id,
          subtotal: 10000,
          taxAmount: 1800,
          totalValue: 11800,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
          createdAt: new Date(Date.now() - 60000), // Older invoice
        },
      });
      createdIds.invoices.push(inv2a.id);
      inv2aId = inv2a.id;

      // Invoice 2b: ₹17,700 (150 kg)
      const inv2b = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN2B-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so2.id,
          customerId: testCustomer.id,
          subtotal: 15000,
          taxAmount: 2700,
          totalValue: 17700,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
          createdAt: new Date(), // Newer invoice
        },
      });
      createdIds.invoices.push(inv2b.id);
      inv2bId = inv2b.id;

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 29500 } },
      });

      // Return 150 kg (150 * 100 * 1.18 = ₹17,700 total credit)
      // This will completely exhaust Invoice 2a (₹11,800) and spill ₹5,900 onto Invoice 2b
      const ret2 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN2-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so2.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          reason: "Customer surplus return spanning multiple shipments",
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so2.lines[0]!.id, quantityKg: 150 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret2.id);
      ret2Id = ret2.id;

      const settleRes2 = await inspectSalesReturnCore(
        adminUser.id,
        ret2.id,
        JSON.stringify([
          { lineId: ret2.lines[0]!.id, restockedKg: 150, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 2 inspection"
      );
      if (settleRes2.error) throw new Error(`Test 2 inspect failed: ${settleRes2.error}`);

      // Verify two credit notes created
      const cns2 = await prisma.creditNote.findMany({
        where: { salesReturnId: ret2.id },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      });
      assert.strictEqual(cns2.length, 2, "A return spanning two invoices must give exactly TWO notes");
      cns2.forEach((cn) => {
        createdIds.creditNotes.push(cn.id);
        cn.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));
      });

      const [cn2a, cn2b] = cns2;

      // Note 2a applied to Invoice 2a
      assert.strictEqual(cn2a.salesInvoiceId, inv2a.id);
      assert.strictEqual(Number(cn2a.totalValue), 11800.0);
      assert.strictEqual(Number(cn2a.taxAmount), 1800.0);
      assert.strictEqual(Number(cn2a.taxableValue), 10000.0);

      // Note 2b applied to Invoice 2b
      assert.strictEqual(cn2b.salesInvoiceId, inv2b.id);
      assert.strictEqual(Number(cn2b.totalValue), 5900.0);
      assert.strictEqual(Number(cn2b.taxAmount), 900.0);
      assert.strictEqual(Number(cn2b.taxableValue), 5000.0);

      // Invoices updated correctly
      const updatedInv2a = await prisma.salesInvoice.findUnique({ where: { id: inv2a.id } });
      const updatedInv2b = await prisma.salesInvoice.findUnique({ where: { id: inv2b.id } });
      assert.strictEqual(updatedInv2a?.status, SalesInvoiceStatus.PAID, "Invoice 2a should be PAID");
      assert.strictEqual(Number(updatedInv2a?.creditedAmount), 11800.0);
      assert.strictEqual(updatedInv2b?.status, SalesInvoiceStatus.RAISED, "Invoice 2b should remain RAISED");
      assert.strictEqual(Number(updatedInv2b?.creditedAmount), 5900.0);

      console.log(`  PASS: Return spanning two invoices created 2 notes (${cn2a.number} for ₹11,800, ${cn2b.number} for ₹5,900).`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Re-running gives no new notes
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 3] Re-running gives no new notes...");
    {
      const notesBefore = await prisma.creditNote.findMany({ where: { salesReturnId: ret2Id } });
      const ret2 = await prisma.salesReturn.findUnique({ where: { id: ret2Id }, include: { lines: true } });

      const repeatRes = await inspectSalesReturnCore(
        adminUser.id,
        ret2Id,
        JSON.stringify([
          { lineId: ret2!.lines[0]!.id, restockedKg: 150, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Duplicate inspect attempt"
      );

      assert.ok(repeatRes.error, "Re-running inspectSalesReturnCore should return an error");
      console.log(`  - Re-run error response: "${repeatRes.error}"`);

      const notesAfter = await prisma.creditNote.findMany({ where: { salesReturnId: ret2Id } });
      assert.strictEqual(notesAfter.length, notesBefore.length, "Count of credit notes must not change on re-run");

      // Verify invoice credited amounts didn't change
      const inv2aAfter = await prisma.salesInvoice.findUnique({ where: { id: inv2aId } });
      const inv2bAfter = await prisma.salesInvoice.findUnique({ where: { id: inv2bId } });
      assert.strictEqual(Number(inv2aAfter?.creditedAmount), 11800.0, "Invoice 2a creditedAmount must not change");
      assert.strictEqual(Number(inv2bAfter?.creditedAmount), 5900.0, "Invoice 2b creditedAmount must not change");

      console.log("  PASS: Re-running inspectSalesReturnCore gave 0 new notes and kept creditedAmount intact.");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Excess beyond invoice balance gives no note for the excess
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 4] Excess beyond invoice balance gives no note for the excess...");
    {
      // Invoice balance is ₹5,900 (50 kg @ 100 + 18%)
      const so4 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN4-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 5000,
          taxAmount: 900,
          totalValue: 5900,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 100, taxPct: 18, quantityKg: 50, dispatchedKg: 50, lineTotal: 5900 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so4.id);

      const inv4 = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN4-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so4.id,
          customerId: testCustomer.id,
          subtotal: 5000,
          taxAmount: 900,
          totalValue: 5900,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
        },
      });
      createdIds.invoices.push(inv4.id);

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 5900 } },
      });

      // Return 100 kg = ₹11,800 credit. Excess is ₹5,900.
      const ret4 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN4-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so4.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          reason: "Major defect return",
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so4.lines[0]!.id, quantityKg: 100 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret4.id);

      const settleRes4 = await inspectSalesReturnCore(
        adminUser.id,
        ret4.id,
        JSON.stringify([
          { lineId: ret4.lines[0]!.id, restockedKg: 100, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 4 inspection"
      );
      if (settleRes4.error) throw new Error(`Test 4 inspect failed: ${settleRes4.error}`);

      // Verify exactly ONE credit note created for ₹5,900 (amount applied to invoice)
      const cns4 = await prisma.creditNote.findMany({ where: { salesReturnId: ret4.id }, include: { lines: true } });
      assert.strictEqual(cns4.length, 1, "Must create exactly ONE credit note for the applied amount, NO note for excess");
      const cn4 = cns4[0]!;
      createdIds.creditNotes.push(cn4.id);
      cn4.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));

      assert.strictEqual(Number(cn4.totalValue), 5900.0, "Credit note totalValue must equal applied amount ₹5,900");

      // Verify AuditEvent recorded excess
      const audit4 = await prisma.auditEvent.findFirst({
        where: { entityType: "SalesReturn", entityId: ret4.id, action: "CREDIT" },
      });
      assert.ok(audit4, "AuditEvent for credit must exist");
      assert.ok(audit4.summary.includes("Excess unapplied: ₹5900.00"), "AuditEvent summary must record excess unapplied");
      assert.strictEqual((audit4.metadata as any)?.excessCredit, 5900, "AuditEvent metadata must record excessCredit 5900");

      console.log(`  PASS: Excess beyond invoice balance gave 1 note (${cn4.number} for ₹5,900) and NO note for excess ₹5,900.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Tax split sums correctly
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 5] Tax split sums correctly with odd numbers & remainder to taxable...");
    {
      // Invoice with non-trivial tax split:
      // subtotal: 33333.33, taxAmount: 6000.00, totalValue: 39333.33
      // Effective tax ratio: 6000 / 39333.33 = 0.15254238...
      const so5 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN5-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 33333.33,
          taxAmount: 6000.0,
          totalValue: 39333.33,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 100, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 11800 },
              { lineNo: 2, projectId: testProject2.id, ratePerKg: 100, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 11800 },
              { lineNo: 3, projectId: testProject1.id, ratePerKg: 133.33, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 15733.33 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so5.id);

      const inv5 = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN5-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so5.id,
          customerId: testCustomer.id,
          subtotal: 33333.33,
          taxAmount: 6000.0,
          totalValue: 39333.33,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
        },
      });
      createdIds.invoices.push(inv5.id);

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 39333.33 } },
      });

      // Return partial amount: 50 kg from Line 1 + 50 kg from Line 2 = ₹11,800
      const ret5 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN5-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so5.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so5.lines[0]!.id, quantityKg: 50 },
              { lineNo: 2, projectId: testProject2.id, salesOrderLineId: so5.lines[1]!.id, quantityKg: 50 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret5.id);

      const settleRes5 = await inspectSalesReturnCore(
        adminUser.id,
        ret5.id,
        JSON.stringify([
          { lineId: ret5.lines[0]!.id, restockedKg: 50, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
          { lineId: ret5.lines[1]!.id, restockedKg: 50, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 5 inspection"
      );
      if (settleRes5.error) throw new Error(`Test 5 inspect failed: ${settleRes5.error}`);

      const cns5 = await prisma.creditNote.findMany({ where: { salesReturnId: ret5.id }, include: { lines: true } });
      assert.strictEqual(cns5.length, 1);
      const cn5 = cns5[0]!;
      createdIds.creditNotes.push(cn5.id);
      cn5.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));

      const appliedAmount = 11800.0;
      const effectiveRatio = 6000.0 / 39333.33;
      const expectedTax = round2(appliedAmount * effectiveRatio); // round2(11800 * 0.15254238...) = 1800.00
      const expectedTaxable = round2(appliedAmount - expectedTax); // 11800 - 1800 = 10000.00

      assert.strictEqual(Number(cn5.totalValue), appliedAmount);
      assert.strictEqual(Number(cn5.taxAmount), expectedTax);
      assert.strictEqual(Number(cn5.taxableValue), expectedTaxable);
      assert.strictEqual(round2(Number(cn5.taxableValue) + Number(cn5.taxAmount)), Number(cn5.totalValue));

      // Verify line-level tax split
      const lineTotalSum = round2(cn5.lines.reduce((acc, l) => acc + Number(l.totalValue), 0));
      const lineTaxSum = round2(cn5.lines.reduce((acc, l) => acc + Number(l.taxAmount), 0));
      const lineTaxableSum = round2(cn5.lines.reduce((acc, l) => acc + Number(l.taxableValue), 0));

      assert.strictEqual(lineTotalSum, Number(cn5.totalValue));
      assert.strictEqual(lineTaxSum, Number(cn5.taxAmount));
      assert.strictEqual(lineTaxableSum, Number(cn5.taxableValue));

      for (const line of cn5.lines) {
        assert.strictEqual(
          round2(Number(line.taxableValue) + Number(line.taxAmount)),
          Number(line.totalValue),
          "Each line's taxable + tax must equal line total"
        );
      }

      console.log(`  PASS: Tax split verified: taxable ₹${cn5.taxableValue} + tax ₹${cn5.taxAmount} = total ₹${cn5.totalValue}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Postings carry CREDIT_NOTE
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 6] Postings carry CREDIT_NOTE and reference credit note number...");
    {
      const postings = await prisma.ledgerPosting.findMany({
        where: { sourceId: ret2Id },
        include: { account: true },
      });

      assert.strictEqual(postings.length, 3, "Return should generate exactly 3 ledger postings");

      const allCreditNoteSource = postings.every((p) => p.sourceType === PostingSourceType.CREDIT_NOTE);
      assert.ok(allCreditNoteSource, "All return ledger postings must carry sourceType CREDIT_NOTE");

      // Verify remark references credit note number
      const cns = await prisma.creditNote.findMany({ where: { salesReturnId: ret2Id } });
      const cnNumbers = cns.map((c) => c.number);

      for (const p of postings) {
        const containsCnNum = cnNumbers.some((num) => p.remark?.includes(num));
        assert.ok(containsCnNum, `Posting remark "${p.remark}" must reference credit note number`);
      }

      // Verify balanced double-entry
      const debitTotal = round2(postings.filter((p) => p.side === PostingSide.DEBIT).reduce((sum, p) => sum + Number(p.amount), 0));
      const creditTotal = round2(postings.filter((p) => p.side === PostingSide.CREDIT).reduce((sum, p) => sum + Number(p.amount), 0));
      assert.strictEqual(debitTotal, creditTotal, "Debits and Credits must be balanced");
      assert.strictEqual(debitTotal, 17700.0, "Total debit should equal total return credit ₹17,700");

      console.log(`  PASS: Postings have sourceType CREDIT_NOTE and reference credit note numbers: ${cnNumbers.join(", ")}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Mixed-rate invoice return uses per-line tax (not effective ratio)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 8] Mixed-rate invoice return uses per-line tax (not effective ratio)...");
    {
      // Invoice with an 18% line (100kg @ 200) and a 5% line (50kg @ 400)
      // Line 1: 100 * 200 = 20,000 taxable + 3,600 tax = 23,600
      // Line 2: 50 * 400 = 20,000 taxable + 1,000 tax = 21,000
      // Invoice subtotal: 40,000, tax: 4,600, total: 44,600
      const so8 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN8-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 40000,
          taxAmount: 4600,
          totalValue: 44600,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 200, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 23600 },
              { lineNo: 2, projectId: testProject2.id, ratePerKg: 400, taxPct: 5, quantityKg: 50, dispatchedKg: 50, lineTotal: 21000 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so8.id);

      const inv8 = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN8-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so8.id,
          customerId: testCustomer.id,
          subtotal: 40000,
          taxAmount: 4600,
          totalValue: 44600,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
        },
      });
      createdIds.invoices.push(inv8.id);

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 44600 } },
      });

      // Return 20kg of the 18% line (20 * 200 = 4,000 taxable, 720 tax, 4,720 total)
      const ret8 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN8-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so8.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          reason: "Mixed-rate return test",
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so8.lines[0]!.id, quantityKg: 20 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret8.id);

      const settleRes8 = await inspectSalesReturnCore(
        adminUser.id,
        ret8.id,
        JSON.stringify([
          { lineId: ret8.lines[0]!.id, restockedKg: 20, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 8 inspection"
      );
      if (settleRes8.error) throw new Error(`Test 8 inspect failed: ${settleRes8.error}`);

      const cns8 = await prisma.creditNote.findMany({
        where: { salesReturnId: ret8.id },
        include: { lines: true },
      });
      assert.strictEqual(cns8.length, 1, "Exactly one CreditNote must be created");
      const cn8 = cns8[0]!;
      createdIds.creditNotes.push(cn8.id);
      cn8.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));

      // Expect taxable 4000.00, tax 720.00, total 4720.00
      assert.strictEqual(Number(cn8.taxableValue), 4000.0, "Credit note taxableValue must be 4000.00");
      assert.strictEqual(Number(cn8.taxAmount), 720.0, "Credit note taxAmount must be 720.00");
      assert.strictEqual(Number(cn8.totalValue), 4720.0, "Credit note totalValue must be 4720.00");

      // Header taxableValue, taxAmount and totalValue must equal the sum of the lines
      const sumLineTaxable = round2(cn8.lines.reduce((acc, l) => acc + Number(l.taxableValue), 0));
      const sumLineTax = round2(cn8.lines.reduce((acc, l) => acc + Number(l.taxAmount), 0));
      const sumLineTotal = round2(cn8.lines.reduce((acc, l) => acc + Number(l.totalValue), 0));

      assert.strictEqual(sumLineTaxable, Number(cn8.taxableValue), "Lines taxableValue must sum to header");
      assert.strictEqual(sumLineTax, Number(cn8.taxAmount), "Lines taxAmount must sum to header");
      assert.strictEqual(sumLineTotal, Number(cn8.totalValue), "Lines totalValue must sum to header");

      // Verify line details
      assert.strictEqual(cn8.lines.length, 1);
      assert.strictEqual(Number(cn8.lines[0]!.quantity), 20.0);
      assert.strictEqual(Number(cn8.lines[0]!.rate), 200.0);
      assert.strictEqual(Number(cn8.lines[0]!.taxableValue), 4000.0);
      assert.strictEqual(Number(cn8.lines[0]!.taxAmount), 720.0);
      assert.strictEqual(Number(cn8.lines[0]!.totalValue), 4720.0);

      // Header tax must equal the tax posted to account 2100 for that note
      const postings8 = await prisma.ledgerPosting.findMany({
        where: { sourceId: ret8.id },
        include: { account: true },
      });
      const p2100 = postings8.find((p) => p.account.code === "2100" && p.side === PostingSide.DEBIT);
      assert.ok(p2100, "Debit posting to Account 2100 must exist");
      assert.strictEqual(Number(cn8.taxAmount), Number(p2100.amount), "Header tax must equal the tax posted to account 2100");

      console.log(`  PASS: Mixed-rate return gave taxable ₹${cn8.taxableValue}, tax ₹${cn8.taxAmount}, total ₹${cn8.totalValue} matching account 2100.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 9: Credit spanning two invoices with mixed rates
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 9] Credit spanning two invoices with mixed-rate lines...");
    {
      // Order with 18% line (100kg @ 200) and 5% line (50kg @ 400)
      const so9 = await prisma.salesOrder.create({
        data: {
          code: `SO-CN9-${Date.now().toString().slice(-5)}`,
          status: SalesOrderStatus.INVOICED,
          customerId: testCustomer.id,
          subtotal: 40000,
          taxAmount: 4600,
          totalValue: 44600,
          raisedById: adminUser.id,
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, ratePerKg: 200, taxPct: 18, quantityKg: 100, dispatchedKg: 100, lineTotal: 23600 },
              { lineNo: 2, projectId: testProject2.id, ratePerKg: 400, taxPct: 5, quantityKg: 50, dispatchedKg: 50, lineTotal: 21000 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so9.id);

      // Invoice 9a: older invoice with balance ₹2,360
      const inv9a = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN9A-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so9.id,
          customerId: testCustomer.id,
          subtotal: 2000,
          taxAmount: 360,
          totalValue: 2360,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
          createdAt: new Date(Date.now() - 60000),
        },
      });
      createdIds.invoices.push(inv9a.id);

      // Invoice 9b: newer invoice with balance ₹42,240
      const inv9b = await prisma.salesInvoice.create({
        data: {
          code: `INV-CN9B-${Date.now().toString().slice(-5)}`,
          status: SalesInvoiceStatus.RAISED,
          salesOrderId: so9.id,
          customerId: testCustomer.id,
          subtotal: 38000,
          taxAmount: 4240,
          totalValue: 42240,
          paidAmount: 0,
          creditedAmount: 0,
          raisedById: adminUser.id,
          createdAt: new Date(),
        },
      });
      createdIds.invoices.push(inv9b.id);

      await prisma.customer.update({
        where: { id: testCustomer.id },
        data: { outstandingAmt: { increment: 44600 } },
      });

      // Return 20kg from 18% line (total credit ₹4,720 = ₹4,000 taxable + ₹720 tax)
      // Spans across inv9a (absorbs ₹2,360) and inv9b (absorbs remaining ₹2,360)
      const ret9 = await prisma.salesReturn.create({
        data: {
          code: `SRN-CN9-${Date.now().toString().slice(-5)}`,
          status: "PENDING_QC",
          salesOrderId: so9.id,
          customerId: testCustomer.id,
          receivedById: adminUser.id,
          reason: "Spanning two invoices test",
          lines: {
            create: [
              { lineNo: 1, projectId: testProject1.id, salesOrderLineId: so9.lines[0]!.id, quantityKg: 20 },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.returns.push(ret9.id);

      const settleRes9 = await inspectSalesReturnCore(
        adminUser.id,
        ret9.id,
        JSON.stringify([
          { lineId: ret9.lines[0]!.id, restockedKg: 20, scrappedKg: 0, resendKg: 0, qcResult: QcResult.PASS },
        ]),
        "Test 9 inspection"
      );
      if (settleRes9.error) throw new Error(`Test 9 inspect failed: ${settleRes9.error}`);

      const cns9 = await prisma.creditNote.findMany({
        where: { salesReturnId: ret9.id },
        include: { lines: true },
        orderBy: { createdAt: "asc" },
      });
      assert.strictEqual(cns9.length, 2, "Must create exactly two credit notes spanning two invoices");
      cns9.forEach((cn) => {
        createdIds.creditNotes.push(cn.id);
        cn.lines.forEach((l) => createdIds.creditNoteLines.push(l.id));
      });

      const [cn9a, cn9b] = cns9;
      // Note 9a against Invoice 9a (applied ₹2,360: scale = 0.5)
      assert.strictEqual(cn9a.salesInvoiceId, inv9a.id);
      assert.strictEqual(Number(cn9a.totalValue), 2360.0);
      assert.strictEqual(Number(cn9a.taxAmount), 360.0);
      assert.strictEqual(Number(cn9a.taxableValue), 2000.0);

      // Note 9b against Invoice 9b (applied ₹2,360: scale = 0.5)
      assert.strictEqual(cn9b.salesInvoiceId, inv9b.id);
      assert.strictEqual(Number(cn9b.totalValue), 2360.0);
      assert.strictEqual(Number(cn9b.taxAmount), 360.0);
      assert.strictEqual(Number(cn9b.taxableValue), 2000.0);

      // Verify lines sum to header for both notes
      for (const cn of [cn9a, cn9b]) {
        const lineTaxableSum = round2(cn.lines.reduce((acc, l) => acc + Number(l.taxableValue), 0));
        const lineTaxSum = round2(cn.lines.reduce((acc, l) => acc + Number(l.taxAmount), 0));
        const lineTotalSum = round2(cn.lines.reduce((acc, l) => acc + Number(l.totalValue), 0));
        assert.strictEqual(lineTaxableSum, Number(cn.taxableValue), "Lines taxableValue must sum to header");
        assert.strictEqual(lineTaxSum, Number(cn.taxAmount), "Lines taxAmount must sum to header");
        assert.strictEqual(lineTotalSum, Number(cn.totalValue), "Lines totalValue must sum to header");
      }

      // Verify combined tax across both notes equals account 2100 tax posting
      const postings9 = await prisma.ledgerPosting.findMany({
        where: { sourceId: ret9.id },
        include: { account: true },
      });
      const p2100_9 = postings9.find((p) => p.account.code === "2100" && p.side === PostingSide.DEBIT);
      assert.ok(p2100_9, "Debit posting to Account 2100 must exist");
      const totalCnTax = round2(Number(cn9a.taxAmount) + Number(cn9b.taxAmount));
      assert.strictEqual(totalCnTax, Number(p2100_9.amount), "Sum of note taxes must equal posting to account 2100");
      assert.strictEqual(totalCnTax, 720.0);

      console.log(`  PASS: Credit spanning two invoices created 2 notes (${cn9a.number} and ${cn9b.number}), lines sum to headers, and total tax ₹720 equals account 2100.`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Number uniqueness
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 7] Credit Note number uniqueness and formatting...");
    {
      const allCreditNotes = await prisma.creditNote.findMany({
        select: { id: true, number: true },
      });

      const numberRegex = /^CN-\d{4}-\d{4}$/;
      const seenNumbers = new Set<string>();

      for (const cn of allCreditNotes) {
        assert.ok(numberRegex.test(cn.number), `Credit note number ${cn.number} must match pattern CN-YYYY-NNNN`);
        assert.ok(!seenNumbers.has(cn.number), `Duplicate credit note number detected: ${cn.number}`);
        seenNumbers.add(cn.number);
      }

      console.log(`  PASS: All ${allCreditNotes.length} credit notes have valid CN-YYYY-NNNN format and strictly unique numbers.`);
    }

    console.log("\n=== ALL CREDIT NOTE UNIT TESTS PASSED SUCCESSFULLY ===");
  } finally {
    // ── Teardown ─────────────────────────────────────────────────────────────
    console.log("\n--- Cleaning up test records ---");
    if (createdIds.creditNoteLines.length > 0) {
      await prisma.creditNoteLine.deleteMany({ where: { id: { in: createdIds.creditNoteLines } } });
    }
    if (createdIds.creditNotes.length > 0) {
      await prisma.creditNote.deleteMany({ where: { id: { in: createdIds.creditNoteLines } } });
      await prisma.creditNote.deleteMany({ where: { id: { in: createdIds.creditNotes } } });
    }
    if (createdIds.returns.length > 0) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNote: { salesReturnId: { in: createdIds.returns } } } });
      await prisma.creditNote.deleteMany({ where: { salesReturnId: { in: createdIds.returns } } });
      await prisma.ledgerPosting.deleteMany({ where: { sourceId: { in: createdIds.returns } } });
      await prisma.salesReturnLine.deleteMany({ where: { returnId: { in: createdIds.returns } } });
      await prisma.salesReturn.deleteMany({ where: { id: { in: createdIds.returns } } });
    }
    if (createdIds.invoices.length > 0) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNote: { salesInvoiceId: { in: createdIds.invoices } } } });
      await prisma.creditNote.deleteMany({ where: { salesInvoiceId: { in: createdIds.invoices } } });
      await prisma.ledgerPosting.deleteMany({ where: { sourceId: { in: createdIds.invoices } } });
      await prisma.salesInvoice.deleteMany({ where: { id: { in: createdIds.invoices } } });
    }
    if (createdIds.orders.length > 0) {
      await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: { in: createdIds.orders } } });
      await prisma.salesOrder.deleteMany({ where: { id: { in: createdIds.orders } } });
    }
    if (createdIds.projects.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdIds.projects } } });
    }
    if (createdIds.customers.length > 0) {
      await prisma.customer.deleteMany({ where: { id: { in: createdIds.customers } } });
    }
    console.log("Cleanup complete.");
    await prisma.$disconnect();
  }
}

runCreditNoteTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
