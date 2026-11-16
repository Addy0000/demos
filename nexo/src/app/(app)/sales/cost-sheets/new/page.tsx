import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { NewCostSheetForm } from "./new-cost-sheet-form";

export const metadata: Metadata = { title: "New cost sheet" };
export const dynamic = "force-dynamic";

export default async function NewCostSheetPage() {
  await requirePermission("costsheet:write");

  const formulations = await prisma.formulation.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      project: { select: { id: true, code: true, name: true, targetPricePerKg: true } },
      lines: {
        include: {
          material: { select: { id: true, name: true, code: true, currentPricePerKg: true } },
        },
      },
    },
  });

  return (
    <NewCostSheetForm
      formulations={formulations.map((f) => {
        const totalPhr = f.lines.reduce((acc, l) => acc + Number(l.phr), 0);
        const matCost = f.lines.reduce((acc, l) => {
          const frac = totalPhr > 0 ? Number(l.phr) / totalPhr : 0;
          return acc + frac * Number(l.material.currentPricePerKg ?? 0);
        }, 0);

        return {
          id: f.id,
          version: f.version,
          projectId: f.project.id,
          projectCode: f.project.code,
          projectName: f.project.name,
          targetPrice: f.project.targetPricePerKg ? Number(f.project.targetPricePerKg) : null,
          materialCostPerKg: matCost,
          lines: f.lines.map((l) => ({
            id: l.id,
            materialName: l.material.name,
            materialCode: l.material.code,
            phr: Number(l.phr),
            ratePerKg: Number(l.material.currentPricePerKg ?? 0),
          })),
        };
      })}
    />
  );
}
