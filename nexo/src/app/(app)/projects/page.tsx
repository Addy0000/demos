import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ProjectGrid } from "./project-grid";

export const metadata: Metadata = { title: "Projects" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await requirePermission("project:read");

  const rows = await prisma.project.findMany({
    include: {
      customer: { select: { id: true, name: true } },
      manager: { select: { name: true } },
      formulation: { select: { version: true, _count: { select: { lines: true } } } },
      _count: { select: { documents: true, demos: true } },
    },
    orderBy: [{ priority: "asc" }, { startedAt: "desc" }],
  });

  return (
    <ProjectGrid
      canWrite={can(user.role, "project:write")}
      rows={rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        application: p.application,
        stage: p.stage,
        priority: p.priority,
        customerId: p.customer?.id ?? null,
        customer: p.customer?.name ?? "—",
        manager: p.manager?.name ?? "Unassigned",
        standard: p.standard ?? "—",
        shoreA: p.targetShoreA,
        tempRating: p.targetTempRating ?? "—",
        targetPrice: p.targetPricePerKg ? Number(p.targetPricePerKg) : null,
        volumeMt: p.estimatedVolumeMt ? Number(p.estimatedVolumeMt) : null,
        lines: p.formulation?._count.lines ?? 0,
        version: p.formulation?.version ?? 0,
        documents: p._count.documents,
        demos: p._count.demos,
        targetDate: p.targetDate?.toISOString() ?? null,
        startedAt: p.startedAt.toISOString(),
      }))}
    />
  );
}
