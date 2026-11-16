import { PrismaClient, AccountType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting Chart of Accounts seeding...");

  const accounts = [
    { code: "1000", name: "Inventory", type: AccountType.ASSET, description: "Inventory asset account" },
    { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET, description: "Accounts receivable asset account" },
    { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY, description: "Accounts payable liability account" },
    { code: "2100", name: "Output GST Payable", type: AccountType.LIABILITY, description: "Output GST / Tax liability on sales invoices" },
    { code: "4000", name: "Sales Revenue", type: AccountType.REVENUE, description: "Revenue from PVC compound and goods sales" },
    { code: "5000", name: "Purchases", type: AccountType.EXPENSE, description: "Raw material purchases" },
    { code: "5100", name: "Jobwork Expense", type: AccountType.EXPENSE, description: "Processing / jobwork expenses" },
    { code: "5200", name: "Service Expense", type: AccountType.EXPENSE, description: "Services expenses" },
    { code: "9000", name: "General", type: AccountType.EXPENSE, description: "General expenses" },
  ];

  for (const acc of accounts) {
    await prisma.chartOfAccount.upsert({
      where: { code: acc.code },
      update: { name: acc.name, type: acc.type, description: acc.description },
      create: acc,
    });
  }

  console.log("Chart of Accounts seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding Chart of Accounts:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
