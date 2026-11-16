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
import { POST as postJournalRoute, GET as getJournalListRoute } from "../src/app/api/finance/journal/route";
import { GET as getJournalDetailRoute } from "../src/app/api/finance/journal/[voucherNo]/route";
import { POST as reverseJournalRoute } from "../src/app/api/finance/journal/[voucherNo]/reverse/route";

async function runJournalVoucherTests() {
  console.log("=== JOURNAL VOUCHER SYSTEM TEST SUITE START ===\n");

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

  const testVendor = await prisma.vendor.findFirst({ select: { id: true, name: true } });
  if (!testVendor) throw new Error("No vendor found in database");

  const currentYear = new Date().getFullYear();
  const initialSeq = await prisma.voucherSequence.findUnique({
    where: { series_year: { series: "JV", year: currentYear } },
  });
  const initialLastNo = initialSeq ? initialSeq.lastNo : 0;
  console.log(`Initial JV sequence for year ${currentYear}: lastNo = ${initialLastNo}`);

  const createdVoucherNos: string[] = [];

  try {
    // ── TEST 1: Role without journal:write rejects (403) ──────────────────────
    console.log("[TEST 1] Role without journal:write rejects...");
    const req1 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": unauthRoleUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "[TEST] Unauthorized attempt",
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 100 },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 100 },
        ],
      }),
    });
    const res1 = await postJournalRoute(req1);
    assert.strictEqual(res1.status, 403, `Expected status 403 for role ${unauthRoleUser.role}, got ${res1.status}`);
    const data1 = await res1.json();
    assert(data1.error?.includes("Forbidden"), `Expected Forbidden error message, got ${data1.error}`);
    console.log(`  ✓ PASS: Role ${unauthRoleUser.role} without journal:write correctly rejected with 403.`);

    // ── TEST 2: No remark / remark < 5 chars rejects (400) ────────────────────
    console.log("[TEST 2] Missing / short remark rejects...");
    const req2 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "bad", // < 5 chars
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 100 },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 100 },
        ],
      }),
    });
    const res2 = await postJournalRoute(req2);
    assert.strictEqual(res2.status, 400, `Expected status 400 for short remark, got ${res2.status}`);
    const data2 = await res2.json();
    assert(data2.error?.toLowerCase().includes("remark"), `Expected remark error message, got: ${data2.error}`);
    console.log("  ✓ PASS: Remark < 5 chars rejected with 400.");

    // ── TEST 3: Future date rejects (400) ─────────────────────────────────────
    console.log("[TEST 3] Future date rejects...");
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const req3 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "[TEST] Future dated voucher",
        postedAt: futureDate.toISOString(),
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 100 },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 100 },
        ],
      }),
    });
    const res3 = await postJournalRoute(req3);
    assert.strictEqual(res3.status, 400, `Expected status 400 for future date, got ${res3.status}`);
    const data3 = await res3.json();
    assert(data3.error?.includes("future"), `Expected future date error message, got: ${data3.error}`);
    console.log("  ✓ PASS: Future postedAt rejected with 400.");

    // ── TEST 4: Unbalanced rejects (400) ──────────────────────────────────────
    console.log("[TEST 4] Unbalanced journal entry rejects...");
    const req4 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "[TEST] Unbalanced entry",
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 100 },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 95 },
        ],
      }),
    });
    const res4 = await postJournalRoute(req4);
    assert.strictEqual(res4.status, 400, `Expected status 400 for unbalanced entry, got ${res4.status}`);
    const data4 = await res4.json();
    assert(data4.error?.toLowerCase().includes("balance") || data4.error?.toLowerCase().includes("imbalance") || data4.error?.includes("equal"),
      `Expected balance error message, got: ${data4.error}`);
    console.log("  ✓ PASS: Unbalanced journal entry rejected with 400.");

    // ── TEST 5: Create 2-leg journal (201) ────────────────────────────────────
    console.log("[TEST 5] Create 2-leg journal voucher...");
    const req5 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "[TEST] 2-leg inventory adjustment",
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 150.0 },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 150.0 },
        ],
      }),
    });
    const res5 = await postJournalRoute(req5);
    assert.strictEqual(res5.status, 201, `Expected status 201, got ${res5.status}`);
    const data5 = await res5.json();
    assert(data5.voucherNo?.startsWith("JV-"), `Expected voucherNo starting with JV-, got ${data5.voucherNo}`);
    assert.strictEqual(data5.postings.length, 2, "Expected exactly 2 postings");
    createdVoucherNos.push(data5.voucherNo);
    const voucher2Leg = data5.voucherNo;
    console.log(`  ✓ PASS: 2-leg voucher ${voucher2Leg} created successfully.`);

    // ── TEST 6: Create 4-leg journal (201) ────────────────────────────────────
    console.log("[TEST 6] Create 4-leg journal voucher...");
    const req6 = new Request("http://localhost:3005/api/finance/journal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        series: "JV",
        remark: "[TEST] 4-leg compound allocation voucher",
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: 200.0, remark: "Purchases leg" },
          { accountCode: "5200", side: PostingSide.DEBIT, amount: 40.0, remark: "Service leg" },
          { accountCode: "1000", side: PostingSide.CREDIT, amount: 140.0, remark: "Inventory leg" },
          { accountCode: "2000", side: PostingSide.CREDIT, amount: 100.0, vendorId: testVendor.id, remark: "AP leg" },
        ],
      }),
    });
    const res6 = await postJournalRoute(req6);
    assert.strictEqual(res6.status, 201, `Expected status 201, got ${res6.status}`);
    const data6 = await res6.json();
    assert(data6.voucherNo?.startsWith("JV-"), `Expected voucherNo starting with JV-, got ${data6.voucherNo}`);
    assert.strictEqual(data6.postings.length, 4, "Expected exactly 4 postings");
    createdVoucherNos.push(data6.voucherNo);
    const voucher4Leg = data6.voucherNo;
    console.log(`  ✓ PASS: 4-leg voucher ${voucher4Leg} created successfully.`);

    // ── TEST 7: List vouchers returns right totals and status POSTED ───────────
    console.log("[TEST 7] List vouchers returns right totals and status POSTED...");
    const req7 = new Request(`http://localhost:3005/api/finance/journal?search=${voucher4Leg}`, {
      method: "GET",
      headers: {
        "x-test-user-id": adminUser.id,
      },
    });
    const res7 = await getJournalListRoute(req7);
    assert.strictEqual(res7.status, 200, `Expected status 200, got ${res7.status}`);
    const data7 = await res7.json();
    assert(data7.vouchers && data7.vouchers.length > 0, "Expected at least 1 voucher in search results");
    const foundVoucher = data7.vouchers.find((v: any) => v.voucherNo === voucher4Leg);
    assert(foundVoucher, `Voucher ${voucher4Leg} must be in search results`);
    assert.strictEqual(Number(foundVoucher.totalAmount), 240.0, `Expected total amount 240.0, got ${foundVoucher.totalAmount}`);
    assert.strictEqual(foundVoucher.status, "POSTED", `Expected status POSTED, got ${foundVoucher.status}`);
    assert(foundVoucher.narration?.includes("[TEST]"), `Expected narration with [TEST], got ${foundVoucher.narration}`);
    console.log(`  ✓ PASS: List returned voucher ${voucher4Leg} with total 240.0 and status POSTED.`);

    // ── TEST 8: Detail returns right totals and legs ───────────────────────────
    console.log("[TEST 8] Detail returns right totals, accounts, and party...");
    const req8 = new Request(`http://localhost:3005/api/finance/journal/${voucher4Leg}`, {
      method: "GET",
      headers: {
        "x-test-user-id": adminUser.id,
      },
    });
    const res8 = await getJournalDetailRoute(req8, { params: Promise.resolve({ voucherNo: voucher4Leg }) });
    assert.strictEqual(res8.status, 200, `Expected status 200, got ${res8.status}`);
    const data8 = await res8.json();
    assert.strictEqual(data8.voucherNo, voucher4Leg, "Voucher numbers must match");
    assert.strictEqual(Number(data8.totalAmount), 240.0, "Total amount must be 240.0");
    assert.strictEqual(data8.lines.length, 4, "Must have 4 lines");
    const apLine = data8.lines.find((l: any) => l.accountCode === "2000");
    assert(apLine, "Account 2000 line must exist");
    assert.strictEqual(apLine.partyName, testVendor.name, "Vendor name must be present on AP line");
    console.log(`  ✓ PASS: Detail for ${voucher4Leg} verified with 4 legs and correct vendor link.`);

    // ── TEST 9: Reverse works and shows REVERSED ───────────────────────────────
    console.log("[TEST 9] Reverse voucher and verify REVERSED status...");
    const req9 = new Request(`http://localhost:3005/api/finance/journal/${voucher4Leg}/reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        reason: "[TEST] Correction of 4-leg voucher allocation",
      }),
    });
    const res9 = await reverseJournalRoute(req9, { params: Promise.resolve({ voucherNo: voucher4Leg }) });
    assert.strictEqual(res9.status, 201, `Expected status 201 for reversal, got ${res9.status}`);
    const data9 = await res9.json();
    assert(data9.voucherNo?.startsWith("JV-"), `Expected reversal voucherNo starting with JV-, got ${data9.voucherNo}`);
    assert.strictEqual(data9.originalVoucherNo, voucher4Leg, "Reversal must reference original voucher");
    createdVoucherNos.push(data9.voucherNo);
    const reversalVoucherNo = data9.voucherNo;
    console.log(`  ✓ Created reversal voucher ${reversalVoucherNo} for original ${voucher4Leg}.`);

    // Check detail of original voucher now shows REVERSED
    const req9b = new Request(`http://localhost:3005/api/finance/journal/${voucher4Leg}`, {
      method: "GET",
      headers: {
        "x-test-user-id": adminUser.id,
      },
    });
    const res9b = await getJournalDetailRoute(req9b, { params: Promise.resolve({ voucherNo: voucher4Leg }) });
    const data9b = await res9b.json();
    assert.strictEqual(data9b.status, "REVERSED", `Expected status REVERSED, got ${data9b.status}`);
    assert.strictEqual(data9b.reversingVoucherNo, reversalVoucherNo, "reversingVoucherNo must match");
    console.log(`  ✓ PASS: Original voucher ${voucher4Leg} now has status REVERSED and links to ${reversalVoucherNo}.`);

    // ── TEST 10: Double reverse rejects (400) ─────────────────────────────────
    console.log("[TEST 10] Double reverse rejects...");
    const req10 = new Request(`http://localhost:3005/api/finance/journal/${voucher4Leg}/reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        reason: "[TEST] Attempt second reversal",
      }),
    });
    const res10 = await reverseJournalRoute(req10, { params: Promise.resolve({ voucherNo: voucher4Leg }) });
    assert.strictEqual(res10.status, 400, `Expected status 400 for double reversal, got ${res10.status}`);
    const data10 = await res10.json();
    assert(data10.error?.toLowerCase().includes("already reversed"), `Expected already reversed message, got: ${data10.error}`);
    console.log("  ✓ PASS: Double reversal rejected with 400.");

    // ── TEST 11: Reversing non-JV voucher rejects (400) ───────────────────────
    console.log("[TEST 11] Reversing non-JV voucher rejects...");
    const req11 = new Request("http://localhost:3005/api/finance/journal/CN-2026-0001/reverse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        reason: "[TEST] Reversing a non-JV voucher",
      }),
    });
    const res11 = await reverseJournalRoute(req11, { params: Promise.resolve({ voucherNo: "CN-2026-0001" }) });
    assert.strictEqual(res11.status, 400, `Expected status 400 for non-JV voucher, got ${res11.status}`);
    const data11 = await res11.json();
    assert(data11.error?.includes("Only vouchers in series JV"), `Expected non-JV series error, got: ${data11.error}`);
    console.log("  ✓ PASS: Reversing non-JV voucher rejected with 400.");

    // ── TEST 12: Reversing a reversal voucher rejects (400) ───────────────────
    console.log("[TEST 12] Reversing a reversal voucher rejects...");
    const req12 = new Request(`http://localhost:3005/api/finance/journal/${reversalVoucherNo}/reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": adminUser.id,
      },
      body: JSON.stringify({
        reason: "[TEST] Attempt to reverse a reversal voucher",
      }),
    });
    const res12 = await reverseJournalRoute(req12, { params: Promise.resolve({ voucherNo: reversalVoucherNo }) });
    assert.strictEqual(res12.status, 400, `Expected status 400 for reversing a reversal, got ${res12.status}`);
    const data12 = await res12.json();
    assert.strictEqual(data12.error, "A reversal cannot be reversed - post a new journal voucher instead");
    console.log("  ✓ PASS: Reversing a reversal voucher rejected with 400.");

    console.log("\n=== ALL JOURNAL VOUCHER TESTS PASSED CLEANLY! ===");
  } finally {
    // ── TEARDOWN ──────────────────────────────────────────────────────────────
    console.log("\n--- Cleaning up test records ---");
    if (createdVoucherNos.length > 0) {
      // 1. Delete audit events for created test vouchers
      await prisma.auditEvent.deleteMany({
        where: {
          entityType: "JOURNAL",
          entityId: { in: createdVoucherNos },
        },
      });

      // 2. Delete test postings
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

    // Also delete any other [TEST] audit events
    await prisma.auditEvent.deleteMany({
      where: {
        entityType: "JOURNAL",
        summary: { contains: "[TEST]" },
      },
    });

    // 3. Reset JV sequence back to initial state
    if (initialSeq) {
      await prisma.voucherSequence.update({
        where: { id: initialSeq.id },
        data: { lastNo: initialLastNo },
      });
      console.log(`Reset JV sequence to lastNo = ${initialLastNo}.`);
    } else {
      await prisma.voucherSequence.deleteMany({
        where: { series: "JV", year: currentYear },
      });
      console.log("Deleted created JV sequence row.");
    }
    console.log("Cleanup complete. No test data left behind.");
  }
}

runJournalVoucherTests()
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
