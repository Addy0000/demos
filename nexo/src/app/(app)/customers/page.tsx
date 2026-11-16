import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { CustomerGrid } from "./customer-grid";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const user = await requirePermission("customer:read");

  const rows = await prisma.customer.findMany({
    include: {
      owner: { select: { name: true } },
      _count: { select: { projects: true, contacts: true } },
      contacts: { where: { isPrimary: true }, select: { name: true, phone: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return (
    <CustomerGrid
      canWrite={can(user.role, "customer:write")}
      rows={rows.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        industry: c.industry,
        status: c.status,
        city: c.city ?? "—",
        state: c.state ?? "—",
        owner: c.owner?.name ?? "Unassigned",
        creditLimit: Number(c.creditLimit),
        outstanding: Number(c.outstandingAmt),
        creditDays: c.creditDays,
        projects: c._count.projects,
        primaryContact: c.contacts[0]?.name ?? "—",
        gstin: c.gstin ?? "—",
        updatedAt: c.updatedAt.toISOString(),
      }))}
    />
  );
}
