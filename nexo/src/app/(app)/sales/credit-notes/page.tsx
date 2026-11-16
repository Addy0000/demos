import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { CreditNotesGrid } from "./credit-notes-grid";

export const metadata: Metadata = { title: "Credit notes" };
export const dynamic = "force-dynamic";

export default async function CreditNotesPage() {
  await requirePermission("invoice:read");

  const rows = await prisma.creditNote.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      salesInvoice: { select: { id: true, code: true } },
      salesReturn: { select: { id: true, code: true } },
    },
    orderBy: { date: "desc" },
  });

  return (
    <CreditNotesGrid
      rows={rows.map((cn) => ({
        id: cn.id,
        number: cn.number,
        date: cn.date.toISOString(),
        customerId: cn.customer.id,
        customerName: cn.customer.name,
        invoiceId: cn.salesInvoice.id,
        invoiceCode: cn.salesInvoice.code,
        returnId: cn.salesReturn.id,
        returnCode: cn.salesReturn.code,
        total: Number(cn.totalValue),
        status: cn.status,
      }))}
    />
  );
}
