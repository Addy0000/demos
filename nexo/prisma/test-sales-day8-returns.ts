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

import { prisma } from "../src/lib/prisma";
import {
  SalesOrderStatus,
  SalesReturnStatus,
  ReturnResolution,
  QcResult,
  BatchStatus,
} from "@prisma/client";

const {
  allocateStockCore,
  dispatchOrderCore,
  raiseInvoiceCore,
  inspectSalesReturnCore,
  createSalesReturnCore,
} = require("../src/app/(app)/sales/sales-core");

async function runTests() {
  console.log("=== Module 7 Day 8: Sales Return Decision & Invoicing Guard Verification ===");

  const createdIds = {
    batches: [] as string[],
    orders: [] as string[],
    challans: [] as string[],
    invoices: [] as string[],
    returns: [] as string[],
  };

  try {
    // ── Prerequisites ──────────────────────────────────────────────────────────
    let user = await prisma.user.findFirst({ where: { role: "ADMIN" } }) || await prisma.user.findFirst();
    if (!user) throw new Error("No user found in DB");

    let customer = await prisma.customer.findFirst();
    if (!customer) throw new Error("No customer found in DB");

    let project = await prisma.project.findFirst({
      where: { formulation: { isNot: null } },
      include: { formulation: { include: { lines: { include: { material: true } } } } },
    });
    if (!project || !project.formulation) throw new Error("No project with formulation found in DB");

    let storeWh = await prisma.warehouse.findFirst({ where: { kind: "STORE", isActive: true } });
    if (!storeWh) throw new Error("No active STORE warehouse found in DB");

    const leadMaterial = project.formulation.lines[0]?.material;
    if (!leadMaterial) throw new Error("Formulation has no lines");

    async function createAvailableBatch(qtyKg: number) {
      const b = await prisma.inventoryBatch.create({
        data: {
          batchNo: `B-D8-${Math.floor(Math.random() * 89999 + 10000)}`,
          materialId: leadMaterial!.id,
          warehouseId: storeWh!.id,
          status: BatchStatus.AVAILABLE,
          receivedQtyKg: qtyKg,
          availableQtyKg: qtyKg,
          ratePerKg: 100,
          receivedOn: new Date(),
        },
      });
      createdIds.batches.push(b.id);
      return b;
    }

    async function createConfirmedSO(quantityKg: number) {
      const code = `SO-D8-${Math.floor(Math.random() * 89999 + 10000)}`;
      const subtotal = quantityKg * 200;
      const taxAmount = subtotal * 0.18;
      const totalValue = subtotal + taxAmount;
      const so = await prisma.salesOrder.create({
        data: {
          code,
          status: SalesOrderStatus.CONFIRMED,
          customerId: customer!.id,
          subtotal,
          taxAmount,
          totalValue,
          raisedById: user!.id,
          lines: {
            create: [
              {
                lineNo: 1,
                projectId: project!.id,
                quantityKg,
                ratePerKg: 200,
                taxPct: 18,
                lineTotal: subtotal,
              },
            ],
          },
        },
        include: { lines: true },
      });
      createdIds.orders.push(so.id);
      return so;
    }

    async function safeCreateSalesReturn(userId: string, form: FormData): Promise<string> {
      try {
        await createSalesReturnCore(userId, form);
      } catch (err: any) {
        if (err.digest?.startsWith("NEXT_REDIRECT")) {
          const parts = err.digest.split(";");
          const redirectUrl = parts[2];
          return redirectUrl.split("/").pop();
        }
        throw err;
      }
      throw new Error("Expected redirect when creating sales return");
    }

    console.log("Prerequisites established successfully.\n");

    // ── TEST 1: Reopen Path (REOPENED_ORDER) ──────────────────────────────────
    console.log("--- Test 1: Reopen Path (REOPENED_ORDER) ---");
    {
      const so = await createConfirmedSO(500);
      const line = so.lines[0]!;
      const batch = await createAvailableBatch(1000);

      // 1. Allocate & Dispatch 500 kg
      const allocRes = await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 500 }]));
      if (allocRes.error) throw new Error(`Test 1 Alloc failed: ${allocRes.error}`);

      const dispatchRes = await dispatchOrderCore(user.id, so.id, "MH-04-1234", "Driver A");
      if (dispatchRes.error || !dispatchRes.challanId) throw new Error(`Test 1 Dispatch failed: ${dispatchRes.error}`);
      createdIds.challans.push(dispatchRes.challanId);

      const dispatchedSo = await prisma.salesOrder.findUnique({ where: { id: so.id } });
      console.log(`Initial SO status after dispatch: ${dispatchedSo?.status} (expected DISPATCHED)`);
      if (dispatchedSo?.status !== SalesOrderStatus.DISPATCHED) throw new Error("SO status should be DISPATCHED");

      // 2. Create Sales Return for 500 kg
      const returnForm = new FormData();
      returnForm.append("salesOrderId", so.id);
      returnForm.append("reason", "Customer requested resend");
      returnForm.append(
        "lines",
        JSON.stringify([{ salesOrderLineId: line.id, projectId: project.id, quantityKg: 500 }])
      );

      const returnId = await safeCreateSalesReturn(user.id, returnForm);
      createdIds.returns.push(returnId);

      const srnLines = await prisma.salesReturnLine.findMany({ where: { returnId } });
      const srnLine = srnLines[0]!;

      // 3. Inspect return with restocked = 500 kg, resendKg = 200 kg
      const qcPayload = JSON.stringify([
        {
          lineId: srnLine.id,
          restockedKg: 500,
          scrappedKg: 0,
          resendKg: 200,
          qcResult: QcResult.PASS,
          qcRemark: "Good condition, reopening SO for 200kg resend",
        },
      ]);

      const inspectRes = await inspectSalesReturnCore(user.id, returnId, qcPayload, "Inspection note");
      if (inspectRes.error) throw new Error(`Inspect Return failed: ${inspectRes.error}`);

      // 4. Assertions
      const updatedSrn = await prisma.salesReturn.findUnique({ where: { id: returnId } });
      console.log(`Return resolution: ${updatedSrn?.resolution} (expected REOPENED_ORDER)`);
      if (updatedSrn?.resolution !== ReturnResolution.REOPENED_ORDER) throw new Error("Return resolution should be REOPENED_ORDER");

      const reopenedSo = await prisma.salesOrder.findUnique({
        where: { id: so.id },
        include: { lines: true },
      });
      console.log(`Reopened SO status: ${reopenedSo?.status} (expected PARTIALLY_DISPATCHED)`);
      console.log(`Reopened line reopenedKg: ${reopenedSo?.lines[0]?.reopenedKg} (expected 200)`);
      if (reopenedSo?.status !== SalesOrderStatus.PARTIALLY_DISPATCHED) throw new Error("SO status should be PARTIALLY_DISPATCHED");
      if (Number(reopenedSo?.lines[0]?.reopenedKg) !== 200) throw new Error("Line reopenedKg should be 200");

      // Verify open allocatable capacity: (500 + 200) - 500 = 200 kg
      const openCapacity = (Number(reopenedSo?.lines[0]?.quantityKg) + Number(reopenedSo?.lines[0]?.reopenedKg)) - Number(reopenedSo?.lines[0]?.allocatedKg);
      console.log(`Open capacity for allocation: ${openCapacity} kg (expected 200)`);
      if (openCapacity !== 200) throw new Error("Open capacity should be 200 kg");

      // Re-allocate 200 kg and dispatch
      const reallocRes = await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 200 }]));
      if (reallocRes.error) throw new Error(`Re-allocation failed: ${reallocRes.error}`);

      const redispatchRes = await dispatchOrderCore(user.id, so.id, "MH-04-5678", "Driver B");
      if (redispatchRes.error || !redispatchRes.challanId) throw new Error(`Re-dispatch failed: ${redispatchRes.error}`);
      createdIds.challans.push(redispatchRes.challanId);

      const finalSo = await prisma.salesOrder.findUnique({ where: { id: so.id } });
      console.log(`Final SO status after re-dispatch: ${finalSo?.status} (expected DISPATCHED)`);
      if (finalSo?.status !== SalesOrderStatus.DISPATCHED) throw new Error("Final SO status should be DISPATCHED");

      console.log("PASS: Test 1 Reopen Path verified.\n");
    }

    // ── TEST 2: New Order Path (NEW_ORDER) ────────────────────────────────────
    console.log("--- Test 2: New Order Path (NEW_ORDER) ---");
    {
      const so = await createConfirmedSO(500);
      const line = so.lines[0]!;
      const batch = await createAvailableBatch(1000);

      // Allocate, Dispatch & Invoice SO -> Status INVOICED
      await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 500 }]));
      const dcRes = await dispatchOrderCore(user.id, so.id, "MH-04-9999", "Driver C");
      if (dcRes.error || !dcRes.challanId) throw new Error(`Dispatch failed: ${dcRes.error}`);
      createdIds.challans.push(dcRes.challanId);

      const invRes = await raiseInvoiceCore(user.id, dcRes.challanId);
      if (invRes.error || !invRes.invoiceId) throw new Error(`Invoice failed: ${invRes.error}`);
      createdIds.invoices.push(invRes.invoiceId);

      const invoicedSo = await prisma.salesOrder.findUnique({ where: { id: so.id } });
      console.log(`Initial SO status before return: ${invoicedSo?.status} (expected INVOICED)`);
      if (invoicedSo?.status !== SalesOrderStatus.INVOICED) throw new Error("SO should be INVOICED");

      // Create return against INVOICED order
      const returnForm = new FormData();
      returnForm.append("salesOrderId", so.id);
      returnForm.append("reason", "Defective material on invoiced order");
      returnForm.append(
        "lines",
        JSON.stringify([{ salesOrderLineId: line.id, projectId: project.id, quantityKg: 500 }])
      );

      const returnId = await safeCreateSalesReturn(user.id, returnForm);
      createdIds.returns.push(returnId);

      const srnLines = await prisma.salesReturnLine.findMany({ where: { returnId } });
      const srnLine = srnLines[0]!;

      // Inspect return with resendKg = 200 kg
      const qcPayload = JSON.stringify([
        {
          lineId: srnLine.id,
          restockedKg: 300,
          scrappedKg: 200,
          resendKg: 200,
          qcResult: QcResult.FAIL,
          qcRemark: "Material damaged, issue replacement order",
        },
      ]);
      const inspectRes = await inspectSalesReturnCore(user.id, returnId, qcPayload, "Inspection complete");
      if (inspectRes.error) throw new Error(`Inspect Return failed: ${inspectRes.error}`);

      // Assertions
      const updatedSrn = await prisma.salesReturn.findUnique({ where: { id: returnId } });
      console.log(`Return resolution: ${updatedSrn?.resolution} (expected NEW_ORDER)`);
      console.log(`Return resendOrderId: ${updatedSrn?.resendOrderId}`);
      if (updatedSrn?.resolution !== ReturnResolution.NEW_ORDER) throw new Error("Return resolution should be NEW_ORDER");
      if (!updatedSrn?.resendOrderId) throw new Error("resendOrderId should be populated");

      const replacementSo = await prisma.salesOrder.findUnique({
        where: { id: updatedSrn.resendOrderId },
        include: { lines: true },
      });
      createdIds.orders.push(replacementSo!.id);

      console.log(`Replacement SO code: ${replacementSo?.code}, status: ${replacementSo?.status} (expected PENDING_APPROVAL)`);
      console.log(`Replacement SO originalOrderId: ${replacementSo?.originalOrderId} (expected ${so.id})`);
      console.log(`Replacement SO line qty: ${replacementSo?.lines[0]?.quantityKg} kg (expected 200)`);

      if (replacementSo?.status !== SalesOrderStatus.PENDING_APPROVAL) throw new Error("Replacement SO status should be PENDING_APPROVAL");
      if (replacementSo?.originalOrderId !== so.id) throw new Error("Replacement SO originalOrderId should point to original SO");
      if (Number(replacementSo?.lines[0]?.quantityKg) !== 200) throw new Error("Replacement SO line qty should be 200 kg");

      const originalSoAfter = await prisma.salesOrder.findUnique({ where: { id: so.id } });
      console.log(`Original SO status after return resolution: ${originalSoAfter?.status} (expected INVOICED)`);
      if (originalSoAfter?.status !== SalesOrderStatus.INVOICED) throw new Error("Original SO status should remain INVOICED");

      console.log("PASS: Test 2 New Order Path verified.\n");
    }

    // ── TEST 3: Invoicing Guard & Net Returned Calculations ───────────────────
    console.log("--- Test 3: Invoicing Guard & Net Quantity Invoicing ---");
    {
      const so = await createConfirmedSO(500);
      const line = so.lines[0]!;
      const batch = await createAvailableBatch(1000);

      // Dispatch 500 kg (Challan 1)
      await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 500 }]));
      const dc1Res = await dispatchOrderCore(user.id, so.id, "MH-04-1111", "Driver D1");
      if (dc1Res.error || !dc1Res.challanId) throw new Error(`Dispatch 1 failed: ${dc1Res.error}`);
      const challan1Id = dc1Res.challanId;
      createdIds.challans.push(challan1Id);

      // Create return (status PENDING_QC)
      const returnForm = new FormData();
      returnForm.append("salesOrderId", so.id);
      returnForm.append("reason", "Defect check");
      returnForm.append(
        "lines",
        JSON.stringify([{ salesOrderLineId: line.id, projectId: project.id, quantityKg: 500 }])
      );
      const returnId = await safeCreateSalesReturn(user.id, returnForm);
      createdIds.returns.push(returnId);

      // Attempt to raise invoice while return is pending -> MUST BE REFUSED
      const pendingInvAttempt = await raiseInvoiceCore(user.id, challan1Id);
      console.log(`Pending return invoice attempt result: error="${pendingInvAttempt.error}"`);
      if (!pendingInvAttempt.error || !pendingInvAttempt.error.includes("pending sales return")) {
        throw new Error("raiseInvoice should be refused when a pending sales return exists on the order");
      }
      console.log("PASS: Unsettled return invoice guard passed.");

      // Settle return with 500 kg restocked, resendKg = 200 kg
      const srnLines = await prisma.salesReturnLine.findMany({ where: { returnId } });
      const qcPayload = JSON.stringify([
        {
          lineId: srnLines[0]!.id,
          restockedKg: 500,
          scrappedKg: 0,
          resendKg: 200,
          qcResult: QcResult.PASS,
          qcRemark: "Pass, re-dispatching 200",
        },
      ]);
      await inspectSalesReturnCore(user.id, returnId, qcPayload, "Settled");

      // Order is reopened for 200 kg. Now re-allocate and re-dispatch 200 kg (Challan 2)
      await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 200 }]));
      const dc2Res = await dispatchOrderCore(user.id, so.id, "MH-04-2222", "Driver D2");
      if (dc2Res.error || !dc2Res.challanId) throw new Error(`Dispatch 2 failed: ${dc2Res.error}`);
      const challan2Id = dc2Res.challanId;
      createdIds.challans.push(challan2Id);

      // Raise invoice for Challan 1 (500 kg dispatched - 500 kg returned = 0 kg net)
      const inv1Res = await raiseInvoiceCore(user.id, challan1Id);
      if (inv1Res.error || !inv1Res.invoiceId) throw new Error(`Invoice 1 failed: ${inv1Res.error}`);
      createdIds.invoices.push(inv1Res.invoiceId);

      const inv1 = await prisma.salesInvoice.findUnique({ where: { id: inv1Res.invoiceId } });
      console.log(`Invoice 1 subtotal: ₹${inv1?.subtotal} (expected ₹0.00 for net 0 kg)`);
      if (Number(inv1?.subtotal) !== 0) throw new Error("Invoice 1 subtotal should be 0 because 500 kg was returned");

      // Raise invoice for Challan 2 (200 kg re-dispatched at ₹200/kg = ₹40,000 subtotal)
      const inv2Res = await raiseInvoiceCore(user.id, challan2Id);
      if (inv2Res.error || !inv2Res.invoiceId) throw new Error(`Invoice 2 failed: ${inv2Res.error}`);
      createdIds.invoices.push(inv2Res.invoiceId);

      const inv2 = await prisma.salesInvoice.findUnique({ where: { id: inv2Res.invoiceId } });
      console.log(`Invoice 2 subtotal: ₹${inv2?.subtotal} (expected ₹40000.00 for 200 kg)`);
      if (Number(inv2?.subtotal) !== 40000) throw new Error("Invoice 2 subtotal should be 40,000 for 200 kg re-dispatched");

      console.log("PASS: Test 3 Net quantity invoicing guard verified.\n");
    }

    // ── TEST 4: Negatives & Atomic Concurrency ────────────────────────────────
    console.log("--- Test 4: Negatives & Concurrency Guard ---");
    {
      const so = await createConfirmedSO(500);
      const line = so.lines[0]!;
      const batch = await createAvailableBatch(1000);

      await allocateStockCore(user.id, line.id, JSON.stringify([{ batchId: batch.id, quantityKg: 500 }]));
      const dcRes = await dispatchOrderCore(user.id, so.id, "MH-04-3333", "Driver E");
      if (dcRes.error || !dcRes.challanId) throw new Error(`Dispatch failed: ${dcRes.error}`);
      createdIds.challans.push(dcRes.challanId);

      const returnForm = new FormData();
      returnForm.append("salesOrderId", so.id);
      returnForm.append("lines", JSON.stringify([{ salesOrderLineId: line.id, projectId: project.id, quantityKg: 500 }]));
      const returnId = await safeCreateSalesReturn(user.id, returnForm);
      createdIds.returns.push(returnId);

      const srnLines = await prisma.salesReturnLine.findMany({ where: { returnId } });

      // 1. resendKg > returnedKg refusal
      const invalidResendPayload = JSON.stringify([
        {
          lineId: srnLines[0]!.id,
          restockedKg: 300,
          scrappedKg: 100,
          resendKg: 500, // 500 > 400 total returned
          qcResult: QcResult.PASS,
        },
      ]);
      const resendErrRes = await inspectSalesReturnCore(user.id, returnId, invalidResendPayload, "Invalid");
      console.log(`resendKg > returnedKg error: "${resendErrRes.error}"`);
      if (!resendErrRes.error || !resendErrRes.error.includes("cannot exceed total returned quantity")) {
        throw new Error("resendKg > returnedKg should be refused");
      }

      // 2. Successful inspection
      const validPayload = JSON.stringify([
        {
          lineId: srnLines[0]!.id,
          restockedKg: 500,
          scrappedKg: 0,
          resendKg: 200,
          qcResult: QcResult.PASS,
        },
      ]);
      const validRes = await inspectSalesReturnCore(user.id, returnId, validPayload, "Valid settlement");
      if (validRes.error) throw new Error(`Valid inspect failed: ${validRes.error}`);

      // 3. Double decision attempt on already settled return
      const doubleInspectRes = await inspectSalesReturnCore(user.id, returnId, validPayload, "Double decision");
      console.log(`Double inspection attempt result: error="${doubleInspectRes.error}"`);
      if (!doubleInspectRes.error || !doubleInspectRes.error.includes("already been settled")) {
        throw new Error("Double inspection on settled return should be refused");
      }

      console.log("PASS: Test 4 Negatives & concurrency guard verified.\n");
    }

    // ── Test 5: AR Reversal & Credit Note Posting ──────────────────────────────
    {
      console.log("--- Test 5: AR Reversal & Credit Note Posting ---");

      // (a) Return on an INVOICED order
      const initialCust = await prisma.customer.findUnique({ where: { id: customer.id } });
      const initialOutstanding = Number(initialCust?.outstandingAmt || 0);

      const batch5a = await createAvailableBatch(300);
      createdIds.batches.push(batch5a.id);

      const so5a = await createConfirmedSO(300); // 300 kg @ ₹200/kg = ₹60000 + 18% GST (₹10800) = ₹70800
      const line5a = so5a.lines[0]!;

      await allocateStockCore(user.id, line5a.id, JSON.stringify([{ batchId: batch5a.id, quantityKg: 300 }]));
      const dc5aRes = await dispatchOrderCore(user.id, so5a.id, "MH-04-5555", "Driver 5A");
      if (dc5aRes.error || !dc5aRes.challanId) throw new Error(`Dispatch 5a failed: ${dc5aRes.error}`);
      createdIds.challans.push(dc5aRes.challanId);

      // Raise Invoice
      const inv5aRes = await raiseInvoiceCore(user.id, dc5aRes.challanId);
      if (inv5aRes.error || !inv5aRes.invoiceId) throw new Error(`Invoice 5a failed: ${inv5aRes.error}`);
      createdIds.invoices.push(inv5aRes.invoiceId);

      const postInvoiceCust = await prisma.customer.findUnique({ where: { id: customer.id } });
      const postInvoiceOutstanding = Number(postInvoiceCust?.outstandingAmt || 0);
      console.log(`  (a) Invoiced order outstanding: ₹${postInvoiceOutstanding.toFixed(2)} (increased by ₹${(postInvoiceOutstanding - initialOutstanding).toFixed(2)})`);

      // Log Return for 100 kg (60 kg restock + 40 kg scrap)
      const ret5aForm = new FormData();
      ret5aForm.append("salesOrderId", so5a.id);
      ret5aForm.append("lines", JSON.stringify([{ salesOrderLineId: line5a.id, projectId: project.id, quantityKg: 100 }]));
      const return5aId = await safeCreateSalesReturn(user.id, ret5aForm);
      createdIds.returns.push(return5aId);

      const srn5aLines = await prisma.salesReturnLine.findMany({ where: { returnId: return5aId } });
      const settle5aPayload = JSON.stringify([
        {
          lineId: srn5aLines[0]!.id,
          restockedKg: 60,
          scrappedKg: 40,
          resendKg: 0,
          qcResult: QcResult.PASS,
        },
      ]);

      const settle5aRes = await inspectSalesReturnCore(user.id, return5aId, settle5aPayload, "100kg return credit");
      if (settle5aRes.error) throw new Error(`Settle 5a failed: ${settle5aRes.error}`);

      // Verify Ledger Postings for Return (DR 4000: ₹20000, DR 2100: ₹3600, CR 1100: ₹23600)
      const returnPostings = await prisma.ledgerPosting.findMany({
        where: { sourceId: return5aId },
        include: { account: true },
      });

      console.log(`  (a) Return Ledger Postings count: ${returnPostings.length}`);
      if (returnPostings.length !== 3) {
        throw new Error(`Expected 3 ledger postings for return, found ${returnPostings.length}`);
      }

      const debitPostings = returnPostings.filter((p) => p.side === "DEBIT");
      const creditPostings = returnPostings.filter((p) => p.side === "CREDIT");

      const totalDebits = debitPostings.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalCredits = creditPostings.reduce((sum, p) => sum + Number(p.amount), 0);

      console.log(`  (a) Total Debits: ₹${totalDebits.toFixed(2)}, Total Credits: ₹${totalCredits.toFixed(2)}`);
      if (Math.abs(totalDebits - 23600) > 0.01 || Math.abs(totalCredits - 23600) > 0.01) {
        throw new Error(`Expected ₹23600 balanced ledger entry, got Debits: ₹${totalDebits}, Credits: ₹${totalCredits}`);
      }

      // Check specific accounts
      const p4000 = returnPostings.find((p) => p.account.code === "4000" && p.side === "DEBIT");
      const p2100 = returnPostings.find((p) => p.account.code === "2100" && p.side === "DEBIT");
      const p1100 = returnPostings.find((p) => p.account.code === "1100" && p.side === "CREDIT");

      if (!p4000 || Number(p4000.amount) !== 20000) throw new Error("Missing or invalid DR 4000 posting");
      if (!p2100 || Number(p2100.amount) !== 3600) throw new Error("Missing or invalid DR 2100 posting");
      if (!p1100 || Number(p1100.amount) !== 23600) throw new Error("Missing or invalid CR 1100 posting");

      // Verify Outstanding Drop
      const postCreditCust = await prisma.customer.findUnique({ where: { id: customer.id } });
      const postCreditOutstanding = Number(postCreditCust?.outstandingAmt || 0);
      const drop = postInvoiceOutstanding - postCreditOutstanding;
      console.log(`  (a) Outstanding dropped by: ₹${drop.toFixed(2)} (expected ₹23600.00)`);
      if (Math.abs(drop - 23600) > 0.01) {
        throw new Error(`Expected customer outstanding drop of ₹23600.00, got ₹${drop.toFixed(2)}`);
      }
      console.log("  PASS: (a) Return on invoiced order created balanced ledger & accurate outstanding reduction.");

      // (b) Return BEFORE Invoice (should create NO ledger postings)
      const batch5b = await createAvailableBatch(200);
      const so5b = await createConfirmedSO(200);
      const line5b = so5b.lines[0]!;

      await allocateStockCore(user.id, line5b.id, JSON.stringify([{ batchId: batch5b.id, quantityKg: 200 }]));
      const dc5bRes = await dispatchOrderCore(user.id, so5b.id, "MH-04-5B5B", "Driver 5B");
      if (dc5bRes.error || !dc5bRes.challanId) throw new Error(`Dispatch 5b failed: ${dc5bRes.error}`);
      createdIds.challans.push(dc5bRes.challanId);

      // Return BEFORE invoice
      const ret5bForm = new FormData();
      ret5bForm.append("salesOrderId", so5b.id);
      ret5bForm.append("lines", JSON.stringify([{ salesOrderLineId: line5b.id, projectId: project.id, quantityKg: 50 }]));
      const return5bId = await safeCreateSalesReturn(user.id, ret5bForm);
      createdIds.returns.push(return5bId);

      const srn5bLines = await prisma.salesReturnLine.findMany({ where: { returnId: return5bId } });
      const settle5bPayload = JSON.stringify([
        {
          lineId: srn5bLines[0]!.id,
          restockedKg: 50,
          scrappedKg: 0,
          resendKg: 0,
          qcResult: QcResult.PASS,
        },
      ]);

      const settle5bRes = await inspectSalesReturnCore(user.id, return5bId, settle5bPayload, "Pre-invoice return");
      if (settle5bRes.error) throw new Error(`Settle 5b failed: ${settle5bRes.error}`);

      const preInvoicePostings = await prisma.ledgerPosting.findMany({ where: { sourceId: return5bId } });
      console.log(`  (b) Pre-invoice return ledger postings count: ${preInvoicePostings.length} (expected 0)`);
      if (preInvoicePostings.length !== 0) {
        throw new Error(`Expected 0 ledger postings for pre-invoice return, found ${preInvoicePostings.length}`);
      }
      console.log("  PASS: (b) Return before invoice created no credit postings.");

      // (c) Settling the same return twice credits once
      const repeatRes = await inspectSalesReturnCore(user.id, return5aId, settle5aPayload, "Duplicate settle");
      console.log(`  (c) Duplicate settle attempt result: error="${repeatRes.error}"`);
      if (!repeatRes.error || !repeatRes.error.includes("already been settled")) {
        throw new Error("Duplicate settle on return was not rejected");
      }

      const repeatPostings = await prisma.ledgerPosting.findMany({ where: { sourceId: return5aId } });
      if (repeatPostings.length !== 3) {
        throw new Error(`Expected exactly 3 postings after duplicate settle attempt, found ${repeatPostings.length}`);
      }
      console.log("  PASS: (c) Duplicate settle rejected and credited exactly once.\n");
    }

  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    console.log("--- Cleanup ---");
    let totalDeleted = 0;

    if (createdIds.returns.length > 0) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNote: { salesReturnId: { in: createdIds.returns } } } });
      await prisma.creditNote.deleteMany({ where: { salesReturnId: { in: createdIds.returns } } });
      await prisma.ledgerPosting.deleteMany({ where: { sourceId: { in: createdIds.returns } } });
    }
    if (createdIds.invoices.length > 0) {
      await prisma.creditNoteLine.deleteMany({ where: { creditNote: { salesInvoiceId: { in: createdIds.invoices } } } });
      await prisma.creditNote.deleteMany({ where: { salesInvoiceId: { in: createdIds.invoices } } });
      await prisma.ledgerPosting.deleteMany({ where: { sourceType: { in: ["SALES_INVOICE", "CREDIT_NOTE"] }, sourceId: { in: createdIds.invoices } } });
      const delInvoices = await prisma.salesInvoice.deleteMany({ where: { id: { in: createdIds.invoices } } });
      totalDeleted += delInvoices.count;
    }
    if (createdIds.challans.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { reference: { startsWith: "DC-" } } });
      await prisma.deliveryChallanLine.deleteMany({ where: { challanId: { in: createdIds.challans } } });
      const delDc = await prisma.deliveryChallan.deleteMany({ where: { id: { in: createdIds.challans } } });
      totalDeleted += delDc.count;
    }

    // Delete all returns associated with created returns or created orders
    await prisma.creditNoteLine.deleteMany({
      where: {
        OR: [
          { creditNote: { salesReturnId: { in: createdIds.returns } } },
          { creditNote: { salesReturn: { salesOrderId: { in: createdIds.orders } } } },
        ],
      },
    });
    await prisma.creditNote.deleteMany({
      where: {
        OR: [
          { salesReturnId: { in: createdIds.returns } },
          { salesReturn: { salesOrderId: { in: createdIds.orders } } },
        ],
      },
    });
    await prisma.stockMovement.deleteMany({ where: { reference: { startsWith: "SRN-" } } });
    await prisma.salesReturnLine.deleteMany({
      where: {
        OR: [
          { returnId: { in: createdIds.returns } },
          { return: { salesOrderId: { in: createdIds.orders } } },
        ],
      },
    });
    const delSrn = await prisma.salesReturn.deleteMany({
      where: {
        OR: [
          { id: { in: createdIds.returns } },
          { salesOrderId: { in: createdIds.orders } },
        ],
      },
    });
    totalDeleted += delSrn.count;

    if (createdIds.orders.length > 0) {
      await prisma.salesOrder.updateMany({
        where: { id: { in: createdIds.orders } },
        data: { originalOrderId: null },
      });
      await prisma.stockAllocation.deleteMany({ where: { salesOrderLine: { salesOrderId: { in: createdIds.orders } } } });
      await prisma.salesOrderLine.deleteMany({ where: { salesOrderId: { in: createdIds.orders } } });
      const delSo = await prisma.salesOrder.deleteMany({ where: { id: { in: createdIds.orders } } });
      totalDeleted += delSo.count;
    }
    if (createdIds.batches.length > 0) {
      await prisma.stockMovement.deleteMany({ where: { batchId: { in: createdIds.batches } } });
      const delB = await prisma.inventoryBatch.deleteMany({ where: { id: { in: createdIds.batches } } });
      totalDeleted += delB.count;
    }

    console.log(`Cleanup completed. Total records deleted: ${totalDeleted}`);
  }
}

runTests()
  .then(() => {
    console.log("\nALL DAY 8 RETURN RESOLUTION & GUARD TESTS PASSED SUCCESSFULLY.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nTEST SUITE FAILED WITH ERROR:", err);
    process.exit(1);
  });
