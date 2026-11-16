import type { Metadata } from "next";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SubmissionsList } from "./submissions-list";

export const metadata: Metadata = { title: "My submissions" };
export const dynamic = "force-dynamic";

export default async function VendorSubmissionsPage() {
  const user = await requirePermission("price:submit");
  if (user.role !== Role.VENDOR) redirect("/finance/history");
  const vendorId = user.vendorId;
  if (!vendorId) redirect("/denied?need=vendor+account");

  const submissions = await prisma.materialPrice.findMany({
    where: { vendorId },
    include: { material: { select: { id: true, code: true, name: true, category: true } }, approvedBy: { select: { name: true } } },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <SubmissionsList
      rows={submissions.map((p) => ({
        id: p.id,
        materialCode: p.material.code,
        materialName: p.material.name,
        category: p.material.category,
        pricePerKg: Number(p.pricePerKg),
        changePct: p.changePct !== null ? Number(p.changePct) : null,
        status: p.status,
        effectiveFrom: p.effectiveFrom.toISOString(),
        effectiveTo: p.effectiveTo?.toISOString() ?? null,
        submittedAt: p.submittedAt.toISOString(),
        decidedAt: p.approvedAt?.toISOString() ?? null,
        decidedBy: p.approvedBy?.name ?? null,
        rejectionReason: p.rejectionReason ?? null,
        remark: p.remark ?? "",
        moqKg: p.moqKg ? Number(p.moqKg) : null,
      }))}
    />
  );
}
