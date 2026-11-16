import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewSalesInquiryForm } from "./new-sales-inquiry-form";

export const metadata: Metadata = { title: "New sales inquiry" };
export const dynamic = "force-dynamic";

export default async function NewSalesInquiryPage() {
  await requirePermission("sales:write");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      industry: true,
    },
  });

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      application: true,
    },
  });

  return (
    <NewSalesInquiryForm
      customers={customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        industry: c.industry,
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        application: p.application,
      }))}
    />
  );
}
