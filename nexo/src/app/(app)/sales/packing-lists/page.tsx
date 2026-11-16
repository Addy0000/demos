import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PackingListsGrid } from "./packing-lists-grid";

export const metadata: Metadata = { title: "Packing lists" };
export const dynamic = "force-dynamic";

export default async function PackingListsPage() {
  await requirePermission("dispatch:read");

  const lists = await prisma.packingList.findMany({
    include: {
      challan: {
        select: {
          id: true,
          code: true,
          dispatchedOn: true,
          customer: { select: { id: true, name: true } },
        },
      },
      _count: { select: { packages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <PackingListsGrid
      rows={lists.map((pl) => ({
        id: pl.id,
        code: pl.code,
        status: pl.status,
        challanId: pl.challan.id,
        challanCode: pl.challan.code,
        customerId: pl.challan.customer.id,
        customerName: pl.challan.customer.name,
        packageCount: pl._count.packages,
        date: pl.finalizedAt?.toISOString() ?? pl.createdAt.toISOString(),
        finalizedAt: pl.finalizedAt?.toISOString() ?? null,
        remark: pl.remark,
      }))}
    />
  );
}
