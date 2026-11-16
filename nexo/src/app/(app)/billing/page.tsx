import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { BillingGrid } from "../_services/grids";

export const metadata: Metadata = { title: "Billing & collections" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  await requirePermission("billing:read");
  const now = new Date().getTime();
  const rows = await prisma.serviceInvoice.findMany({
    include: { customer: { select: { id: true, name: true } }, engagement: { select: { id: true, code: true } } },
    orderBy: { invoiceDate: "desc" },
  });
  return (
    <BillingGrid
      rows={rows.map((i) => ({
        id: i.id,
        code: i.code,
        invoiceDate: i.invoiceDate.toISOString(),
        dueOn: i.dueOn.toISOString(),
        clientId: i.customer.id,
        client: i.customer.name,
        engagementId: i.engagement?.id ?? null,
        engagement: i.engagement?.code ?? null,
        description: i.description,
        total: Number(i.totalValue),
        paid: Number(i.paidAmount),
        status: i.status,
        daysOverdue: Math.max(0, Math.floor((now - i.dueOn.getTime()) / 86_400_000)),
      }))}
    />
  );
}
