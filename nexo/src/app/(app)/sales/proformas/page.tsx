import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ProformasGrid } from "./proformas-grid";
import { SalesQuotationStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Proforma invoices" };
export const dynamic = "force-dynamic";

export default async function ProformasPage() {
  await requirePermission("squote:read");

  const quotations = await prisma.salesQuotation.findMany({
    where: {
      status: {
        in: [SalesQuotationStatus.SENT, SalesQuotationStatus.ACCEPTED, SalesQuotationStatus.UNDER_NEGOTIATION, SalesQuotationStatus.DRAFT],
      },
    },
    orderBy: { issuedOn: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });

  return (
    <ProformasGrid
      rows={quotations.map((q) => ({
        id: q.id,
        code: q.code,
        status: q.status,
        customerId: q.customer.id,
        customerName: q.customer.name,
        issuedOn: q.issuedOn.toISOString(),
        validUntil: q.validUntil ? q.validUntil.toISOString() : null,
        totalValue: Number(q.totalValue),
      }))}
    />
  );
}
