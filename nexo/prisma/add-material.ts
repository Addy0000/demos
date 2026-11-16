import { PrismaClient, MaterialCategory, Uom } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log("Usage: npx tsx prisma/add-material.ts <Name> <Code> <Category> [RatePerKg]");
    console.log("\nAvailable Categories:");
    Object.values(MaterialCategory).forEach(cat => console.log(` - ${cat}`));
    return;
  }

  const [name, code, categoryRaw, rateRaw] = args;
  const category = categoryRaw.toUpperCase() as MaterialCategory;
  const rate = rateRaw ? parseFloat(rateRaw) : undefined;

  // Validate Category
  if (!Object.values(MaterialCategory).includes(category)) {
    console.error(`Error: Invalid category '${categoryRaw}'. Must be one of:`);
    Object.values(MaterialCategory).forEach(cat => console.error(` - ${cat}`));
    process.exit(1);
  }

  console.log(`Adding raw material: ${name} (Code: ${code}, Cat: ${category}, Rate: ₹${rate ?? 0}/kg)`);

  try {
    const material = await prisma.rawMaterial.upsert({
      where: { code },
      update: {
        name,
        category,
        currentPricePerKg: rate,
      },
      create: {
        code,
        name,
        category,
        currentPricePerKg: rate,
        uom: Uom.KG
      }
    });

    console.log(`\nSuccessfully registered Raw Material in database:`);
    console.log(`- ID: ${material.id}`);
    console.log(`- Code: ${material.code}`);
    console.log(`- Name: ${material.name}`);
    console.log(`- Category: ${material.category}`);
    console.log(`- Active Price: ₹${Number(material.currentPricePerKg || 0).toFixed(2)}/kg`);

  } catch (error) {
    console.error("Failed to write to database:", error);
  }
}

main()
  .catch(err => console.error(err))
  .finally(async () => await prisma.$disconnect());
