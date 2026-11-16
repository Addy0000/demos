import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ContactsGrid } from "./contacts-grid";

export const metadata: Metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  await requirePermission("customer:read");

  const rows = await prisma.customerContact.findMany({
    include: { customer: { select: { id: true, code: true, name: true, status: true, city: true } } },
    orderBy: [{ customer: { name: "asc" } }, { isPrimary: "desc" }],
  });

  return (
    <ContactsGrid
      rows={rows.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role ?? "—",
        email: c.email ?? "—",
        phone: c.phone ?? "—",
        isPrimary: c.isPrimary,
        customerId: c.customer.id,
        customerCode: c.customer.code,
        customerName: c.customer.name,
        customerStatus: c.customer.status,
        city: c.customer.city ?? "—",
      }))}
    />
  );
}
