import { PrismaClient, Role, CustomerStatus, Industry, ProjectStage, ProjectPriority, MaterialCategory, Uom } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding formulation and project data for Compound Costing...");

  // 1. Ensure test materials exist (from Planning/BOM seeds)
  const resin = await prisma.rawMaterial.upsert({
    where: { code: "RM-RESIN-001" },
    update: { currentPricePerKg: 100.00 },
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
    update: { currentPricePerKg: 160.00 },
    create: {
      code: "RM-PLAST-001",
      name: "DOP Plasticiser",
      category: MaterialCategory.PLASTICISER,
      uom: Uom.KG,
      currentPricePerKg: 160.00
    }
  });

  const stabilizer = await prisma.rawMaterial.upsert({
    where: { code: "RM-STAB-001" },
    update: { currentPricePerKg: 250.00 },
    create: {
      code: "RM-STAB-001",
      name: "One-Pack Stabiliser",
      category: MaterialCategory.STABILISER,
      uom: Uom.KG,
      currentPricePerKg: 250.00
    }
  });

  // 2. Ensure customer exists
  const customer = await prisma.customer.upsert({
    where: { code: "CUST-ACME" },
    update: {},
    create: {
      code: "CUST-ACME",
      name: "Acme Plastics Ltd",
      legalName: "Acme Plastics Private Limited",
      industry: Industry.PIPES_AND_FITTINGS,
      status: CustomerStatus.ACTIVE,
    }
  });

  // 3. Ensure staff users (manager) exist
  const pmUser = await prisma.user.findFirst({
    where: { role: Role.PROJECT_MANAGER }
  });
  const pmId = pmUser?.id;

  // 4. Create/Ensure projects exist
  // Project A: Normal project with healthy margin
  const projectA = await prisma.project.upsert({
    where: { code: "PRJ-CONDUIT-01" },
    update: {
      targetPricePerKg: 180.00,
      estimatedVolumeMt: 120.00,
      stage: ProjectStage.FORMULATION,
    },
    create: {
      code: "PRJ-CONDUIT-01",
      name: "Acme PVC Grey Conduit Compound",
      application: "Grey electrical conduits conduit run",
      stage: ProjectStage.FORMULATION,
      priority: ProjectPriority.HIGH,
      customerId: customer.id,
      managerId: pmId,
      targetPricePerKg: 180.00,
      estimatedVolumeMt: 120.00,
    }
  });

  // Project B: At-risk project (low margin, e.g., < 10% margin)
  const projectB = await prisma.project.upsert({
    where: { code: "PRJ-SHEATH-02" },
    update: {
      targetPricePerKg: 125.00, // Cost will be around ₹122, so margin is < 5%
      estimatedVolumeMt: 80.00,
      stage: ProjectStage.FORMULATION,
    },
    create: {
      code: "PRJ-SHEATH-02",
      name: "FRLS Cable Sheathing Compound",
      application: "Flame retardant wire coating sheathing",
      stage: ProjectStage.FORMULATION,
      priority: ProjectPriority.CRITICAL,
      customerId: customer.id,
      managerId: pmId,
      targetPricePerKg: 125.00,
      estimatedVolumeMt: 80.00,
    }
  });

  // 5. Create Formulations and Formulation Lines
  // Clear old formulation lines first to refresh safely
  await prisma.formulationLine.deleteMany({
    where: {
      formulation: {
        projectId: { in: [projectA.id, projectB.id] }
      }
    }
  });

  // Formulation for Project A
  const formulationA = await prisma.formulation.upsert({
    where: { projectId: projectA.id },
    update: {},
    create: {
      projectId: projectA.id,
      version: 1,
      basis: 100,
    }
  });

  await prisma.formulationLine.createMany({
    data: [
      { formulationId: formulationA.id, materialId: resin.id, phr: 100.000, sequence: 1, remark: "Suspension PVC K-67" },
      { formulationId: formulationA.id, materialId: plasticizer.id, phr: 45.000, sequence: 2, remark: "Primary plasticiser" },
      { formulationId: formulationA.id, materialId: stabilizer.id, phr: 5.000, sequence: 3, remark: "Lead stabilizer replacement" },
    ]
  });

  // Formulation for Project B
  const formulationB = await prisma.formulation.upsert({
    where: { projectId: projectB.id },
    update: {},
    create: {
      projectId: projectB.id,
      version: 1,
      basis: 100,
    }
  });

  await prisma.formulationLine.createMany({
    data: [
      { formulationId: formulationB.id, materialId: resin.id, phr: 100.000, sequence: 1 },
      { formulationId: formulationB.id, materialId: plasticizer.id, phr: 50.000, sequence: 2 },
      { formulationId: formulationB.id, materialId: stabilizer.id, phr: 8.000, sequence: 3 },
    ]
  });

  console.log("Compound costing formulation data seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding costing data:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
