import fs from "fs";
import path from "path";
import assert from "assert";
import { Prisma, PostingSide, PostingSourceType } from "@prisma/client";

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

import { prisma } from "../src/lib/prisma";
import {
  postJournal,
  reverseVoucher,
  FewerThanTwoLinesError,
  InvalidAmountError,
  ImbalancedJournalError,
  AccountInactiveError,
  CustomerMissingError,
  VendorMissingError,
  AmbiguousPartyError,
  VoucherAlreadyReversedError,
} from "../src/lib/finance/postJournal";

async function runPostJournalTests() {
  console.log("=== POST JOURNAL & REVERSAL TEST SUITE START ===\n");

  const testCustomer = await prisma.customer.findFirst({ select: { id: true, name: true } });
  const testVendor = await prisma.vendor.findFirst({ select: { id: true, name: true } });

  if (!testCustomer || !testVendor) {
    throw new Error("Missing prerequisite seed data: at least one customer and vendor required.");
  }

  try {
    // ── Test 1: Balanced multi-leg posts ──────────────────────────────────────
    console.log("Test 1: Balanced multi-leg posts...");
    const res1 = await prisma.$transaction(async (tx) => {
      return postJournal(tx, {
        series: "TST",
        sourceType: PostingSourceType.JOURNAL_ENTRY,
        remark: "Test 1 multi-leg entry",
        lines: [
          { accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("100.50"), remark: "Purchases leg" },
          { accountCode: "2100", side: PostingSide.DEBIT, amount: new Prisma.Decimal("18.09"), remark: "Tax leg" },
          { accountCode: "2000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("118.59"), vendorId: testVendor.id, remark: "AP leg" },
        ],
      });
    });

    assert(res1.voucherNo.startsWith("TST-"), `Voucher number must start with TST-, got ${res1.voucherNo}`);
    assert.strictEqual(res1.postings.length, 3, "Must create exactly 3 postings");
    assert(res1.postings.every((p) => p.voucherNo === res1.voucherNo), "All postings must share voucherNo");
    assert(res1.postings.every((p) => p.sourceId === res1.voucherNo), "sourceId must default to voucherNo");
    console.log(`  ✓ Passed: ${res1.voucherNo} created with 3 balanced postings.`);

    // ── Test 2: Unbalanced rejects ───────────────────────────────────────────
    console.log("Test 2: Unbalanced rejects...");
    let err2: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            { accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("100.00") },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("90.00") },
          ],
        });
      });
    } catch (e) {
      err2 = e;
    }
    assert(err2 instanceof ImbalancedJournalError, `Expected ImbalancedJournalError, got ${err2}`);
    console.log(`  ✓ Passed: Unbalanced entry rejected with ${err2.name}`);

    // ── Test 3: Single line & amount <= 0 rejects ────────────────────────────
    console.log("Test 3: Single line and non-positive amount rejects...");
    let err3a: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [{ accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("100.00") }],
        });
      });
    } catch (e) {
      err3a = e;
    }
    assert(err3a instanceof FewerThanTwoLinesError, `Expected FewerThanTwoLinesError, got ${err3a}`);

    let err3b: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            { accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("0.00") },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("0.00") },
          ],
        });
      });
    } catch (e) {
      err3b = e;
    }
    assert(err3b instanceof InvalidAmountError, `Expected InvalidAmountError, got ${err3b}`);
    console.log("  ✓ Passed: Fewer than 2 lines and zero amounts rejected.");

    // ── Test 4: Inactive account rejects ─────────────────────────────────────
    console.log("Test 4: Inactive account rejects...");
    const throwawayCoa = await prisma.chartOfAccount.create({
      data: {
        code: "TST-INACTIVE-9999",
        name: "Temporary Inactive Test Account",
        type: "EXPENSE",
        isActive: false,
      },
    });

    let err4: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            { accountCode: "TST-INACTIVE-9999", side: PostingSide.DEBIT, amount: new Prisma.Decimal("50.00") },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("50.00") },
          ],
        });
      });
    } catch (e) {
      err4 = e;
    } finally {
      await prisma.chartOfAccount.delete({ where: { id: throwawayCoa.id } });
    }
    assert(err4 instanceof AccountInactiveError, `Expected AccountInactiveError, got ${err4}`);
    console.log(`  ✓ Passed: Inactive account rejected with ${err4.name}`);

    // ── Test 5: Control account party validations (1100, 2000, both) ────────
    console.log("Test 5: Control account party validations (1100, 2000)...");
    let err5a: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            { accountCode: "1100", side: PostingSide.DEBIT, amount: new Prisma.Decimal("50.00") },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("50.00") },
          ],
        });
      });
    } catch (e) {
      err5a = e;
    }
    assert(err5a instanceof CustomerMissingError, `Expected CustomerMissingError, got ${err5a}`);

    let err5b: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            { accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("50.00") },
            { accountCode: "2000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("50.00") },
          ],
        });
      });
    } catch (e) {
      err5b = e;
    }
    assert(err5b instanceof VendorMissingError, `Expected VendorMissingError, got ${err5b}`);

    let err5c: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          lines: [
            {
              accountCode: "1100",
              side: PostingSide.DEBIT,
              amount: new Prisma.Decimal("50.00"),
              customerId: testCustomer.id,
              vendorId: testVendor.id,
            },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("50.00") },
          ],
        });
      });
    } catch (e) {
      err5c = e;
    }
    assert(err5c instanceof AmbiguousPartyError, `Expected AmbiguousPartyError, got ${err5c}`);
    console.log("  ✓ Passed: Missing/ambiguous party validation rejected correctly.");

    // ── Test 6: 20 parallel numbers unique and gapless ───────────────────────
    console.log("Test 6: 20 parallel numbers unique and gapless...");
    await prisma.ledgerPosting.deleteMany({ where: { voucherNo: { startsWith: "TST-" } } });
    await prisma.voucherSequence.deleteMany({ where: { series: "TST" } });

    const tasks = Array.from({ length: 20 }, (_, i) =>
      prisma.$transaction(async (tx) => {
        return postJournal(tx, {
          series: "TST",
          sourceType: PostingSourceType.JOURNAL_ENTRY,
          remark: `Parallel test entry ${i + 1}`,
          lines: [
            { accountCode: "5000", side: PostingSide.DEBIT, amount: new Prisma.Decimal("10.00") },
            { accountCode: "1000", side: PostingSide.CREDIT, amount: new Prisma.Decimal("10.00") },
          ],
        });
      })
    );

    const parallelResults = await Promise.all(tasks);
    const voucherNos = parallelResults.map((r) => r.voucherNo);
    const uniqueSet = new Set(voucherNos);
    assert.strictEqual(uniqueSet.size, 20, "All 20 voucher numbers must be distinct");

    const currentYear = new Date().getFullYear();
    const numbers = voucherNos.map((v) => {
      const parts = v.split("-");
      assert.strictEqual(parts[0], "TST", "Series must be TST");
      assert.strictEqual(parts[1], String(currentYear), "Year must match current year");
      return parseInt(parts[2], 10);
    });
    numbers.sort((a, b) => a - b);
    for (let i = 0; i < 20; i++) {
      assert.strictEqual(numbers[i], i + 1, `Expected sequence ${i + 1}, got ${numbers[i]}`);
    }
    console.log(`  ✓ Passed: 20 parallel vouchers created unique gapless sequence: ${numbers[0]}..${numbers[19]}`);

    // ── Test 7: Reversal mirrors exactly ─────────────────────────────────────
    console.log("Test 7: Reversal mirrors exactly...");
    const targetVoucherNo = parallelResults[0].voucherNo;
    const originalPostings = await prisma.ledgerPosting.findMany({
      where: { voucherNo: targetVoucherNo },
      orderBy: { id: "asc" },
    });

    const revResult = await prisma.$transaction(async (tx) => {
      return reverseVoucher(tx, targetVoucherNo, "Audited cancellation");
    });

    assert(revResult.voucherNo.startsWith("TST-"), "Reversal voucher number must start with TST-");
    assert.notStrictEqual(revResult.voucherNo, targetVoucherNo, "Reversal must have a new voucher number");
    assert.strictEqual(revResult.postings.length, originalPostings.length, "Reversal must match leg count");
    assert(
      revResult.postings.every((p) => p.reversalOfVoucherNo === targetVoucherNo),
      "All reversal postings must link to original voucherNo"
    );

    for (let i = 0; i < originalPostings.length; i++) {
      const orig = originalPostings[i];
      const rev = revResult.postings[i];
      assert.strictEqual(rev.accountId, orig.accountId, "Account must match");
      assert(rev.amount.equals(orig.amount), "Amount must match");
      const expectedSide = orig.side === PostingSide.DEBIT ? PostingSide.CREDIT : PostingSide.DEBIT;
      assert.strictEqual(rev.side, expectedSide, "Side must be mirrored");
    }
    console.log(`  ✓ Passed: ${revResult.voucherNo} exactly mirrored ${targetVoucherNo}.`);

    // ── Test 8: Double reversal rejects ──────────────────────────────────────
    console.log("Test 8: Double reversal rejects...");
    let err8: any = null;
    try {
      await prisma.$transaction(async (tx) => {
        return reverseVoucher(tx, targetVoucherNo, "Second reversal attempt");
      });
    } catch (e) {
      err8 = e;
    }
    assert(err8 instanceof VoucherAlreadyReversedError, `Expected VoucherAlreadyReversedError, got ${err8}`);
    console.log(`  ✓ Passed: Duplicate reversal rejected with ${err8.name}`);

    console.log("\n=== ALL POST JOURNAL TESTS PASSED SUCCESSFULLY ===");
  } finally {
    // ── Teardown ─────────────────────────────────────────────────────────────
    console.log("\n--- Cleaning up test records ---");
    await prisma.ledgerPosting.deleteMany({ where: { voucherNo: { startsWith: "TST-" } } });
    await prisma.voucherSequence.deleteMany({ where: { series: "TST" } });
    console.log("Cleanup complete. No test data left behind.");
    await prisma.$disconnect();
  }
}

runPostJournalTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

