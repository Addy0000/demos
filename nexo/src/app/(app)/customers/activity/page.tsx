import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ActivityGrid } from "./activity-grid";

export const metadata: Metadata = { title: "Customer activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requirePermission("customer:read");

  const rows = await prisma.customerActivity.findMany({
    include: {
      customer: { select: { id: true, code: true, name: true } },
      user: { select: { name: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 2000,
  });

  return (
    <ActivityGrid
      rows={rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        subject: a.subject,
        occurredAt: a.occurredAt.toISOString(),
        customerId: a.customer.id,
        customerCode: a.customer.code,
        customerName: a.customer.name,
        user: a.user?.name ?? "—",
      }))}
    />
  );
}
