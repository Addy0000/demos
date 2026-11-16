import { PrismaClient, Role, VendorStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding vendor accounts...");

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("Mavens@123", salt);

  // 1. Create/Ensure Vendors exist
  const meridian = await prisma.vendor.upsert({
    where: { code: "VEN-0001" },
    update: { name: "Meridian Polychem", status: VendorStatus.ACTIVE },
    create: { code: "VEN-0001", name: "Meridian Polychem", status: VendorStatus.ACTIVE },
  });

  const kaveri = await prisma.vendor.upsert({
    where: { code: "VEN-0002" },
    update: { name: "Kaveri Plasticisers", status: VendorStatus.ACTIVE },
    create: { code: "VEN-0002", name: "Kaveri Plasticisers", status: VendorStatus.ACTIVE },
  });

  // 2. Create/Ensure Vendor Users exist
  await prisma.user.upsert({
    where: { email: "vendor1@mavenserp.in" },
    update: {
      name: "Meridian Sales",
      role: Role.VENDOR,
      vendorId: meridian.id,
      isVerified: true,
      isActive: true,
    },
    create: {
      email: "vendor1@mavenserp.in",
      name: "Meridian Sales",
      role: Role.VENDOR,
      vendorId: meridian.id,
      passwordHash,
      isVerified: true,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "vendor2@mavenserp.in" },
    update: {
      name: "Kaveri Sales",
      role: Role.VENDOR,
      vendorId: kaveri.id,
      isVerified: true,
      isActive: true,
    },
    create: {
      email: "vendor2@mavenserp.in",
      name: "Kaveri Sales",
      role: Role.VENDOR,
      vendorId: kaveri.id,
      passwordHash,
      isVerified: true,
      isActive: true,
    },
  });

  // 3. Link Vendors to raw materials (so they can submit price revisions)
  const resin = await prisma.rawMaterial.findFirst({
    where: { code: "RM-RESIN-001" },
  });
  const plast = await prisma.rawMaterial.findFirst({
    where: { code: "RM-PLAST-001" },
  });

  if (resin) {
    await prisma.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId: meridian.id, materialId: resin.id } },
      update: {},
      create: { vendorId: meridian.id, materialId: resin.id, isPreferred: true },
    });
    await prisma.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId: kaveri.id, materialId: resin.id } },
      update: {},
      create: { vendorId: kaveri.id, materialId: resin.id },
    });
  }

  if (plast) {
    await prisma.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId: meridian.id, materialId: plast.id } },
      update: {},
      create: { vendorId: meridian.id, materialId: plast.id },
    });
    await prisma.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId: kaveri.id, materialId: plast.id } },
      update: {},
      create: { vendorId: kaveri.id, materialId: plast.id, isPreferred: true },
    });
  }

  console.log("Vendor accounts seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding vendor accounts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
