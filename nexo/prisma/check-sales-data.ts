import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany({
    select: { id: true, code: true, name: true, creditLimit: true, outstandingAmt: true },
    take: 10,
  });
  console.log("=== CUSTOMERS ===");
  console.log(JSON.stringify(customers, null, 2));

  const projects = await prisma.project.findMany({
    select: {
      id: true, code: true, name: true, application: true,
      formulation: {
        select: {
          id: true, version: true,
          lines: {
            orderBy: { phr: "desc" },
            take: 2,
            select: { materialId: true, material: { select: { code: true, name: true } } },
          },
        },
      },
    },
    take: 10,
  });
  console.log("=== PROJECTS ===");
  console.log(JSON.stringify(projects, null, 2));

  const batches = await prisma.inventoryBatch.findMany({
    where: { status: "AVAILABLE", availableQtyKg: { gt: 0 } },
    select: {
      id: true, batchNo: true, materialId: true,
      material: { select: { code: true, name: true } },
      availableQtyKg: true, ratePerKg: true, warehouse: { select: { name: true } }
    },
    take: 10,
  });
  console.log("=== AVAILABLE BATCHES ===");
  console.log(JSON.stringify(batches, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
