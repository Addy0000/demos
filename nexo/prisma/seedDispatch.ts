import {
  PrismaClient,
  Role,
  CustomerStatus,
  Industry,
  SalesOrderStatus,
  ChallanStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding 10 Sales Orders and 10 Delivery Challans ready for invoicing...");

  // 1. Locate Admin User
  const adminUser = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
  });
  if (!adminUser) {
    throw new Error("No ADMIN user found in database. Please run the base seed first.");
  }

  // 2. Seed 4 realistic customers
  const customersData = [
    {
      code: "CUST-ACME",
      name: "Acme Plastics Ltd",
      legalName: "Acme Plastics Private Limited",
      industry: Industry.PIPES_AND_FITTINGS,
      city: "Mumbai",
      creditLimit: 1500000,
      creditDays: 30,
    },
    {
      code: "CUST-SUPREME",
      name: "Supreme Conduit & Pipes",
      legalName: "Supreme Conduit & Polymers Ltd",
      industry: Industry.PIPES_AND_FITTINGS,
      city: "Pune",
      creditLimit: 2000000,
      creditDays: 45,
    },
    {
      code: "CUST-FINOLEX",
      name: "Finolex Cable Works",
      legalName: "Finolex Cables & Polymers Pvt Ltd",
      industry: Industry.WIRE_AND_CABLE,
      city: "Ahmedabad",
      creditLimit: 2500000,
      creditDays: 30,
    },
    {
      code: "CUST-APEX",
      name: "Apex Polymers Pvt Ltd",
      legalName: "Apex Medical & Industrial Polymers Ltd",
      industry: Industry.MEDICAL,
      city: "Vadodara",
      creditLimit: 1200000,
      creditDays: 15,
    },
  ];

  const customers: Record<string, string> = {};
  for (const c of customersData) {
    const cust = await prisma.customer.upsert({
      where: { code: c.code },
      update: { city: c.city, creditLimit: c.creditLimit, creditDays: c.creditDays },
      create: {
        ...c,
        status: CustomerStatus.ACTIVE,
      },
    });
    customers[c.code] = cust.id;
  }

  // 3. Seed Projects
  const projectsData = [
    {
      code: "PRJ-CONDUIT-01",
      name: "Acme PVC Grey Conduit Compound",
      application: "Electrical conduits and casing",
      custKey: "CUST-ACME",
      rate: 185.0,
    },
    {
      code: "PRJ-SHEATH-02",
      name: "FRLS Cable Sheathing Compound",
      application: "Flame retardant wire coating sheathing",
      custKey: "CUST-FINOLEX",
      rate: 195.0,
    },
    {
      code: "PRJ-FITTING-03",
      name: "Rigid PVC Pressure Fitting Compound",
      application: "Pressure pipe fittings and elbows",
      custKey: "CUST-SUPREME",
      rate: 165.0,
    },
    {
      code: "PRJ-MEDICAL-04",
      name: "Medical Grade DEHP-Free Tubing Compound",
      application: "Medical grade DEHP-free tubing",
      custKey: "CUST-APEX",
      rate: 260.0,
    },
  ];

  const projects: Record<string, { id: string; rate: number }> = {};
  for (const p of projectsData) {
    const prj = await prisma.project.upsert({
      where: { code: p.code },
      update: { targetPricePerKg: p.rate },
      create: {
        code: p.code,
        name: p.name,
        application: p.application,
        customerId: customers[p.custKey]!,
        targetPricePerKg: p.rate,
        estimatedVolumeMt: 120.0,
      },
    });
    projects[p.code] = { id: prj.id, rate: p.rate };
  }

  // 4. Configuration for 10 distinct Orders and Challans
  const dispatchList = [
    {
      soCode: "SO-2026-0101",
      dcCode: "DC-2026-0001",
      custKey: "CUST-ACME",
      prjKey: "PRJ-CONDUIT-01",
      poNo: "PO-ACME-8842",
      qtyKg: 1000,
      rate: 185.0,
      vehicle: "MH-04-AB-1234",
      driver: "Rajesh Kumar",
      lr: "LR-88219",
      packages: 40,
      daysAgo: 8,
      remark: "40 bags of 25kg compound on wooden pallets",
    },
    {
      soCode: "SO-2026-0102",
      dcCode: "DC-2026-0002",
      custKey: "CUST-ACME",
      prjKey: "PRJ-CONDUIT-01",
      poNo: "PO-ACME-8901",
      qtyKg: 500,
      rate: 185.0,
      vehicle: "MH-04-CD-5678",
      driver: "Suresh Patil",
      lr: "LR-88240",
      packages: 20,
      daysAgo: 7,
      remark: "20 bags of 25kg compound",
    },
    {
      soCode: "SO-2026-0103",
      dcCode: "DC-2026-0003",
      custKey: "CUST-FINOLEX",
      prjKey: "PRJ-SHEATH-02",
      poNo: "PO-FIN-3321",
      qtyKg: 2000,
      rate: 195.0,
      vehicle: "GJ-01-XY-9876",
      driver: "Vikram Singh",
      lr: "LR-90112",
      packages: 80,
      daysAgo: 6,
      remark: "80 bags shrink-wrapped on 2 pallets",
    },
    {
      soCode: "SO-2026-0104",
      dcCode: "DC-2026-0004",
      custKey: "CUST-SUPREME",
      prjKey: "PRJ-FITTING-03",
      poNo: "PO-SUP-7714",
      qtyKg: 1500,
      rate: 165.0,
      vehicle: "MH-12-PQ-4521",
      driver: "Mahesh Sharma",
      lr: "LR-91402",
      packages: 60,
      daysAgo: 5,
      remark: "60 bags rigid PVC compound",
    },
    {
      soCode: "SO-2026-0105",
      dcCode: "DC-2026-0005",
      custKey: "CUST-APEX",
      prjKey: "PRJ-MEDICAL-04",
      poNo: "PO-APEX-1092",
      qtyKg: 800,
      rate: 260.0,
      vehicle: "GJ-06-KK-2211",
      driver: "Dinesh Patel",
      lr: "LR-92315",
      packages: 32,
      daysAgo: 4,
      remark: "32 cleanroom-certified bags on plastic pallets",
    },
    {
      soCode: "SO-2026-0106",
      dcCode: "DC-2026-0006",
      custKey: "CUST-ACME",
      prjKey: "PRJ-CONDUIT-01",
      poNo: "PO-ACME-9015",
      qtyKg: 2500,
      rate: 185.0,
      vehicle: "MH-04-MN-3344",
      driver: "Anil Jadhav",
      lr: "LR-93041",
      packages: 100,
      daysAgo: 3,
      remark: "100 bags conduit extrusion grade compound",
    },
    {
      soCode: "SO-2026-0107",
      dcCode: "DC-2026-0007",
      custKey: "CUST-FINOLEX",
      prjKey: "PRJ-SHEATH-02",
      poNo: "PO-FIN-3408",
      qtyKg: 3000,
      rate: 195.0,
      vehicle: "GJ-01-ZZ-5566",
      driver: "Praveen Nair",
      lr: "LR-94119",
      packages: 120,
      daysAgo: 2,
      remark: "120 bags flame retardant compound",
    },
    {
      soCode: "SO-2026-0108",
      dcCode: "DC-2026-0008",
      custKey: "CUST-SUPREME",
      prjKey: "PRJ-FITTING-03",
      poNo: "PO-SUP-7809",
      qtyKg: 1200,
      rate: 165.0,
      vehicle: "MH-12-RT-8899",
      driver: "Santosh Gokhale",
      lr: "LR-95023",
      packages: 48,
      daysAgo: 2,
      remark: "48 bags injection molding compound",
    },
    {
      soCode: "SO-2026-0109",
      dcCode: "DC-2026-0009",
      custKey: "CUST-APEX",
      prjKey: "PRJ-MEDICAL-04",
      poNo: "PO-APEX-1140",
      qtyKg: 1000,
      rate: 260.0,
      vehicle: "GJ-06-TT-7788",
      driver: "Hasmukh Joshi",
      lr: "LR-96104",
      packages: 40,
      daysAgo: 1,
      remark: "40 bags medical grade polymer compound",
    },
    {
      soCode: "SO-2026-0110",
      dcCode: "DC-2026-0010",
      custKey: "CUST-SUPREME",
      prjKey: "PRJ-FITTING-03",
      poNo: "PO-SUP-7922",
      qtyKg: 1800,
      rate: 165.0,
      vehicle: "MH-14-GH-1122",
      driver: "Ganesh Kadam",
      lr: "LR-97210",
      packages: 72,
      daysAgo: 0,
      remark: "72 bags heavy-duty conduit compound",
    },
  ];

  for (const item of dispatchList) {
    const custId = customers[item.custKey]!;
    const prj = projects[item.prjKey]!;

    const subtotal = item.qtyKg * item.rate;
    const tax = subtotal * 0.18;
    const total = subtotal + tax;

    // A. Upsert Confirmed Sales Order
    let so = await prisma.salesOrder.findUnique({
      where: { code: item.soCode },
      include: { lines: true },
    });

    if (!so) {
      so = await prisma.salesOrder.create({
        data: {
          code: item.soCode,
          status: SalesOrderStatus.CONFIRMED,
          customerId: custId,
          customerPoNo: item.poNo,
          subtotal,
          taxAmount: tax,
          totalValue: total,
          raisedById: adminUser.id,
          lines: {
            create: [
              {
                lineNo: 1,
                projectId: prj.id,
                quantityKg: item.qtyKg,
                dispatchedKg: item.qtyKg,
                ratePerKg: item.rate,
                lineTotal: subtotal,
                taxPct: 18.0,
              },
            ],
          },
        },
        include: { lines: true },
      });
      console.log(`- Created Sales Order: ${so.code}`);
    }

    // B. Upsert Delivery Challan in DISPATCHED status (ready to invoice)
    const existingDc = await prisma.deliveryChallan.findUnique({
      where: { code: item.dcCode },
      include: { invoices: true },
    });

    const dcDate = new Date(Date.now() - item.daysAgo * 86400000);

    if (!existingDc) {
      await prisma.deliveryChallan.create({
        data: {
          code: item.dcCode,
          status: ChallanStatus.DISPATCHED,
          salesOrderId: so.id,
          customerId: custId,
          packedOn: dcDate,
          dispatchedOn: dcDate,
          vehicleNo: item.vehicle,
          driverName: item.driver,
          lrNo: item.lr,
          packageCnt: item.packages,
          grossKg: item.qtyKg * 1.02, // 2% packaging tare
          raisedById: adminUser.id,
          remark: item.remark,
          lines: {
            create: [
              {
                lineNo: 1,
                salesOrderLineId: so.lines[0]!.id,
                quantityKg: item.qtyKg,
                ratePerKg: item.rate,
              },
            ],
          },
        },
      });
      console.log(`- Created Delivery Challan: ${item.dcCode} (Dispatched, ready to invoice)`);
    } else {
      console.log(`- Delivery Challan already exists: ${item.dcCode}`);
    }
  }

  console.log("\nSuccess: Seeded 10 Sales Orders and 10 ready-to-invoice Delivery Challans!");
}

main()
  .catch((e) => {
    console.error("Error seeding Despatches:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
