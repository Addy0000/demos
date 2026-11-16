import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };
export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("customer:write");
  const { id } = await params;

  const c = await prisma.customer.findUnique({ where: { id } });
  if (!c) notFound();

  return (
    <CustomerForm
      defaults={{
        id: c.id,
        name: c.name,
        legalName: c.legalName,
        industry: c.industry,
        status: c.status,
        gstin: c.gstin,
        pan: c.pan,
        addressLine1: c.addressLine1,
        city: c.city,
        state: c.state,
        pincode: c.pincode,
        creditLimit: Number(c.creditLimit),
        creditDays: c.creditDays,
        paymentTerms: c.paymentTerms,
      }}
    />
  );
}
