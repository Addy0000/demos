import "dotenv/config";
import fs from "fs";
import path from "path";
import assert from "assert";
import { Prisma, PostingSide } from "@prisma/client";

// Ensure env variables are loaded
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

import { prisma } from "../src/lib/prisma";
import { POST as postCashRoute, GET as getCashListRoute } from "../src/app/api/finance/cash/route";
import { GET as getCashDetailRoute } from "../src/app/api/finance/cash/[voucherNo]/route";
import { POST as reverseCashRoute } from "../src/app/api/finance/cash/[voucherNo]/reverse/route";
import { GET as getCashBalanceRoute } from "../src/app/api/finance/cash/balance/route";
import { POST as reverseJournalRoute } from "../src/app/api/finance/journal/[voucherNo]/reverse/route";

async function runCashVoucherTests() {
  console.log("=== CASH VOUCHER SYSTEM TEST SUITE START ===\n");

  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, name: true, role: true },
  });
  if (!adminUser) throw new Error("No ADMIN user found in database");

  const unauthRoleUser = await prisma.user.findFirst({
    where: { role: { notIn: ["ADMIN", "FINANCE"] } },
    select: { id: true, name: true, role: true },
  });
  if (!unauthRoleUser) throw new Error("No non-finance user found in database");

  const testCustomer = await prisma.customer.findFirst({ select: { id: true, name: true } });
  if (!testCustomer) throw new Error("No customer found in database");

  const testVendor = await prisma.vendor.findFirst({ select: { id: true, name: true } });
  if (!testVendor) throw new Error("No vendor found in database");

  const currentYear = new Date().getFullYear();
  const initialSeqCR = await prisma.voucherSequence.findUnique({
    where: { series_year: { series: "CR", year: currentYear } },
  });
  const initialLastNoCR = initialSeqCR ? initialSeqCR.lastNo : 0;

  const initialSeqCP = await prisma.voucherSequence.findUnique({
    where: { series_year: { series: "CP", year: currentYear } },
  });
  const initialLastNoCP = initialSeqCP ? initialSeqCP.lastNo : 0;

  console.log(`Initial sequences: CR lastNo = ${initialLastNoCR}, CP lastNo = ${initialLastNoCP}`);

  const createdVoucherNos: string[] = [];
  let tempInactiveAccount: { id: string; code: string } | null = null;

  try {
    // ── TEST 1: Role without cash:write rejects (403) ─────────────────────────
    console.log("[TEST 1] Role without cash:write rejects...");
    const req1 = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": unauthRoleUser.id,
      },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 500,
        counterAccountCode: "5000",
        narration: "[TEST] Unauthorized attempt",
      }),
    });
    const res1 = await postCashRoute(req1);
    assert.strictEqual(res1.status, 403, `Expected status 403 for role ${unauthRoleUser.role}, got ${res1.status}`);
    console.log(`  ✓ PASS: Role ${unauthRoleUser.role} correctly rejected with 403.`);

    // ── TEST 2: Short narration rejects (400) ─────────────────────────────────
    console.log("[TEST 2] Short narration rejects...");
    const req2 = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 500,
        counterAccountCode: "5000",
        narration: "abc",
      }),
    });
    const res2 = await postCashRoute(req2);
    assert.strictEqual(res2.status, 400, `Expected status 400 for short narration, got ${res2.status}`);
    const data2 = await res2.json();
    assert(data2.error?.toLowerCase().includes("character"), `Expected character length error, got: ${data2.error}`);
    console.log("  ✓ PASS: Narration < 5 chars rejected with 400.");

    // ── TEST 3: Future date rejects (400) ─────────────────────────────────────
    console.log("[TEST 3] Future date rejects...");
    const futureDate = new Date(Date.now() + 86400000 * 2);
    const req3 = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        type: "RECEIPT",
        date: futureDate.toISOString(),
        amount: 500,
        counterAccountCode: "5000",
        narration: "[TEST] Future dated cash receipt",
      }),
    });
    const res3 = await postCashRoute(req3);
    assert.strictEqual(res3.status, 400, `Expected status 400 for future date, got ${res3.status}`);
    const data3 = await res3.json();
    assert(data3.error?.toLowerCase().includes("future"), `Expected future date error, got: ${data3.error}`);
    console.log("  ✓ PASS: Future date rejected with 400.");

    // ── TEST 4: Zero and negative amount rejects (400) ────────────────────────
    console.log("[TEST 4] Zero and negative amount rejects...");
    const req4a = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 0,
        counterAccountCode: "5000",
        narration: "[TEST] Zero amount",
      }),
    });
    const res4a = await postCashRoute(req4a);
    assert.strictEqual(res4a.status, 400, `Expected status 400 for 0 amount, got ${res4a.status}`);

    const req4b = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        type: "PAYMENT",
        date: new Date().toISOString(),
        amount: -50,
        counterAccountCode: "5000",
        narration: "[TEST] Negative amount",
      }),
    });
    const res4b = await postCashRoute(req4b);
    assert.strictEqual(res4b.status, 400, `Expected status 400 for negative amount, got ${res4b.status}`);
    console.log("  ✓ PASS: Zero and negative amounts rejected with 400.");

    // ── TEST 5: 1100 / 2000 / 1000 counter account rejects (400) ──────────────
    console.log("[TEST 5] 1100/2000/1000 counter rejects...");
    // 1000 counter
    const req5a = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 100,
        counterAccountCode: "1000",
        narration: "[TEST] Account 1000 counter",
      }),
    });
    const res5a = await postCashRoute(req5a);
    assert.strictEqual(res5a.status, 400, `Expected status 400 for 1000 counter, got ${res5a.status}`);

    // 1100 counter
    const req5b = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 100,
        counterAccountCode: "1100",
        narration: "[TEST] Account 1100 counter",
      }),
    });
    const res5b = await postCashRoute(req5b);
    assert.strictEqual(res5b.status, 400, `Expected status 400 for 1100 counter, got ${res5b.status}`);
    const data5b = await res5b.json();
    assert(data5b.error?.includes("payable/receivable"), `Expected payable/receivable message, got: ${data5b.error}`);

    // 2000 counter
    const req5c = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "PAYMENT",
        date: new Date().toISOString(),
        amount: 100,
        counterAccountCode: "2000",
        narration: "[TEST] Account 2000 counter",
      }),
    });
    const res5c = await postCashRoute(req5c);
    assert.strictEqual(res5c.status, 400, `Expected status 400 for 2000 counter, got ${res5c.status}`);
    const data5c = await res5c.json();
    assert(data5c.error?.includes("payable/receivable"), `Expected payable/receivable message, got: ${data5c.error}`);
    console.log("  ✓ PASS: 1000, 1100, and 2000 counter accounts rejected with 400.");

    // ── TEST 6: Inactive account rejects (400) ─────────────────────────────────
    console.log("[TEST 6] Inactive account rejects...");
    tempInactiveAccount = await prisma.chartOfAccount.create({
      data: {
        code: "9998-TEST",
        name: "Temporary Inactive Test Account",
        type: "EXPENSE",
        isActive: false,
      },
    });

    const req6 = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "PAYMENT",
        date: new Date().toISOString(),
        amount: 100,
        counterAccountCode: tempInactiveAccount.code,
        narration: "[TEST] Inactive account payment",
      }),
    });
    const res6 = await postCashRoute(req6);
    assert.strictEqual(res6.status, 400, `Expected status 400 for inactive account, got ${res6.status}`);
    const data6 = await res6.json();
    assert(data6.error?.toLowerCase().includes("inactive"), `Expected inactive account message, got: ${data6.error}`);
    console.log("  ✓ PASS: Inactive account rejected with 400.");

    // ── TEST 7: Receipt and Payment post with correct legs ─────────────────────
    console.log("[TEST 7] Receipt and payment post with correct legs...");
    // 7A: Receipt with customer party
    const req7a = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "RECEIPT",
        date: new Date().toISOString(),
        amount: 2500.0,
        counterAccountCode: "5000",
        partyId: testCustomer.id,
        narration: "[TEST] Valid cash receipt from customer",
      }),
    });
    const res7a = await postCashRoute(req7a);
    assert.strictEqual(res7a.status, 201, `Expected status 201 for receipt, got ${res7a.status}`);
    const data7a = await res7a.json();
    assert(data7a.voucherNo?.startsWith("CR-"), `Expected voucherNo starting with CR-, got ${data7a.voucherNo}`);
    createdVoucherNos.push(data7a.voucherNo);
    const receiptVoucherNo = data7a.voucherNo;

    // Verify legs of receipt
    assert.strictEqual(data7a.postings.length, 2, "Expected 2 postings");
    const drLeg7a = data7a.postings.find((p: any) => p.side === PostingSide.DEBIT);
    const crLeg7a = data7a.postings.find((p: any) => p.side === PostingSide.CREDIT);
    assert(drLeg7a, "Debit leg must exist");
    assert(crLeg7a, "Credit leg must exist");
    assert.strictEqual(Number(drLeg7a.amount), 2500.0);
    assert.strictEqual(Number(crLeg7a.amount), 2500.0);
    assert.strictEqual(crLeg7a.customerId, testCustomer.id, "Customer must be attached to counter leg");
    console.log(`  ✓ PASS: Receipt voucher ${receiptVoucherNo} posted with DR 1000 / CR 5000.`);

    // 7B: Payment with vendor party
    const req7b = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "PAYMENT",
        date: new Date().toISOString(),
        amount: 1200.0,
        counterAccountCode: "5200",
        partyId: testVendor.id,
        narration: "[TEST] Valid cash payment to vendor",
      }),
    });
    const res7b = await postCashRoute(req7b);
    assert.strictEqual(res7b.status, 201, `Expected status 201 for payment, got ${res7b.status}`);
    const data7b = await res7b.json();
    assert(data7b.voucherNo?.startsWith("CP-"), `Expected voucherNo starting with CP-, got ${data7b.voucherNo}`);
    createdVoucherNos.push(data7b.voucherNo);
    const paymentVoucherNo = data7b.voucherNo;

    // Verify legs of payment
    assert.strictEqual(data7b.postings.length, 2, "Expected 2 postings");
    const drLeg7b = data7b.postings.find((p: any) => p.side === PostingSide.DEBIT);
    const crLeg7b = data7b.postings.find((p: any) => p.side === PostingSide.CREDIT);
    assert(drLeg7b, "Debit leg must exist");
    assert(crLeg7b, "Credit leg must exist");
    assert.strictEqual(Number(drLeg7b.amount), 1200.0);
    assert.strictEqual(Number(crLeg7b.amount), 1200.0);
    assert.strictEqual(drLeg7b.vendorId, testVendor.id, "Vendor must be attached to counter leg");
    console.log(`  ✓ PASS: Payment voucher ${paymentVoucherNo} posted with DR 5200 / CR 1000.`);

    // ── TEST 8: Payment driving balance negative posts with warning flag ──────
    console.log("[TEST 8] Payment that drives balance negative posts with warning flag...");
    // Fetch current balance first
    const balReq = new Request("http://localhost:3005/api/finance/cash/balance", {
      method: "GET",
      headers: { "x-test-user-id": adminUser.id },
    });
    const balRes = await getCashBalanceRoute(balReq);
    assert.strictEqual(balRes.status, 200, "Balance endpoint must succeed");
    const balData = await balRes.json();
    const currentBal = Number(balData.balance);

    const overdraftAmount = Math.max(1000, currentBal + 50000);
    const req8 = new Request("http://localhost:3005/api/finance/cash", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        type: "PAYMENT",
        date: new Date().toISOString(),
        amount: overdraftAmount,
        counterAccountCode: "5000",
        narration: "[TEST] Overdraft cash payment",
      }),
    });
    const res8 = await postCashRoute(req8);
    assert.strictEqual(res8.status, 201, `Expected status 201 for overdraft payment, got ${res8.status}`);
    const data8 = await res8.json();
    createdVoucherNos.push(data8.voucherNo);
    assert.strictEqual(data8.cashBalanceNegative, true, "cashBalanceNegative flag must be true");
    assert(Number(data8.resultingBalance) < 0, `Resulting balance must be negative, got ${data8.resultingBalance}`);
    console.log(`  ✓ PASS: Overdraft payment ${data8.voucherNo} posted with cashBalanceNegative = true (balance: ${data8.resultingBalance}).`);

    // ── TEST 9: List filters by type ──────────────────────────────────────────
    console.log("[TEST 9] List filters by type...");
    const req9Receipts = new Request("http://localhost:3005/api/finance/cash?type=RECEIPT", {
      method: "GET",
      headers: { "x-test-user-id": adminUser.id },
    });
    const res9Receipts = await getCashListRoute(req9Receipts);
    assert.strictEqual(res9Receipts.status, 200);
    const data9Receipts = await res9Receipts.json();
    assert(data9Receipts.vouchers.length > 0, "Expected at least 1 receipt voucher");
    assert(data9Receipts.vouchers.every((v: any) => v.voucherNo.startsWith("CR-") && v.type === "RECEIPT"));

    const req9Payments = new Request("http://localhost:3005/api/finance/cash?type=PAYMENT", {
      method: "GET",
      headers: { "x-test-user-id": adminUser.id },
    });
    const res9Payments = await getCashListRoute(req9Payments);
    assert.strictEqual(res9Payments.status, 200);
    const data9Payments = await res9Payments.json();
    assert(data9Payments.vouchers.length > 0, "Expected at least 1 payment voucher");
    assert(data9Payments.vouchers.every((v: any) => v.voucherNo.startsWith("CP-") && v.type === "PAYMENT"));
    console.log("  ✓ PASS: List filters by type correctly (RECEIPT returns CR-, PAYMENT returns CP-).");

    // ── TEST 10: Detail and Reverse works then shows REVERSED ─────────────────
    console.log("[TEST 10] Detail and Reverse works then shows REVERSED...");
    const req10Detail = new Request(`http://localhost:3005/api/finance/cash/${receiptVoucherNo}`, {
      method: "GET",
      headers: { "x-test-user-id": adminUser.id },
    });
    const res10Detail = await getCashDetailRoute(req10Detail, { params: Promise.resolve({ voucherNo: receiptVoucherNo }) });
    assert.strictEqual(res10Detail.status, 200);
    const data10Detail = await res10Detail.json();
    assert.strictEqual(data10Detail.voucherNo, receiptVoucherNo);
    assert.strictEqual(data10Detail.status, "POSTED");
    assert.strictEqual(data10Detail.party?.name, testCustomer.name);

    // Reverse the voucher
    const req10Rev = new Request(`http://localhost:3005/api/finance/cash/${receiptVoucherNo}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({
        reason: "[TEST] Customer cash receipt cancelled",
      }),
    });
    const res10Rev = await reverseCashRoute(req10Rev, { params: Promise.resolve({ voucherNo: receiptVoucherNo }) });
    assert.strictEqual(res10Rev.status, 201, `Expected status 201 for reversal, got ${res10Rev.status}`);
    const data10Rev = await res10Rev.json();
    assert(data10Rev.voucherNo?.startsWith("CR-"), `Expected reversal voucher to start with CR-, got ${data10Rev.voucherNo}`);
    createdVoucherNos.push(data10Rev.voucherNo);
    const reversalVoucherNo = data10Rev.voucherNo;

    // Verify detail now shows REVERSED
    const res10DetailAfter = await getCashDetailRoute(req10Detail, { params: Promise.resolve({ voucherNo: receiptVoucherNo }) });
    const data10DetailAfter = await res10DetailAfter.json();
    assert.strictEqual(data10DetailAfter.status, "REVERSED");
    assert.strictEqual(data10DetailAfter.reversingVoucherNo, reversalVoucherNo);
    console.log(`  ✓ PASS: Voucher ${receiptVoucherNo} reversed with ${reversalVoucherNo} and status is REVERSED.`);

    // ── TEST 11: Double reverse and reverse-of-reversal reject (400) ──────────
    console.log("[TEST 11] Double reverse and reverse-of-reversal reject...");
    // 11A: Double reverse
    const req11a = new Request(`http://localhost:3005/api/finance/cash/${receiptVoucherNo}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({ reason: "[TEST] Second reversal attempt" }),
    });
    const res11a = await reverseCashRoute(req11a, { params: Promise.resolve({ voucherNo: receiptVoucherNo }) });
    assert.strictEqual(res11a.status, 400, `Expected status 400 for double reversal, got ${res11a.status}`);

    // 11B: Reverse of reversal
    const req11b = new Request(`http://localhost:3005/api/finance/cash/${reversalVoucherNo}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({ reason: "[TEST] Attempt to reverse a reversal" }),
    });
    const res11b = await reverseCashRoute(req11b, { params: Promise.resolve({ voucherNo: reversalVoucherNo }) });
    assert.strictEqual(res11b.status, 400, `Expected status 400 for reverse-of-reversal, got ${res11b.status}`);
    const data11b = await res11b.json();
    assert.strictEqual(data11b.error, "A reversal cannot be reversed - post a new journal voucher instead");
    console.log("  ✓ PASS: Double reverse and reverse-of-reversal both rejected with 400.");

    // ── TEST 12: Cross-route reversal isolation (400) ─────────────────────────
    console.log("[TEST 12] Cross-route reversal isolation...");
    // 12A: JV voucher cannot be reversed through cash route
    const req12a = new Request("http://localhost:3005/api/finance/cash/JV-2026-0001/reverse", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({ reason: "[TEST] Attempt to reverse JV in cash route" }),
    });
    const res12a = await reverseCashRoute(req12a, { params: Promise.resolve({ voucherNo: "JV-2026-0001" }) });
    assert.strictEqual(res12a.status, 400, `Expected status 400 for JV in cash route, got ${res12a.status}`);
    const data12a = await res12a.json();
    assert(data12a.error?.includes("series CR or CP"), `Expected CR or CP series error, got: ${data12a.error}`);

    // 12B: CR/CP voucher cannot be reversed through journal route
    const req12b = new Request(`http://localhost:3005/api/finance/journal/${paymentVoucherNo}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": adminUser.id },
      body: JSON.stringify({ reason: "[TEST] Attempt to reverse CP in journal route" }),
    });
    const res12b = await reverseJournalRoute(req12b, { params: Promise.resolve({ voucherNo: paymentVoucherNo }) });
    assert.strictEqual(res12b.status, 400, `Expected status 400 for CP in journal route, got ${res12b.status}`);
    const data12b = await res12b.json();
    assert(data12b.error?.includes("series JV"), `Expected JV series error, got: ${data12b.error}`);
    console.log("  ✓ PASS: Cross-route reversals correctly rejected.");

    console.log("\n=== ALL CASH VOUCHER TESTS PASSED CLEANLY! ===");
  } finally {
    // ── TEARDOWN ──────────────────────────────────────────────────────────────
    console.log("\n--- Cleaning up test records ---");
    if (tempInactiveAccount) {
      await prisma.chartOfAccount.delete({ where: { id: tempInactiveAccount.id } }).catch(() => {});
    }

    if (createdVoucherNos.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: {
          entityType: "CASH",
          entityId: { in: createdVoucherNos },
        },
      });

      const deletedPostings = await prisma.ledgerPosting.deleteMany({
        where: {
          OR: [
            { voucherNo: { in: createdVoucherNos } },
            { remark: { contains: "[TEST]" } },
          ],
        },
      });
      console.log(`Deleted ${deletedPostings.count} test postings.`);
    }

    await prisma.auditEvent.deleteMany({
      where: {
        entityType: "CASH",
        summary: { contains: "[TEST]" },
      },
    });

    // Reset sequences
    if (initialSeqCR) {
      await prisma.voucherSequence.update({
        where: { id: initialSeqCR.id },
        data: { lastNo: initialLastNoCR },
      });
      console.log(`Reset CR sequence to lastNo = ${initialLastNoCR}.`);
    } else {
      await prisma.voucherSequence.deleteMany({
        where: { series: "CR", year: currentYear },
      });
      console.log("Deleted created CR sequence row.");
    }

    if (initialSeqCP) {
      await prisma.voucherSequence.update({
        where: { id: initialSeqCP.id },
        data: { lastNo: initialLastNoCP },
      });
      console.log(`Reset CP sequence to lastNo = ${initialLastNoCP}.`);
    } else {
      await prisma.voucherSequence.deleteMany({
        where: { series: "CP", year: currentYear },
      });
      console.log("Deleted created CP sequence row.");
    }

    console.log("Cleanup complete. No test data left behind.");
  }
}

runCashVoucherTests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

