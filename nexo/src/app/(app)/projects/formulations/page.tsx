import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { FormulationsGrid } from "./formulations-grid";

export const metadata: Metadata = { title: "Formulations" };
export const dynamic = "force-dynamic";

export default async function FormulationsPage() {
  const user = await requirePermission("project:read");
  const seesPrices = can(user.role, "price:read");

  const formulations = await prisma.formulation.findMany({
    include: {
      project: {
        select: {
          id: true, code: true, name: true, stage: true, application: true,
          targetPricePerKg: true, customer: { select: { name: true } },
        },
      },
      lines: { include: { material: { select: { category: true, currentPricePerKg: true } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = formulations.map((f) => {
    const totalPhr = f.lines.reduce((a, l) => a + Number(l.phr), 0);
    const totalCost = f.lines.reduce((a, l) => a + Number(l.phr) * Number(l.material.currentPricePerKg ?? 0), 0);
    const costPerKg = totalPhr > 0 ? totalCost / totalPhr : 0;
    const target = f.project.targetPricePerKg ? Number(f.project.targetPricePerKg) : null;

    const resinPhr = f.lines
      .filter((l) => l.material.category === "PVC_RESIN")
      .reduce((a, l) => a + Number(l.phr), 0);
    const fillerPhr = f.lines
      .filter((l) => l.material.category === "FILLER")
      .reduce((a, l) => a + Number(l.phr), 0);
    const plastPhr = f.lines
      .filter((l) => l.material.category === "PLASTICISER")
      .reduce((a, l) => a + Number(l.phr), 0);

    return {
      id: f.id,
      projectId: f.project.id,
      code: f.project.code,
      name: f.project.name,
      application: f.project.application,
      stage: f.project.stage,
      customer: f.project.customer?.name ?? "—",
      version: f.version,
      components: f.lines.length,
      totalPhr,
      resinPhr,
      plastPhr,
      fillerPhr,
      costPerKg: seesPrices ? costPerKg : null,
      target: seesPrices ? target : null,
      margin: seesPrices && target ? ((target - costPerKg) / target) * 100 : null,
      updatedAt: f.updatedAt.toISOString(),
    };
  });

  return <FormulationsGrid rows={rows} seesPrices={seesPrices} />;
}
