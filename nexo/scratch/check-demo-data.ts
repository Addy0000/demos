import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const materials = await prisma.rawMaterial.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, grade: true, currentPricePerKg: true, reorderQtyKg: true },
  });
  const vendors = await prisma.vendor.findMany({
    select: { id: true, code: true, name: true, paymentTerms: true, status: true },
  });
  const warehouses = await prisma.warehouse.findMany({
    select: { id: true, code: true, name: true, kind: true },
  });
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log("=== MATERIALS ===");
  console.log(JSON.stringify(materials, null, 2));
  console.log("=== VENDORS ===");
  console.log(JSON.stringify(vendors, null, 2));
  console.log("=== WAREHOUSES ===");
  console.log(JSON.stringify(warehouses, null, 2));
  console.log("=== USERS ===");
  console.log(JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());
