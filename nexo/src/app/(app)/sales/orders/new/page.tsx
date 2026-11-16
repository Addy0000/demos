import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewSalesOrderForm } from "./new-sales-order-form";

export const metadata: Metadata = { title: "New sales order" };
export const dynamic = "force-dynamic";

export default async function NewSalesOrderPage() {
  await requirePermission("so:write");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      creditLimit: true,
      outstandingAmt: true,
      paymentTerms: true,
    },
  });

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      application: true,
      targetPricePerKg: true,
    },
  });

  return (
    <NewSalesOrderForm
      customers={customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        creditLimit: Number(c.creditLimit),
        outstandingAmt: Number(c.outstandingAmt),
        paymentTerms: c.paymentTerms,
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        application: p.application,
        targetPricePerKg: p.targetPricePerKg ? Number(p.targetPricePerKg) : null,
      }))}
    />
  );
}
