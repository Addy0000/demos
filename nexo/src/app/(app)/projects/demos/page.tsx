import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DemosGrid } from "./demos-grid";

export const metadata: Metadata = { title: "Samples & demos" };
export const dynamic = "force-dynamic";

export default async function DemosPage() {
  await requirePermission("demo:read");

  const rows = await prisma.productDemo.findMany({
    include: {
      project: {
        select: {
          id: true, code: true, name: true, targetShoreA: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { dispatchedOn: "desc" }],
  });

  return (
    <DemosGrid
      rows={rows.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        status: d.status,
        projectId: d.project.id,
        projectCode: d.project.code,
        projectName: d.project.name,
        customerId: d.project.customer?.id ?? null,
        customer: d.project.customer?.name ?? "—",
        quantityKg: d.quantityKg ? Number(d.quantityKg) : null,
        batchRef: d.batchRef ?? "—",
        dispatchedOn: d.dispatchedOn?.toISOString() ?? null,
        courierRef: d.courierRef ?? "—",
        feedbackOn: d.feedbackOn?.toISOString() ?? null,
        feedback: d.feedback ?? "",
        measuredShoreA: d.measuredShoreA,
        targetShoreA: d.project.targetShoreA,
        measuredTensile: d.measuredTensileMpa ? Number(d.measuredTensileMpa) : null,
        measuredElongation: d.measuredElongationPct,
      }))}
    />
  );
}
