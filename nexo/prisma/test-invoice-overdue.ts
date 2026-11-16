import assert from "assert";
import { isInvoiceOverdue, getInvoiceOverdueInfo, getKolkataCalendarDays } from "../src/lib/invoice-overdue";

async function runInvoiceOverdueTests() {
  console.log("=== INVOICE OVERDUE UNIT TESTS START ===");

  // Reference timestamp: 2026-10-20 14:00:00 IST (UTC: 2026-10-20T08:30:00.000Z)
  const now = new Date("2026-10-20T08:30:00.000Z");

  // Yesterday in Asia/Kolkata: 2026-10-19
  const yesterday = new Date("2026-10-19T08:30:00.000Z");

  // Today in Asia/Kolkata: 2026-10-20
  const today = new Date("2026-10-20T05:00:00.000Z");

  // Tomorrow in Asia/Kolkata: 2026-10-21
  const tomorrow = new Date("2026-10-21T08:30:00.000Z");

  // TEST 1: Due date yesterday with a balance is overdue
  console.log("[TEST 1] Due date yesterday with a balance is overdue...");
  const overdueInv = {
    totalValue: 10000,
    paidAmount: 2000,
    creditedAmount: 0,
    dueOn: yesterday,
  };
  const isOverdue1 = isInvoiceOverdue(overdueInv, now);
  const info1 = getInvoiceOverdueInfo(overdueInv, now);
  assert.strictEqual(isOverdue1, true, "Invoice due yesterday with positive balance must be overdue");
  assert.strictEqual(info1.isOverdue, true);
  assert.strictEqual(info1.daysOverdue, 1, "Should be overdue by 1 day");
  assert.strictEqual(info1.balance, 8000, "Remaining balance should be 8000");
  console.log("  PASS: Due date yesterday with balance is overdue (1 day overdue, balance 8000).");

  // TEST 2: Paid is not overdue (due date yesterday, but balance is 0 or status is PAID)
  console.log("[TEST 2] Paid invoice is not overdue...");
  const paidInv1 = {
    totalValue: 10000,
    paidAmount: 10000,
    creditedAmount: 0,
    dueOn: yesterday,
  };
  assert.strictEqual(isInvoiceOverdue(paidInv1, now), false, "Fully paid invoice must NOT be overdue");

  const paidInv2 = {
    totalValue: 10000,
    paidAmount: 0,
    creditedAmount: 0,
    dueOn: yesterday,
    status: "PAID",
  };
  assert.strictEqual(isInvoiceOverdue(paidInv2, now), false, "Invoice with status PAID must NOT be overdue");

  const paidInv3 = {
    totalValue: 10000,
    paidAmount: 5000,
    creditedAmount: 5000,
    dueOn: yesterday,
  };
  assert.strictEqual(isInvoiceOverdue(paidInv3, now), false, "Invoice fully settled via payments and credits must NOT be overdue");

  const paidInv4 = {
    dueOn: yesterday,
    remainingAmount: 0,
  };
  assert.strictEqual(isInvoiceOverdue(paidInv4, now), false, "Invoice with remainingAmount 0 must NOT be overdue");
  console.log("  PASS: Paid invoice is not overdue across all payment and credit representations.");

  // TEST 3: dueOn null is not overdue
  console.log("[TEST 3] dueOn null is not overdue...");
  const nullDueInv1 = {
    totalValue: 10000,
    paidAmount: 0,
    creditedAmount: 0,
    dueOn: null,
  };
  assert.strictEqual(isInvoiceOverdue(nullDueInv1, now), false, "Invoice with dueOn null must NOT be overdue");

  const nullDueInv2 = {
    totalValue: 10000,
    paidAmount: 0,
    creditedAmount: 0,
    dueOn: undefined,
  };
  assert.strictEqual(isInvoiceOverdue(nullDueInv2, now), false, "Invoice with dueOn undefined must NOT be overdue");
  console.log("  PASS: Invoice with dueOn null/undefined is not overdue.");

  // TEST 4: Due date today in Asia/Kolkata is not overdue
  console.log("[TEST 4] Due date today with a balance is NOT overdue...");
  const dueTodayInv = {
    totalValue: 10000,
    paidAmount: 0,
    creditedAmount: 0,
    dueOn: today,
  };
  assert.strictEqual(isInvoiceOverdue(dueTodayInv, now), false, "Invoice due today must NOT be overdue");
  const infoToday = getInvoiceOverdueInfo(dueTodayInv, now);
  assert.strictEqual(infoToday.isOverdue, false);
  assert.strictEqual(infoToday.daysOverdue, 0);
  console.log("  PASS: Invoice due today is not overdue.");

  // TEST 5: Due date tomorrow with a balance is NOT overdue
  console.log("[TEST 5] Due date tomorrow with a balance is NOT overdue...");
  const dueTomorrowInv = {
    totalValue: 10000,
    paidAmount: 0,
    creditedAmount: 0,
    dueOn: tomorrow,
  };
  assert.strictEqual(isInvoiceOverdue(dueTomorrowInv, now), false, "Invoice due tomorrow must NOT be overdue");
  console.log("  PASS: Invoice due tomorrow is not overdue.");

  // TEST 6: Asia/Kolkata calendar day crossing
  console.log("[TEST 6] Asia/Kolkata timezone day boundary precision...");
  // 2026-10-19 23:30 UTC = 2026-10-20 05:00 IST (Today in Kolkata)
  // 2026-10-19 18:00 UTC = 2026-10-19 23:30 IST (Yesterday in Kolkata)
  const kolkataLateNightYesterday = new Date("2026-10-19T18:00:00.000Z");
  const kolkataEarlyMorningToday = new Date("2026-10-19T18:35:00.000Z"); // 00:05 IST on Oct 20

  const calDaysYesterday = getKolkataCalendarDays(kolkataLateNightYesterday);
  const calDaysToday = getKolkataCalendarDays(kolkataEarlyMorningToday);
  assert.strictEqual(calDaysToday! - calDaysYesterday!, 1, "Calendar day difference across IST midnight must be exactly 1");
  console.log("  PASS: Asia/Kolkata midnight boundary properly separated.");

  console.log("=== ALL INVOICE OVERDUE TESTS PASSED SUCCESSFULLY ===");
}

runInvoiceOverdueTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
  });
