import { PrismaClient, Role, WarehouseKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seeding...");

  // 1. Seed Warehouses
  console.log("Seeding warehouses...");
  const warehouses = [
    { code: "WH-STORE", name: "Main Store", kind: WarehouseKind.STORE, location: "Block A" },
    { code: "WH-SHED-B", name: "Shed B", kind: WarehouseKind.STORE, location: "Block B, bulk resin" },
    { code: "WH-YARD", name: "Solvent Yard", kind: WarehouseKind.STORE, location: "Open yard, hazardous" },
    { code: "WH-REJ", name: "Rejection Warehouse", kind: WarehouseKind.REJECTION, location: "Gate 2, segregated" },
    { code: "WH-SCRAP", name: "Scrap Warehouse", kind: WarehouseKind.SCRAP, location: "Rear yard" },
    { code: "WH-WIP", name: "Work In Progress", kind: WarehouseKind.WIP, location: "Compounding hall" },
  ];

  for (const wh of warehouses) {
    await prisma.warehouse.upsert({
      where: { code: wh.code },
      update: { name: wh.name, kind: wh.kind, location: wh.location },
      create: wh,
    });
  }

  // 2. Seed Default Staff Users
  console.log("Seeding staff accounts...");
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash("Mavens@123", salt);

  const staff = [
    { email: "admin@mavenserp.in", name: "Admin Operator", role: Role.ADMIN, jobTitle: "System Admin" },
    { email: "director@mavenserp.in", name: "MD Office", role: Role.MANAGEMENT, jobTitle: "Managing Director" },
    { email: "purchasehead@mavenserp.in", name: "Nandita Rao", role: Role.PURCHASE_HEAD, jobTitle: "Head of Purchase" },
    { email: "procurement@mavenserp.in", name: "Imran Qureshi", role: Role.PURCHASE_EXECUTIVE, jobTitle: "Purchase Executive" },
    { email: "store@mavenserp.in", name: "Ravi Prasad", role: Role.STORE, jobTitle: "Stores In-charge" },
    { email: "finance@mavenserp.in", name: "Finance Admin", role: Role.FINANCE, jobTitle: "Finance Controller" },
    { email: "pm@mavenserp.in", name: "PM Admin", role: Role.PROJECT_MANAGER, jobTitle: "Project Manager" },
    { email: "sales@mavenserp.in", name: "Sales Admin", role: Role.SALES, jobTitle: "Sales Manager" },
  ];

  for (const member of staff) {
    await prisma.user.upsert({
      where: { email: member.email },
      update: {
        name: member.name,
        role: member.role,
        jobTitle: member.jobTitle,
        isVerified: true,
      },
      create: {
        email: member.email,
        name: member.name,
        role: member.role,
        jobTitle: member.jobTitle,
        passwordHash,
        isVerified: true,
        isActive: true,
      },
    });
  }

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
