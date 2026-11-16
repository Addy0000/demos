import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Section } from "@/components/detail/record";
import { date } from "@/lib/format";
import { Gantt, toneFor } from "../../_services/gantt";

export const metadata: Metadata = { title: "Plan & timeline" };
export const dynamic = "force-dynamic";

/** Every engagement and its milestones across the quarter either side of today. */
export default async function TimelinePage() {
  await requirePermission("engagement:read");
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 4, 0);

  const engagements = await prisma.engagement.findMany({
    where: { endOn: { gte: from }, startOn: { lte: to } },
    include: {
      customer: { select: { name: true } },
      manager: { select: { name: true } },
      tasks: { select: { name: true, endOn: true, isMilestone: true, status: true, progressPct: true, plannedHours: true } },
    },
    orderBy: [{ serviceLine: "asc" }, { startOn: "asc" }],
  });

  const dueSoon = engagements
    .flatMap((e) => e.tasks.filter((t) => t.isMilestone && t.status !== "DONE").map((t) => ({ e, t })))
    .filter(({ t }) => t.endOn.getTime() - now.getTime() < 14 * 86_400_000)
    .sort((a, b) => a.t.endOn.getTime() - b.t.endOn.getTime());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="text-[14px] font-semibold tracking-tight text-ink">Plan &amp; timeline</h1>
        <span className="font-num text-[11.5px] text-muted">
          {engagements.length} engagements · {date(from)} – {date(to)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Section title="Portfolio" hint="bars filled to progress · diamonds are milestones" padded={false}>
            <Gantt
              from={from}
              to={to}
              labelWidth={290}
              rows={engagements.flatMap((e) => {
                const planned = e.tasks.reduce((s, t) => s + t.plannedHours, 0) || 1;
                const progress = Math.round(e.tasks.reduce((s, t) => s + t.progressPct * t.plannedHours, 0) / planned);
                return [
                  {
                    id: e.id,
                    group: e.serviceLine,
                    label: `${e.code}  ${e.customer.name}`,
                    sub: `${e.name}${e.manager ? ` · ${e.manager.name}` : ""}`,
                    start: e.startOn.toISOString(),
                    end: e.endOn.toISOString(),
                    progress,
                    tone: toneFor(e.startOn, e.endOn, progress, e.status, now),
                    href: `/engagements/${e.id}`,
                  },
                ];
              })}
            />
          </Section>
          <Section title="Milestones due in 14 days">
            {dueSoon.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted">None due.</p>
            ) : (
              <ul className="divide-y divide-edge/60">
                {dueSoon.map(({ e, t }) => {
                  const late = t.endOn < now;
                  return (
                    <li key={`${e.id}-${t.name}`} className="py-2">
                      <p className="text-[12.5px] text-ink">{t.name.replace(/^Milestone: /, "")}</p>
                      <p className="mt-0.5 flex justify-between text-[11px] text-muted">
                        <span className="truncate">
                          {e.code} · {e.customer.name}
                        </span>
                        <span className={`shrink-0 font-num ${late ? "text-danger-text" : ""}`}>{late ? `late, ${date(t.endOn)}` : date(t.endOn)}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
