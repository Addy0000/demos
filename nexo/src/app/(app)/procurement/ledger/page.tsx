import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { LedgerGrid } from "./ledger-grid";

export const metadata: Metadata = { title: "Stock ledger" };
export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  await requirePermission("inventory:read");

  const [total, materials] = await Promise.all([
    prisma.stockMovement.count(),
    prisma.rawMaterial.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return <LedgerGrid total={total} materials={materials} />;
}
