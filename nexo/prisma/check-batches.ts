import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const batches = await prisma.inventoryBatch.findMany({
    select: { id: true, batchNo: true, status: true, receivedQtyKg: true, availableQtyKg: true },
    orderBy: { createdAt: "desc" },
  });
  console.log("Batches count:", batches.length);
  console.log("All batches:", JSON.stringify(batches, null, 2));
}

main().finally(() => prisma.$disconnect());
