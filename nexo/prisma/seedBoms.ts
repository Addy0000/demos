import { PrismaClient, Role, BomStatus, OrderBomSource, AmendmentStatus, MaterialCategory, Uom, ItemType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding BOM test data...");

  // 1. Fetch user to serve as requester/approver
  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN }
  });

  if (!admin) {
    console.error("Admin user not found. Please run npm run seed first.");
    return;
  }

  // 2. Ensure raw materials exist
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

  const fgCompound = await prisma.rawMaterial.upsert({
    where: { code: "FG-CP-001" },
    update: {
      itemType: ItemType.FINISHED_GOOD,
      isActive: true,
    },
    create: {
      code: "FG-CP-001",
      name: "PVC Compound Clear Grade A",
      itemType: ItemType.FINISHED_GOOD,
      category: MaterialCategory.OTHER,
      uom: Uom.KG,
      currentPricePerKg: 220.00,
      isActive: true,
    },
  });

  // 3. Clean existing BOM tables to avoid duplication crashes
  console.log("Cleaning old BOM records...");
  await prisma.bomAmendmentLine.deleteMany({});
  await prisma.bomAmendment.deleteMany({});
  await prisma.orderBomLine.deleteMany({});
  await prisma.orderBom.deleteMany({});
  await prisma.standardBomLine.deleteMany({});
  await prisma.standardBom.deleteMany({});

  // 4. Seed Standard BOMs
  console.log("Seeding Standard BOMs...");
  const stdBomApproved = await prisma.standardBom.create({
    data: {
      code: "BOM-STD-001",
      status: BomStatus.APPROVED,
      materialId: fgCompound.id,
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

  const stdBomPending = await prisma.standardBom.create({
    data: {
      code: "BOM-STD-002",
      status: BomStatus.PENDING_APPROVAL,
      materialId: fgCompound.id,
      requestedById: admin.id,
      lines: {
        create: [
          { lineNo: 1, materialId: resin.id, quantityKg: 100 },
          { lineNo: 2, materialId: plasticizer.id, quantityKg: 45 }
        ]
      }
    }
  });

  // 5. Seed Order BOMs
  console.log("Seeding Order BOMs...");
  const orderBomMts = await prisma.orderBom.create({
    data: {
      code: "BOM-ORD-001",
      status: BomStatus.APPROVED,
      source: OrderBomSource.MAKE_TO_STOCK,
      standardBomId: stdBomApproved.id,
      lines: {
        create: [
          { lineNo: 1, materialId: resin.id, quantityKg: 100 },
          { lineNo: 2, materialId: plasticizer.id, quantityKg: 50 }
        ]
      }
    }
  });

  const orderBomMto = await prisma.orderBom.create({
    data: {
      code: "BOM-ORD-002",
      status: BomStatus.APPROVED,
      source: OrderBomSource.MAKE_TO_ORDER,
      standardBomId: stdBomApproved.id,
      lines: {
        create: [
          { lineNo: 1, materialId: resin.id, quantityKg: 100 },
          { lineNo: 2, materialId: plasticizer.id, quantityKg: 50 }
        ]
      }
    }
  });

  // 6. Seed BOM Amendments
  console.log("Seeding BOM Amendment...");
  await prisma.bomAmendment.create({
    data: {
      code: "BOM-AMD-001",
      status: AmendmentStatus.PENDING_APPROVAL,
      orderBomId: orderBomMts.id,
      requestedById: admin.id,
      lines: {
        create: [
          { lineNo: 1, materialId: resin.id, quantityKg: 100 },
          { lineNo: 2, materialId: plasticizer.id, quantityKg: 40 } // Amended quantity
        ]
      }
    }
  });

  console.log("Item Management BOM seeding completed successfully!");
}

main()
  .catch(err => console.error(err))
  .finally(async () => await prisma.$disconnect());
