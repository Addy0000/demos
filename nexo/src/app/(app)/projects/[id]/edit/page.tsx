import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = { title: "Edit project" };
export const dynamic = "force-dynamic";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("project:write");
  const { id } = await params;

  const [p, customers] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.customer.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  if (!p) notFound();

  return (
    <ProjectForm
      customers={customers}
      defaults={{
        id: p.id,
        name: p.name,
        application: p.application,
        stage: p.stage,
        priority: p.priority,
        customerId: p.customerId,
        targetShoreA: p.targetShoreA,
        targetSpGravity: p.targetSpGravity ? Number(p.targetSpGravity) : null,
        targetTensileMpa: p.targetTensileMpa ? Number(p.targetTensileMpa) : null,
        targetElongationPct: p.targetElongationPct,
        targetVolumeResist: p.targetVolumeResist,
        targetLoiPct: p.targetLoiPct ? Number(p.targetLoiPct) : null,
        targetTempRating: p.targetTempRating,
        standard: p.standard,
        targetPricePerKg: p.targetPricePerKg ? Number(p.targetPricePerKg) : null,
        estimatedVolumeMt: p.estimatedVolumeMt ? Number(p.estimatedVolumeMt) : null,
        targetDate: p.targetDate ? p.targetDate.toISOString().slice(0, 10) : null,
        notes: p.notes,
      }}
    />
  );
}
