/**
 * Seeds every demo company, each into its own Postgres schema.
 *
 *   npm run seed:demo              every company not yet seeded
 *   npm run seed:demo -- --reset   drop and rebuild every company's schema first
 *   npm run seed:demo -- raj       one company
 *
 * The schema for each company is created and brought in line with
 * prisma/schema.prisma by `prisma db push` before it is seeded. A company that
 * already has customers is left alone unless --reset is given.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { seedManufacturing } from "./demo/engine";
import { TANGENT, DUPLAST, TRIDENT } from "./demo/worlds";
import { HARVEST, MERIDIAN, LOOMCRAFT } from "./demo/worlds-industry";
import { seedServices } from "./demo/services";
import { RAJ } from "./demo/raj";
import { KESTREL } from "./demo/kestrel";

const TENANTS = ["tangent", "duplast", "trident", "raj", "harvest", "meridian", "kestrel", "loomcraft"] as const;
type Key = (typeof TENANTS)[number];

function withSchema(url: string, schema: string) {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set.");
  const args = process.argv.slice(2);
  const reset = args.includes("--reset");
  const only = args.filter((a) => !a.startsWith("--")) as Key[];
  const targets = only.length ? only : [...TENANTS];

  for (const t of targets) {
    const url = withSchema(base, t);
    console.log(`\n${t}: schema`);
    if (reset) {
      const admin = new PrismaClient({ datasourceUrl: base });
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${t}" CASCADE`);
      await admin.$disconnect();
    }
    execSync("npx prisma db push --skip-generate", { stdio: "ignore", env: { ...process.env, DATABASE_URL: url } });

    const prisma = new PrismaClient({ datasourceUrl: url });
    try {
      if ((await prisma.customer.count()) > 0) {
        console.log(`${t}: already seeded, skipped (pass --reset to rebuild)`);
        continue;
      }
      const started = Date.now();
      const manufacturing = { tangent: TANGENT, duplast: DUPLAST, trident: TRIDENT, harvest: HARVEST, meridian: MERIDIAN, loomcraft: LOOMCRAFT } as const;
      const services = { raj: RAJ, kestrel: KESTREL } as const;
      if (t in manufacturing) await seedManufacturing(prisma, manufacturing[t as keyof typeof manufacturing]);
      else await seedServices(prisma, services[t as keyof typeof services]);
      console.log(`${t}: done in ${Math.round((Date.now() - started) / 1000)} s`);
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log("\nAll requested companies seeded. Open the app, choose a company, and use its demo accounts on the login page.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
