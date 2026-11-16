import { prisma } from "../src/lib/prisma";
import {
  createPackingListCore,
  savePackingPackagesCore,
  finalizePackingListCore,
} from "../src/app/(app)/sales/sales-core";
import {
  ChallanStatus,
  SalesOrderStatus,
  PackingListStatus,
} from "@prisma/client";

async function main() {
  console.log("================================================================================");
  console.log("MODULE 7 (SALES) - PACKING LIST VERIFICATION");
  console.log("================================================================================");

  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user found in DB");
  const customer = await prisma.customer.findFirst();
  if (!customer) throw new Error("No customer found in DB");
  const project = await prisma.project.findFirst();
  if (!project) throw new Error("No project found in DB");

  const testPrefix = `PKL-TST-${Date.now().toString().slice(-4)}`;
  const testSoCodes = [
    `SO-${testPrefix}-01`,
    `SO-${testPrefix}-02`,
    `SO-${testPrefix}-03`,
    `SO-${testPrefix}-04`,
    `SO-${testPrefix}-DRAFT`,
  ];
  const testDcCodes = [
    `DC-${testPrefix}-01`,
    `DC-${testPrefix}-02`,
    `DC-${testPrefix}-03`,
    `DC-${testPrefix}-04`,
    `DC-${testPrefix}-DRAFT`,
  ];

  // Helper cleanup function
  async function cleanupAll() {
    const existingSos = await prisma.salesOrder.findMany({
      where: { code: { in: testSoCodes } },
      select: { id: true },
    });
    const soIds = existingSos.map((s) => s.id);

    const existingDcs = await prisma.deliveryChallan.findMany({
      where: {
        OR: [{ code: { in: testDcCodes } }, { salesOrderId: { in: soIds } }],
      },
      select: { id: true },
    });
    const dcIds = existingDcs.map((d) => d.id);

    const existingPls = await prisma.packingList.findMany({
      where: { challanId: { in: dcIds } },
      select: { id: true },
    });
    const plIds = existingPls.map((p) => p.id);

    if (plIds.length > 0) {
      await prisma.auditEvent.deleteMany({
        where: { entityType: "PackingList", entityId: { in: plIds } },
      });
      // 1. PackingPackageLine -> 2. PackingPackage -> 3. PackingList
      await prisma.packingPackageLine.deleteMany({
        where: { package: { packingListId: { in: plIds } } },
      });
      await prisma.packingPackage.deleteMany({
        where: { packingListId: { in: plIds } },
      });
      await prisma.packingList.deleteMany({
        where: { id: { in: plIds } },
      });
    }

    if (dcIds.length > 0) {
      await prisma.deliveryChallanLine.deleteMany({
        where: { challanId: { in: dcIds } },
      });
      await prisma.deliveryChallan.deleteMany({
        where: { id: { in: dcIds } },
      });
    }

    if (soIds.length > 0) {
      await prisma.salesOrderLine.deleteMany({
        where: { salesOrderId: { in: soIds } },
      });
      await prisma.salesOrder.deleteMany({
        where: { id: { in: soIds } },
      });
    }
  }

  // Pre-cleanup
  await cleanupAll();

  try {
    // ---------------------------------------------------------------------------
    // SETUP: Dispatched Challan with 2 lines (100 kg, 50 kg)
    // ---------------------------------------------------------------------------
    const so1 = await prisma.salesOrder.create({
      data: {
        code: `SO-${testPrefix}-01`,
        customerId: customer.id,
        status: SalesOrderStatus.CONFIRMED,
        totalValue: 22500,
        raisedById: user.id,
        lines: {
          create: [
            {
              projectId: project.id,
              lineNo: 1,
              quantityKg: 100,
              ratePerKg: 150,
              lineTotal: 15000,
              dispatchedKg: 100,
            },
            {
              projectId: project.id,
              lineNo: 2,
              quantityKg: 50,
              ratePerKg: 150,
              lineTotal: 7500,
              dispatchedKg: 50,
            },
          ],
        },
      },
      include: { lines: true },
    });

    const dc1 = await prisma.deliveryChallan.create({
      data: {
        code: `DC-${testPrefix}-01`,
        status: ChallanStatus.DISPATCHED,
        salesOrderId: so1.id,
        customerId: customer.id,
        dispatchedOn: new Date(),
        raisedById: user.id,
        lines: {
          create: [
            {
              salesOrderLineId: so1.lines[0]!.id,
              lineNo: 1,
              quantityKg: 100,
              ratePerKg: 150,
            },
            {
              salesOrderLineId: so1.lines[1]!.id,
              lineNo: 2,
              quantityKg: 50,
              ratePerKg: 150,
            },
          ],
        },
      },
      include: { lines: true },
    });
    const dc1Line1 = dc1.lines.find((l) => l.lineNo === 1)!;
    const dc1Line2 = dc1.lines.find((l) => l.lineNo === 2)!;

    // ---------------------------------------------------------------------------
    // TEST (a): Create packing list on a dispatched challan
    // ---------------------------------------------------------------------------
    console.log("--- Test (a): Create packing list on a dispatched challan ---");
    const resA = await createPackingListCore(user.id, dc1.id);
    if (!resA.success || !resA.packingListId) {
      throw new Error(`Test (a) failed: createPackingListCore returned error: ${resA.error}`);
    }
    const plA = await prisma.packingList.findUniqueOrThrow({
      where: { id: resA.packingListId },
    });
    if (plA.status !== PackingListStatus.DRAFT) {
      throw new Error(`Test (a) failed: Expected status DRAFT, got ${plA.status}`);
    }
    if (!plA.code.startsWith("PKL-")) {
      throw new Error(`Test (a) failed: Expected code starting with PKL-, got ${plA.code}`);
    }
    const auditA = await prisma.auditEvent.findFirst({
      where: { entityType: "PackingList", entityId: plA.id, action: "CREATE" },
    });
    if (!auditA) {
      throw new Error("Test (a) failed: AuditEvent for CREATE not found");
    }
    console.log(`PASS (a): Created packing list ${plA.code} (id: ${plA.id}) in DRAFT status with AuditEvent.`);

    const plId = plA.id;

    // ---------------------------------------------------------------------------
    // TEST (b): Duplicate create is rejected
    // ---------------------------------------------------------------------------
    console.log("--- Test (b): Duplicate create is rejected ---");
    const resB = await createPackingListCore(user.id, dc1.id);
    if (!resB.error || !resB.error.includes("already has a packing list")) {
      throw new Error(`Test (b) failed: Expected error mentioning 'already has a packing list', got: ${JSON.stringify(resB)}`);
    }
    console.log(`PASS (b): Duplicate create rejected cleanly: "${resB.error}".`);

    // ---------------------------------------------------------------------------
    // TEST (c): Over-packing is rejected
    // ---------------------------------------------------------------------------
    console.log("--- Test (c): Over-packing is rejected ---");
    const overPackPackages = [
      {
        packageNo: 1,
        packageType: "carton",
        grossKg: 120,
        tareKg: 5,
        lines: [
          {
            challanLineId: dc1Line1.id,
            quantityKg: 105, // 105 kg on a 100 kg challan line
          },
        ],
      },
    ];
    const resC = await savePackingPackagesCore(user.id, plId, overPackPackages);
    if (!resC.error || !resC.error.includes("exceeds maximum quantity")) {
      throw new Error(`Test (c) failed: Expected error mentioning 'exceeds maximum quantity', got: ${JSON.stringify(resC)}`);
    }
    console.log(`PASS (c): Over-packing rejected cleanly: "${resC.error}".`);

    // ---------------------------------------------------------------------------
    // TEST (d): Finalize with a shortfall is rejected with kg detail
    // ---------------------------------------------------------------------------
    console.log("--- Test (d): Finalize with a shortfall is rejected with kg detail ---");
    const partialPackages = [
      {
        packageNo: 1,
        packageType: "carton",
        grossKg: 85,
        tareKg: 5,
        lines: [
          {
            challanLineId: dc1Line1.id,
            quantityKg: 80, // 80 kg out of 100 kg (shortfall 20 kg)
          },
          // Line 2 has 0 kg packed (shortfall 50 kg)
        ],
      },
    ];
    const savePartialRes = await savePackingPackagesCore(user.id, plId, partialPackages);
    if (!savePartialRes.success) {
      throw new Error(`Test (d) setup failed: ${savePartialRes.error}`);
    }

    const resD = await finalizePackingListCore(user.id, plId);
    if (!resD.error || !resD.error.includes("Shortfalls:")) {
      throw new Error(`Test (d) failed: Expected error with shortfalls details, got: ${JSON.stringify(resD)}`);
    }
    // Verify it mentions line details and shortfall in kg
    if (!resD.error.includes("20.000 kg") || !resD.error.includes("50.000 kg")) {
      throw new Error(`Test (d) failed: Expected shortfall quantities 20.000 kg and 50.000 kg in message, got: ${resD.error}`);
    }
    console.log(`PASS (d): Finalize with shortfall rejected with kg detail: "${resD.error}".`);

    // ---------------------------------------------------------------------------
    // TEST (e): A complete pack finalizes
    // ---------------------------------------------------------------------------
    console.log("--- Test (e): A complete pack finalizes ---");
    const completePackages = [
      {
        packageNo: 1,
        packageType: "pallet",
        grossKg: 62,
        tareKg: 2,
        lines: [
          {
            challanLineId: dc1Line1.id,
            quantityKg: 60, // 60 kg of line 1
          },
        ],
      },
      {
        packageNo: 2,
        packageType: "bag",
        grossKg: 93,
        tareKg: 3,
        lines: [
          {
            challanLineId: dc1Line1.id,
            quantityKg: 40, // 40 kg of line 1 (total line 1 = 100 kg)
          },
          {
            challanLineId: dc1Line2.id,
            quantityKg: 50, // 50 kg of line 2 (total line 2 = 50 kg)
          },
        ],
      },
    ];
    const saveCompleteRes = await savePackingPackagesCore(user.id, plId, completePackages);
    if (!saveCompleteRes.success) {
      throw new Error(`Test (e) save failed: ${saveCompleteRes.error}`);
    }

    const resE = await finalizePackingListCore(user.id, plId);
    if (!resE.success) {
      throw new Error(`Test (e) finalize failed: ${resE.error}`);
    }

    const finalizedPl = await prisma.packingList.findUniqueOrThrow({
      where: { id: plId },
    });
    if (finalizedPl.status !== PackingListStatus.FINAL) {
      throw new Error(`Test (e) failed: Expected status FINAL, got ${finalizedPl.status}`);
    }
    if (finalizedPl.finalizedById !== user.id || !finalizedPl.finalizedAt) {
      throw new Error("Test (e) failed: finalizedById or finalizedAt not set");
    }
    const auditE = await prisma.auditEvent.findFirst({
      where: { entityType: "PackingList", entityId: plId, action: "FINALIZE" },
    });
    if (!auditE) {
      throw new Error("Test (e) failed: AuditEvent for FINALIZE not found");
    }
    console.log(`PASS (e): Packing list ${finalizedPl.code} finalized successfully with AuditEvent.`);

    // ---------------------------------------------------------------------------
    // TEST (f): A save after FINAL is rejected
    // ---------------------------------------------------------------------------
    console.log("--- Test (f): A save after FINAL is rejected ---");
    const resF = await savePackingPackagesCore(user.id, plId, completePackages);
    if (!resF.error || !resF.error.includes("Only DRAFT packing lists can be modified")) {
      throw new Error(`Test (f) failed: Expected error mentioning only DRAFT can be modified, got: ${JSON.stringify(resF)}`);
    }
    console.log(`PASS (f): Save after FINAL rejected cleanly: "${resF.error}".`);

    // ---------------------------------------------------------------------------
    // TEST (g): Create on a non-dispatched challan is rejected
    // ---------------------------------------------------------------------------
    console.log("--- Test (g): Create on a non-dispatched challan is rejected ---");
    const soDraft = await prisma.salesOrder.create({
      data: {
        code: `SO-${testPrefix}-DRAFT`,
        customerId: customer.id,
        status: SalesOrderStatus.CONFIRMED,
        totalValue: 15000,
        raisedById: user.id,
        lines: {
          create: [
            {
              projectId: project.id,
              lineNo: 1,
              quantityKg: 100,
              ratePerKg: 150,
              lineTotal: 15000,
            },
          ],
        },
      },
      include: { lines: true },
    });
    const dcDraft = await prisma.deliveryChallan.create({
      data: {
        code: `DC-${testPrefix}-DRAFT`,
        status: ChallanStatus.DRAFT,
        salesOrderId: soDraft.id,
        customerId: customer.id,
        raisedById: user.id,
        lines: {
          create: [
            {
              salesOrderLineId: soDraft.lines[0]!.id,
              lineNo: 1,
              quantityKg: 100,
              ratePerKg: 150,
            },
          ],
        },
      },
    });

    const resG = await createPackingListCore(user.id, dcDraft.id);
    if (!resG.error || !resG.error.includes("only be created for DISPATCHED challans")) {
      throw new Error(`Test (g) failed: Expected error for non-dispatched challan, got: ${JSON.stringify(resG)}`);
    }
    console.log(`PASS (g): Create on non-dispatched challan rejected cleanly: "${resG.error}".`);

    // ---------------------------------------------------------------------------
    // TEST (h): 3 parallel creates for 3 different challans all get unique codes
    // ---------------------------------------------------------------------------
    console.log("--- Test (h): 3 parallel creates for 3 different challans all get unique codes ---");
    const [so2, so3, so4] = await Promise.all([
      prisma.salesOrder.create({
        data: {
          code: `SO-${testPrefix}-02`,
          customerId: customer.id,
          status: SalesOrderStatus.CONFIRMED,
          totalValue: 15000,
          raisedById: user.id,
          lines: {
            create: [
              { projectId: project.id, lineNo: 1, quantityKg: 100, ratePerKg: 150, lineTotal: 15000, dispatchedKg: 100 },
            ],
          },
        },
        include: { lines: true },
      }),
      prisma.salesOrder.create({
        data: {
          code: `SO-${testPrefix}-03`,
          customerId: customer.id,
          status: SalesOrderStatus.CONFIRMED,
          totalValue: 15000,
          raisedById: user.id,
          lines: {
            create: [
              { projectId: project.id, lineNo: 1, quantityKg: 100, ratePerKg: 150, lineTotal: 15000, dispatchedKg: 100 },
            ],
          },
        },
        include: { lines: true },
      }),
      prisma.salesOrder.create({
        data: {
          code: `SO-${testPrefix}-04`,
          customerId: customer.id,
          status: SalesOrderStatus.CONFIRMED,
          totalValue: 15000,
          raisedById: user.id,
          lines: {
            create: [
              { projectId: project.id, lineNo: 1, quantityKg: 100, ratePerKg: 150, lineTotal: 15000, dispatchedKg: 100 },
            ],
          },
        },
        include: { lines: true },
      }),
    ]);

    const [dc2, dc3, dc4] = await Promise.all([
      prisma.deliveryChallan.create({
        data: {
          code: `DC-${testPrefix}-02`,
          status: ChallanStatus.DISPATCHED,
          salesOrderId: so2.id,
          customerId: customer.id,
          dispatchedOn: new Date(),
          raisedById: user.id,
          lines: {
            create: [{ salesOrderLineId: so2.lines[0]!.id, lineNo: 1, quantityKg: 100, ratePerKg: 150 }],
          },
        },
      }),
      prisma.deliveryChallan.create({
        data: {
          code: `DC-${testPrefix}-03`,
          status: ChallanStatus.DISPATCHED,
          salesOrderId: so3.id,
          customerId: customer.id,
          dispatchedOn: new Date(),
          raisedById: user.id,
          lines: {
            create: [{ salesOrderLineId: so3.lines[0]!.id, lineNo: 1, quantityKg: 100, ratePerKg: 150 }],
          },
        },
      }),
      prisma.deliveryChallan.create({
        data: {
          code: `DC-${testPrefix}-04`,
          status: ChallanStatus.DISPATCHED,
          salesOrderId: so4.id,
          customerId: customer.id,
          dispatchedOn: new Date(),
          raisedById: user.id,
          lines: {
            create: [{ salesOrderLineId: so4.lines[0]!.id, lineNo: 1, quantityKg: 100, ratePerKg: 150 }],
          },
        },
      }),
    ]);

    const [parRes1, parRes2, parRes3] = await Promise.all([
      createPackingListCore(user.id, dc2.id),
      createPackingListCore(user.id, dc3.id),
      createPackingListCore(user.id, dc4.id),
    ]);

    if (!parRes1.success || !parRes2.success || !parRes3.success) {
      throw new Error(`Test (h) failed: Parallel creates returned error: ${JSON.stringify({ parRes1, parRes2, parRes3 })}`);
    }

    const [pl2, pl3, pl4] = await Promise.all([
      prisma.packingList.findUniqueOrThrow({ where: { id: parRes1.packingListId } }),
      prisma.packingList.findUniqueOrThrow({ where: { id: parRes2.packingListId } }),
      prisma.packingList.findUniqueOrThrow({ where: { id: parRes3.packingListId } }),
    ]);

    const codes = [pl2.code, pl3.code, pl4.code];
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== 3) {
      throw new Error(`Test (h) failed: Expected 3 unique codes, got: ${codes.join(", ")}`);
    }
    console.log(`PASS (h): 3 parallel creates all succeeded with unique codes: ${codes.join(", ")}.`);

  } finally {
    // Post-cleanup in strict FK order
    console.log("Cleaning up test data in strict FK order...");
    await cleanupAll();
    console.log("Cleanup complete.");
  }

  console.log("\n================================================================================");
  console.log("ALL PACKING LIST TESTS (a)-(h) PASSED CLEANLY!");
  console.log("================================================================================\n");
}

main()
  .catch((e) => {
    console.error("FATAL ERROR IN PACKING LIST TEST:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
