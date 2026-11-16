import { PrismaClient, Role, BomStatus, WarehouseKind, MaterialCategory, Uom } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Planning verification test data...");

  // 1. Fetch user to serve as requester/approver
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN }
  });

  if (!admin) {
    console.error("Admin user not found. Please run npm run seed first.");
    return;
  }

  // 2. Ensure test warehouse exists
  const storeWh = await prisma.warehouse.upsert({
    where: { code: "WH-STORE" },
    update: { kind: WarehouseKind.STORE },
    create: { code: "WH-STORE", name: "Main Store", kind: WarehouseKind.STORE }
  });

  // 3. Ensure materials exist
  const resin = await prisma.rawMaterial.upsert({
    where: { code: "RM-RESIN-001" },
    update: {},
    create: {
      code: "RM-RESIN-001",
      name: "PVC Resin K-67",
      category: MaterialCategory.PVC_RESIN,
      uom: Uom.KG,
      currentPricePerKg: 100.00
    }
  });

  const plasticizer = await prisma.rawMaterial.upsert({
    where: { code: "RM-PLAST-001" },
    update: {},
    create: {
      code: "RM-PLAST-001",
      name: "DOP Plasticiser",
      category: MaterialCategory.PLASTICISER,
      uom: Uom.KG,
      currentPricePerKg: 160.00
    }
  });

  // 4. Ensure approved Standard BOM exists
  const stdBom = await prisma.standardBom.upsert({
    where: { code: "BOM-STD-001" },
    update: { status: BomStatus.APPROVED },
    create: {
      code: "BOM-STD-001",
      status: BomStatus.APPROVED,
      materialId: resin.id,
      requestedById: admin.id,
      approvedById: admin.id,
      approvedAt: new Date(),
      lines: {
        create: [
          { lineNo: 1, materialId: resin.id, quantityKg: 100 },
          { lineNo: 2, materialId: plasticizer.id, quantityKg: 50 }
        ]
      }
    }
  });

  // 5. Clean up old planning data to prevent unique constraints/stale runs
  console.log("Cleaning old Planning records...");
  await prisma.planningMilestone.deleteMany({});
  await prisma.planningAllocation.deleteMany({});
  await prisma.planningShortage.deleteMany({});
  await prisma.purchaseRequisitionPlaceholder.deleteMany({});
  await prisma.productionWorkOrderPlaceholder.deleteMany({});
  await prisma.storeIssueSlipPlaceholder.deleteMany({});
  await prisma.planningWorkOrder.deleteMany({});
  await prisma.inventoryBatch.deleteMany({ where: { batchNo: { in: ["B-RESIN-001", "B-PLAST-001"] } } });

  // 6. Seed stock batches in the main store WH-STORE
  console.log("Seeding stock batches...");
  // PVC Resin: 1500 kg available (covers required 800 kg easily)
  await prisma.inventoryBatch.create({
    data: {
      batchNo: "B-RESIN-001",
      materialId: resin.id,
      warehouseId: storeWh.id,
      availableQtyKg: 1500.00,
      receivedQtyKg: 1500.00,
      ratePerKg: 100.00,
      status: "AVAILABLE",
    }
  });

  // DOP Plasticiser: 300 kg available (causes 100 kg shortage for 1200 kg production run)
  await prisma.inventoryBatch.create({
    data: {
      batchNo: "B-PLAST-001",
      materialId: plasticizer.id,
      warehouseId: storeWh.id,
      availableQtyKg: 300.00,
      receivedQtyKg: 300.00,
      ratePerKg: 160.00,
      status: "AVAILABLE",
    }
  });

  // 7. Seed Planning Work Order (Draft)
  console.log("Creating Draft Planning Work Order...");
  await prisma.planningWorkOrder.create({
    data: {
      code: "PWO-2026-0001",
      status: "DRAFT" as any,
      source: "MAKE_TO_STOCK" as any,
      referenceNo: "MTS-RUN-01",
      materialId: resin.id,
      quantityKg: 1200.00, // Demands Resin: 800 kg, Plast: 400 kg
      requestedById: admin.id,
    }
  });

  console.log("Planning verification test data seeded successfully!");
}

main()
  .catch(err => console.error(err))
  .finally(async () => await prisma.$disconnect());
