import fs from "fs";
import path from "path";

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
import { POST } from "../src/app/api/finance/vendor-bills/route";
import { PostingSide } from "@prisma/client";

async function runTests() {
  console.log("=== AP SYSTEM VERIFICATION START ===");

  // 1. Count ChartOfAccount rows, expect at least 8 (6 original + 1100 AR + 4000 Sales Revenue)
  const coaCount = await prisma.chartOfAccount.count();
  console.log(`\n[STEP 1] ChartOfAccount Count: ${coaCount}`);
  if (coaCount < 8) {
    console.error(`ERROR: Expected at least 8 COA rows, but found ${coaCount}. Please ensure seed:fin has run.`);
    process.exit(1);
  } else {
    console.log(`SUCCESS: Found ${coaCount} Chart of Accounts rows.`);
  }

  // 2. Query one existing Vendor ID
  let vendor = await prisma.vendor.findFirst({
    where: { status: "ACTIVE" },
  });
  if (!vendor) {
    // If no vendor exists, create a temporary active one
    vendor = await prisma.vendor.create({
      data: {
        code: "VEN-TEST-AUTO",
        name: "Automated Verification Vendor",
        status: "ACTIVE",
      },
    });
    console.log(`\n[STEP 2] Created temporary Vendor: ${vendor.name} (${vendor.id})`);
  } else {
    console.log(`\n[STEP 2] Found existing Vendor: ${vendor.name} (${vendor.id})`);
  }

  // Find a user to act as creator
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });
  if (!adminUser) {
    console.error("ERROR: No ADMIN user found in database to simulate request auth. Run seed first!");
    process.exit(1);
  }

  // 3. Simulate a POST to /api/finance/vendor-bills with that vendor ID
  console.log("\n[STEP 3] Simulating POST to /api/finance/vendor-bills...");
  const mockPayload = {
    vendorId: vendor.id,
    basis: "GRN",
    purchaseAccountCode: "5000",
    amount: 125000.50,
    taxAmount: 22500.09,
    referenceNo: "TEST-INV-9999",
  };

  const req = new Request("http://localhost/api/finance/vendor-bills", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-user-id": adminUser.id,
    },
    body: JSON.stringify(mockPayload),
  });

  const response = await POST(req);
  const responseBody = await response.json();
  console.log(`Response Status: ${response.status}`);
  console.log("Response Body:", JSON.stringify(responseBody, null, 2));

  if (response.status !== 201) {
    console.error("ERROR: Simulated POST failed!");
    process.exit(1);
  }
  
  const billId = responseBody.id;
  const billCode = responseBody.code;

  // 4. Query LedgerPosting where sourceId = the returned bill id
  console.log(`\n[STEP 4] Querying LedgerPostings for Bill ID: ${billId} (${billCode})...`);
  const postings = await prisma.ledgerPosting.findMany({
    where: { vendorBillId: billId },
    include: { account: true },
  });

  console.log("Postings found in database:");
  postings.forEach((p) => {
    console.log(`- Account: ${p.account.code} (${p.account.name}), Side: ${p.side}, Amount: ₹${Number(p.amount).toFixed(2)}, Type: ${p.sourceType}, SourceID: ${p.sourceId}`);
  });

  // Verify exactly 2 rows
  if (postings.length !== 2) {
    console.error(`ERROR: Expected exactly 2 ledger postings, but found ${postings.length}`);
    process.exit(1);
  }
  
  const debitPosting = postings.find((p) => p.side === PostingSide.DEBIT);
  const creditPosting = postings.find((p) => p.side === PostingSide.CREDIT);

  if (!debitPosting || !creditPosting) {
    console.error("ERROR: Must have one DEBIT and one CREDIT posting.");
    process.exit(1);
  }

  const debitAmt = Number(debitPosting.amount);
  const creditAmt = Number(creditPosting.amount);
  const sum = debitAmt - creditAmt;

  console.log(`\nValidation:`);
  console.log(`  Debit Amount:  ₹${debitAmt.toFixed(2)}`);
  console.log(`  Credit Amount: ₹${creditAmt.toFixed(2)}`);
  console.log(`  Equal Amounts Check: ${debitAmt === creditAmt ? "PASS" : "FAIL"}`);
  console.log(`  Sum (Debit - Credit) = ₹${sum.toFixed(2)}`);
  console.log(`  Sum Equals Zero Check: ${sum === 0 ? "PASS" : "FAIL"}`);

  if (debitAmt !== creditAmt || sum !== 0) {
    console.error("ERROR: Ledger postings validation failed!");
    process.exit(1);
  }

  // 5. Attempt the same POST without a valid session/auth header
  console.log("\n[STEP 5] Attempting unauthenticated POST...");
  const unauthReq = new Request("http://localhost/api/finance/vendor-bills", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mockPayload),
  });

  const unauthResponse = await POST(unauthReq);
  const unauthResponseBody = await unauthResponse.json();
  console.log(`Unauth Response Status: ${unauthResponse.status} (Expected: 401)`);
  console.log("Unauth Response Body:", JSON.stringify(unauthResponseBody, null, 2));

  if (unauthResponse.status === 401) {
    console.log("SUCCESS: Unauthenticated request was correctly rejected with 401.");
  } else {
    console.error(`ERROR: Expected status 401, but got ${unauthResponse.status}`);
    process.exit(1);
  }

  console.log("\n=== AP SYSTEM VERIFICATION COMPLETED SUCCESSFULLY ===");
}

runTests()
  .catch((err) => {
    console.error("Fatal Test Run Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
