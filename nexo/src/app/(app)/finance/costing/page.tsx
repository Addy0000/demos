import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getTenant } from "@/lib/tenant-server";
import { money, ratePerKg, titleise, amount } from "@/lib/format";
import { Chip, projectStageTone } from "@/components/ui/chip";
import { IconAlert } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTenant();
  return { title: t.labels["/finance/costing"] ?? `${t.noun.one} costing` };
}
export const dynamic = "force-dynamic";

/**
 * Costing rolls every formulation against the current approved rate base, so a
 * price approval this morning shows up in margin here this afternoon.
 */
export default async function CostingPage() {
  await requirePermission("price:read");
  const tenant = await getTenant();
  const noun = tenant.noun;

  const formulations = await prisma.formulation.findMany({
    include: {
      project: {
        select: {
          id: true, code: true, name: true, stage: true, targetPricePerKg: true,
          estimatedVolumeMt: true, customer: { select: { name: true } },
        },
      },
      lines: {
        orderBy: { sequence: "asc" },
        include: { material: { select: { name: true, category: true, currentPricePerKg: true } } },
      },
    },
  });

  const costed = formulations
    .map((f) => {
      const totalPhr = f.lines.reduce((a, l) => a + Number(l.phr), 0);
      const totalCost = f.lines.reduce((a, l) => a + Number(l.phr) * Number(l.material.currentPricePerKg ?? 0), 0);
      const costPerKg = totalPhr > 0 ? totalCost / totalPhr : 0;
      const target = f.project.targetPricePerKg ? Number(f.project.targetPricePerKg) : null;
      const volumeMt = f.project.estimatedVolumeMt ? Number(f.project.estimatedVolumeMt) : 0;
      const missingRates = f.lines.filter((l) => !l.material.currentPricePerKg).length;

      // The single biggest cost contributor — usually resin or plasticiser.
      const driver = f.lines
        .map((l) => ({ name: l.material.name, cost: Number(l.phr) * Number(l.material.currentPricePerKg ?? 0) }))
        .sort((a, b) => b.cost - a.cost)[0];

      return {
        id: f.id,
        project: f.project,
        totalPhr,
        costPerKg,
        target,
        margin: target ? ((target - costPerKg) / target) * 100 : null,
        marginValue: target ? (target - costPerKg) * volumeMt * 1000 : null,
        volumeMt,
        components: f.lines.length,
        missingRates,
        driver: driver ? { ...driver, share: totalCost > 0 ? (driver.cost / totalCost) * 100 : 0 } : null,
      };
    })
    .filter((c) => c.components > 0)
    .sort((a, b) => (a.margin ?? 999) - (b.margin ?? 999));

  const atRisk = costed.filter((c) => c.margin !== null && c.margin < 10);
  const totalAnnualMargin = costed.reduce((a, c) => a + (c.marginValue ?? 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">{tenant.labels["/finance/costing"] ?? `${noun.one} costing`}</h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {costed.length}
        </span>
        <span className="text-[11.5px] text-muted">
          Rolled against the current approved rate base
        </span>
        <div className="flex-1" />
        <span className="whitespace-nowrap text-[11.5px] text-muted">
          Annual material margin across all {noun.many}{" "}
          <span className="font-num font-semibold tabular-nums text-ink">{money(totalAnnualMargin)}</span>
        </span>
      </div>

      {atRisk.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning-bg px-3 py-2">
          <IconAlert size={14} className="shrink-0 text-warning" />
          <p className="text-[12px] text-ink">
            <span className="font-medium">{atRisk.length}</span> {atRisk.length === 1 ? `${noun.one.toLowerCase()} is` : `${noun.many} are`} below
            10% material margin at current rates. Re-quote or reformulate before the next price revision lands.
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-surface">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="grid-head">
              <th className="px-2.5 py-1.5 text-left">Project</th>
              <th className="px-2.5 py-1.5 text-left">{noun.one}</th>
              <th className="px-2.5 py-1.5 text-left">Customer</th>
              <th className="px-2.5 py-1.5 text-left">Stage</th>
              <th className="px-2.5 py-1.5 text-right">Components</th>
              <th className="px-2.5 py-1.5 text-right">Total phr</th>
              <th className="px-2.5 py-1.5 text-right">Cost ₹/kg</th>
              <th className="px-2.5 py-1.5 text-right">Target ₹/kg</th>
              <th className="px-2.5 py-1.5 text-right">Margin</th>
              <th className="px-2.5 py-1.5 text-right">MT/yr</th>
              <th className="px-2.5 py-1.5 text-right">Annual margin</th>
              <th className="px-2.5 py-1.5 text-left">Largest cost driver</th>
            </tr>
          </thead>
          <tbody>
            {costed.map((c) => (
              <tr key={c.id} className="grid-row">
                <td className="grid-cell">
                  <Link href={`/projects/${c.project.id}`} className="ref-link font-num">{c.project.code}</Link>
                </td>
                <td className="grid-cell max-w-[260px]">
                  <Link href={`/projects/${c.project.id}`} className="ref-link">{c.project.name}</Link>
                </td>
                <td className="grid-cell max-w-[160px] text-muted">{c.project.customer?.name ?? "—"}</td>
                <td className="grid-cell">
                  <Chip tone={projectStageTone(c.project.stage)}>{titleise(c.project.stage)}</Chip>
                </td>
                <td className="grid-cell text-right tnum">
                  <span className="inline-flex items-center justify-end gap-1">
                    {c.components}
                    {c.missingRates > 0 && (
                      <IconAlert size={12} className="shrink-0 text-warning-text">
                        <title>{c.missingRates} component(s) have no approved rate</title>
                      </IconAlert>
                    )}
                  </span>
                </td>
                <td className="grid-cell text-right tnum text-muted">{c.totalPhr.toFixed(2)}</td>
                <td className="grid-cell text-right tnum font-medium">{ratePerKg(c.costPerKg)}</td>
                <td className="grid-cell text-right tnum text-muted">{c.target ? ratePerKg(c.target) : "—"}</td>
                <td className="grid-cell text-right">
                  {c.margin === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <Chip tone={c.margin < 5 ? "danger" : c.margin < 15 ? "warning" : "success"}>
                      {c.margin.toFixed(1)}%
                    </Chip>
                  )}
                </td>
                <td className="grid-cell text-right tnum text-muted">{c.volumeMt ? c.volumeMt.toFixed(1) : "—"}</td>
                <td className="grid-cell text-right tnum">
                  {c.marginValue === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className={c.marginValue < 0 ? "font-medium text-danger" : ""}>{money(c.marginValue)}</span>
                  )}
                </td>
                <td className="grid-cell max-w-[240px] text-muted">
                  {c.driver ? (
                    <>
                      {c.driver.name}
                      <span className="ml-1.5 font-num text-[11px]">{c.driver.share.toFixed(0)}%</span>
                    </>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {costed.length === 0 && (
          <p className="py-20 text-center text-[12.5px] text-muted">
            No formulations have components recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}
