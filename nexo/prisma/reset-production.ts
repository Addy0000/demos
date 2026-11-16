import { PrismaClient, PlanningStatus, DirectManufacturingStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== RESETTING PRODUCTION & PLANNING DATA ===");

  // 1. Delete all QC placeholders
  const qcs = await prisma.qualityControlPlaceholder.deleteMany({});
  console.log(`Deleted ${qcs.count} QC placeholders.`);

  // 2. Delete all direct manufacturing work orders
  const dmwos = await prisma.directManufacturingWorkOrder.deleteMany({});
  console.log(`Deleted ${dmwos.count} direct manufacturing work orders.`);

  // 3. Delete finished goods compound batches (where batchNo starts with B-CP-)
  const compoundBatches = await prisma.inventoryBatch.deleteMany({
    where: {
      batchNo: { startsWith: "B-CP-" }
    }
  });
  console.log(`Deleted ${compoundBatches.count} quarantined compound yield batches.`);

  // 4. Clean up planning allocations, shortages, and placeholders
  const allocs = await prisma.planningAllocation.deleteMany({});
  console.log(`Deleted ${allocs.count} planning allocations.`);

  const shortages = await prisma.planningShortage.deleteMany({});
  console.log(`Deleted ${shortages.count} planning shortages.`);

  const prs = await prisma.purchaseRequisitionPlaceholder.deleteMany({});
  console.log(`Deleted ${prs.count} purchase requisition placeholders.`);

  const pwos = await prisma.productionWorkOrderPlaceholder.deleteMany({});
  console.log(`Deleted ${pwos.count} production work order placeholders.`);

  const sips = await prisma.storeIssueSlipPlaceholder.deleteMany({});
  console.log(`Deleted ${sips.count} store issue slip placeholders.`);

  // 5. Reset all planning work orders status back to APPROVED so allocations can be re-run
  const pwosReset = await prisma.planningWorkOrder.updateMany({
    data: {
      status: PlanningStatus.APPROVED
    }
  });
  console.log(`Reset status of ${pwosReset.count} Planning Work Orders back to APPROVED.`);

  // 6. Reset plasticizer stock (B-PLAST-001) to 1000 kg as requested
  const plasticizer = await prisma.rawMaterial.findFirst({
    where: { code: "RM-PLAST-001" }
  });

  if (plasticizer) {
    // Find or create B-PLAST-001 batch in store WH-STORE
    const storeWh = await prisma.warehouse.findFirst({
      where: { code: "WH-STORE" }
    });

    if (storeWh) {
      await prisma.inventoryBatch.deleteMany({
        where: { batchNo: "B-PLAST-001" }
      });

      await prisma.inventoryBatch.create({
        data: {
          batchNo: "B-PLAST-001",
          materialId: plasticizer.id,
          warehouseId: storeWh.id,
          availableQtyKg: 1000.00,
          receivedQtyKg: 1000.00,
          status: "AVAILABLE",
          ratePerKg: 160.00,
          receivedOn: new Date("2026-08-25")
        }
      });
      console.log("Successfully seeded batch B-PLAST-001 with 1000 kg available quantity.");
    }
  }

  // 7. Reset resin stock (B-RESIN-001) to 1500 kg so they have plenty of resin
  const resin = await prisma.rawMaterial.findFirst({
    where: { code: "RM-RESIN-001" }
  });

  if (resin) {
    const storeWh = await prisma.warehouse.findFirst({
      where: { code: "WH-STORE" }
    });

    if (storeWh) {
      await prisma.inventoryBatch.deleteMany({
        where: { batchNo: "B-RESIN-001" }
      });

      await prisma.inventoryBatch.create({
        data: {
          batchNo: "B-RESIN-001",
          materialId: resin.id,
          warehouseId: storeWh.id,
          availableQtyKg: 1500.00,
          receivedQtyKg: 1500.00,
          status: "AVAILABLE",
          ratePerKg: 100.00,
          receivedOn: new Date("2026-08-25")
        }
      });
      console.log("Successfully seeded batch B-RESIN-001 with 1500 kg available quantity.");
    }
  }

  console.log("=== RESET COMPLETED ===");
}

main()
  .catch(err => console.error(err))
  .finally(async () => await prisma.$disconnect());
