import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewQuotationForm } from "./new-quotation-form";
import { SalesInquiryStatus, CostSheetStatus } from "@prisma/client";

export const metadata: Metadata = { title: "New sales quotation" };
export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  await requirePermission("squote:write");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      paymentTerms: true,
    },
  });

  const inquiries = await prisma.salesInquiry.findMany({
    where: {
      status: { in: [SalesInquiryStatus.OPEN, SalesInquiryStatus.DRAFT] },
    },
    orderBy: { receivedOn: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      lines: { select: { id: true, lineNo: true, description: true, quantityKg: true, targetRate: true } },
    },
  });

  const costSheets = await prisma.costSheet.findMany({
    where: { status: CostSheetStatus.APPROVED },
    orderBy: { createdAt: "desc" },
    include: {
      formulation: {
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      },
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
      formulation: {
        select: {
          costSheets: {
            where: { status: CostSheetStatus.APPROVED },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, code: true, sellingRatePerKg: true },
          },
        },
      },
    },
  });

  return (
    <NewQuotationForm
      customers={customers.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        paymentTerms: c.paymentTerms,
      }))}
      inquiries={inquiries.map((i) => ({
        id: i.id,
        code: i.code,
        customerId: i.customer.id,
        customerName: i.customer.name,
        lines: i.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: l.description,
          quantityKg: Number(l.quantityKg),
          targetRate: l.targetRate ? Number(l.targetRate) : null,
        })),
      }))}
      costSheets={costSheets.map((cs) => ({
        id: cs.id,
        code: cs.code,
        projectId: cs.formulation.project.id,
        projectName: cs.formulation.project.name,
        sellingRatePerKg: Number(cs.sellingRatePerKg),
        marginPct: Number(cs.marginPct),
      }))}
      projects={projects.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        application: p.application,
        floorRate: p.formulation?.costSheets[0] ? Number(p.formulation.costSheets[0].sellingRatePerKg) : (p.targetPricePerKg ? Number(p.targetPricePerKg) : null),
        costSheetCode: p.formulation?.costSheets[0]?.code ?? null,
      }))}
    />
  );
}
