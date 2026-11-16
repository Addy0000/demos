import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, ratePerKg, date, dateLong, titleise, amount } from "@/lib/format";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { Chip, DotLabel, projectStageTone, priorityTone, demoStatusTone } from "@/components/ui/chip";
import { IconDocument, IconExternal } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await prisma.project.findUnique({ where: { id }, select: { name: true } });
  return { title: p?.name ?? "Project" };
}

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("project:read");
  const { id } = await params;
  const writable = can(user.role, "project:write");
  const seesPrices = can(user.role, "price:read");

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, code: true, industry: true } },
      manager: { select: { name: true, email: true } },
      formulation: {
        include: {
          lines: {
            orderBy: { sequence: "asc" },
            include: {
              material: {
                select: { id: true, code: true, name: true, category: true, grade: true, currentPricePerKg: true },
              },
            },
          },
        },
      },
      documents: { orderBy: [{ type: "asc" }, { createdAt: "desc" }], include: { uploadedBy: { select: { name: true } } } },
      demos: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!project) notFound();

  // Live costing off the current approved rate base — the reason Finance and
  // Projects share this screen at all.
  const lines = project.formulation?.lines ?? [];
  const totalPhr = lines.reduce((a, l) => a + Number(l.phr), 0);
  const totalCost = lines.reduce((a, l) => a + Number(l.phr) * Number(l.material.currentPricePerKg ?? 0), 0);
  const costPerKg = totalPhr > 0 ? totalCost / totalPhr : 0;
  const target = project.targetPricePerKg ? Number(project.targetPricePerKg) : null;
  const margin = target ? ((target - costPerKg) / target) * 100 : null;

  const specs = [
    ["Shore A hardness", project.targetShoreA ? `${project.targetShoreA} ± 3` : null],
    ["Specific gravity", project.targetSpGravity ? Number(project.targetSpGravity).toFixed(3) : null],
    ["Tensile strength", project.targetTensileMpa ? `${Number(project.targetTensileMpa).toFixed(1)} MPa min` : null],
    ["Elongation at break", project.targetElongationPct ? `${project.targetElongationPct}% min` : null],
    ["Volume resistivity", project.targetVolumeResist],
    ["LOI", project.targetLoiPct ? `${Number(project.targetLoiPct).toFixed(1)}%` : null],
    ["Temperature rating", project.targetTempRating],
    ["Standard", project.standard],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/projects"
        backLabel="Projects"
        code={project.code}
        title={project.name}
        status={
          <span className="flex items-center gap-1.5">
            <DotLabel tone={priorityTone(project.priority)}>{titleise(project.priority)}</DotLabel>
            <Chip tone={projectStageTone(project.stage)}>{titleise(project.stage)}</Chip>
          </span>
        }
        actions={
          writable ? (
            <Link
              href={`/projects/${project.id}/edit`}
              className="inline-flex h-[26px] items-center rounded border border-edge bg-surface px-2.5 text-[12px] font-medium text-ink transition-colors duration-150 hover:bg-pastel hover:text-primary"
            >
              Edit
            </Link>
          ) : null
        }
        meta={[
          { label: "Application", value: project.application },
          {
            label: "Customer",
            value: project.customer ? (
              <Link href={`/customers/${project.customer.id}`} className="ref-link">{project.customer.name}</Link>
            ) : "—",
          },
          { label: "Manager", value: project.manager?.name ?? "Unassigned" },
          { label: "Target date", value: date(project.targetDate) },
          { label: "Est. volume", value: project.estimatedVolumeMt ? `${Number(project.estimatedVolumeMt).toFixed(1)} MT/yr` : "—" },
        ]}
      />

      <RecordTabs
        storageKey="project"
        tabs={[
          {
            id: "formulation",
            label: "Formulation",
            count: lines.length || undefined,
            content: (
              <TabColumns
                aside={
                  <>
                    <Section title="Target specification">
                      {specs.length ? (
                        <FieldGrid columns={1} fields={specs.map(([label, value]) => ({ label, value }))} />
                      ) : (
                        <p className="py-4 text-center text-[12px] text-muted">No target specification recorded.</p>
                      )}
                    </Section>

                    {seesPrices && lines.length > 0 && (
                      <Section title="Cost breakdown by category">
                        <CategoryBreakdown lines={lines} totalCost={totalCost} />
                      </Section>
                    )}
                  </>
                }
                main={
            <Section
              title="Formulation"
              hint={
                project.formulation
                  ? `Version ${project.formulation.version} · ${lines.length} components · ${totalPhr.toFixed(2)} phr total`
                  : "Not yet built"
              }
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#", width: "36px" },
                  { label: "Code", width: "84px" },
                  { label: "Material" },
                  { label: "Category", width: "130px" },
                  { label: "phr", width: "76px", align: "right" },
                  { label: "% w/w", width: "72px", align: "right" },
                  ...(seesPrices
                    ? ([{ label: "₹/kg", width: "88px", align: "right" }, { label: "Cost contrib.", width: "104px", align: "right" }] as const)
                    : []),
                  { label: "Function", width: "170px" },
                ]}
                empty="No formulation recorded for this project yet."
              >
                {lines.map((l, i) => {
                  const phr = Number(l.phr);
                  const rate = Number(l.material.currentPricePerKg ?? 0);
                  const contrib = phr * rate;
                  return (
                    <Tr key={l.id}>
                      <Td muted num>{i + 1}</Td>
                      <Td>
                        <Link href={`/procurement/materials/${l.material.id}`} className="ref-link font-num">
                          {l.material.code}
                        </Link>
                      </Td>
                      <Td>
                        <Link href={`/procurement/materials/${l.material.id}`} className="ref-link">
                          {l.material.name}
                        </Link>
                        {l.material.grade && <span className="ml-1.5 text-[11px] text-muted">{l.material.grade}</span>}
                      </Td>
                      <Td muted>{titleise(l.material.category)}</Td>
                      <Td align="right" num className="font-medium">{phr.toFixed(2)}</Td>
                      <Td align="right" num muted>{totalPhr ? ((phr / totalPhr) * 100).toFixed(1) : "—"}</Td>
                      {seesPrices && (
                        <>
                          <Td align="right" num muted>{rate ? amount(rate) : "—"}</Td>
                          <Td align="right" num>{contrib ? amount(contrib) : "—"}</Td>
                        </>
                      )}
                      <Td muted>{l.remark ?? "—"}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>

              {lines.length > 0 && seesPrices && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-edge bg-faint px-3 py-2">
                  <span className="text-[11.5px] text-muted">
                    Batch cost at current approved rates{" "}
                    <span className="font-num font-semibold tabular-nums text-ink">{money(totalCost, 2)}</span>
                    <span className="text-muted"> / {totalPhr.toFixed(2)} phr</span>
                  </span>
                  <span className="text-[11.5px] text-muted">
                    Material cost{" "}
                    <span className="font-num text-[13px] font-semibold tabular-nums text-ink">
                      {ratePerKg(costPerKg)}
                    </span>
                    <span className="text-muted"> per kg of compound</span>
                  </span>
                  {target && (
                    <>
                      <span className="text-[11.5px] text-muted">
                        Target <span className="font-num font-semibold tabular-nums text-ink">{ratePerKg(target)}</span>
                      </span>
                      <Chip tone={margin === null ? "neutral" : margin < 5 ? "danger" : margin < 15 ? "warning" : "success"}>
                        {margin!.toFixed(1)}% gross margin on materials
                      </Chip>
                    </>
                  )}
                </div>
              )}
            </Section>
                }
              />
            ),
          },
          {
            id: "documents",
            label: "Documents",
            count: project.documents.length || undefined,
            content: (
            <Section title="Documents" hint={`${project.documents.length} on file`} padded={false}>
              <MiniTable
                head={[
                  { label: "Type", width: "110px" },
                  { label: "Title" },
                  { label: "Rev", width: "58px" },
                  { label: "Issued", width: "100px" },
                  { label: "Expires", width: "100px" },
                  { label: "Uploaded by", width: "140px" },
                ]}
                empty="No documents attached. TDS, specifications and test reports belong here."
              >
                {project.documents.map((d) => {
                  const expired = d.expiresOn && new Date(d.expiresOn) < new Date();
                  return (
                    <Tr key={d.id}>
                      <Td><Chip tone={d.type === "TDS" ? "info" : d.type === "COA" ? "success" : "neutral"}>{d.type}</Chip></Td>
                      <Td>
                        <Link href={`/documents/${d.id}`} className="ref-link flex items-center gap-1.5">
                          <IconDocument size={13} className="shrink-0 text-nav-dim" />
                          <span className="truncate">{d.title}</span>
                        </Link>
                      </Td>
                      <Td num muted>{d.revision}</Td>
                      <Td num muted>{date(d.issuedOn)}</Td>
                      <Td num className={expired ? "text-danger" : "text-muted"}>
                        {d.expiresOn ? date(d.expiresOn) : "—"}
                      </Td>
                      <Td muted>{d.uploadedBy?.name ?? "—"}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
            </Section>
            ),
          },
          {
            id: "demos",
            label: "Samples & demos",
            count: project.demos.length || undefined,
            content: (
            <Section title="Samples & demos" hint={`${project.demos.length} recorded`} padded={false}>
              <MiniTable
                head={[
                  { label: "Code", width: "96px" },
                  { label: "Sample" },
                  { label: "Status", width: "140px" },
                  { label: "Qty", width: "76px", align: "right" },
                  { label: "Dispatched", width: "100px" },
                  { label: "Measured Shore A", width: "130px", align: "right" },
                  { label: "Feedback" },
                ]}
                empty="No samples raised for this project."
              >
                {project.demos.map((d) => (
                  <Tr key={d.id}>
                    <Td num><span className="text-muted">{d.code}</span></Td>
                    <Td>{d.title}</Td>
                    <Td><Chip tone={demoStatusTone(d.status)}>{titleise(d.status)}</Chip></Td>
                    <Td align="right" num muted>{d.quantityKg ? `${Number(d.quantityKg).toFixed(0)} kg` : "—"}</Td>
                    <Td num muted>{date(d.dispatchedOn)}</Td>
                    <Td align="right" num>
                      {d.measuredShoreA ? (
                        <span
                          className={
                            project.targetShoreA && Math.abs(d.measuredShoreA - project.targetShoreA) > 3
                              ? "font-medium text-danger"
                              : ""
                          }
                        >
                          {d.measuredShoreA}
                        </span>
                      ) : "—"}
                    </Td>
                    <Td muted className="max-w-[280px] truncate">{d.feedback ?? "—"}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
            ),
          },
          {
            id: "details",
            label: "Details",
            content: (
              <TabColumns
                main={
                  <Section title="Record">
                    <FieldGrid
                      columns={2}
                      fields={[
                        { label: "Project code", value: <span className="font-num">{project.code}</span> },
                        { label: "Application", value: project.application },
                        { label: "Started", value: dateLong(project.startedAt) },
                        { label: "Target date", value: dateLong(project.targetDate) },
                        { label: "Completed", value: project.completedAt ? dateLong(project.completedAt) : "—" },
                        { label: "Standard", value: project.standard ?? "—" },
                        {
                          label: "Customer",
                          value: project.customer ? (
                            <Link href={`/customers/${project.customer.id}`} className="ref-link">
                              {project.customer.name}
                            </Link>
                          ) : "—",
                        },
                        { label: "Manager", value: project.manager?.name ?? "Unassigned" },
                        { label: "Notes", value: project.notes ?? "—", span: true },
                      ]}
                    />
                  </Section>
                }
                aside={
                  <Section title="Target specification">
                    {specs.length ? (
                      <FieldGrid columns={1} fields={specs.map(([label, value]) => ({ label, value }))} />
                    ) : (
                      <p className="py-4 text-center text-[12px] text-muted">No target specification recorded.</p>
                    )}
                  </Section>
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}

/** Where the money actually goes in a compound — resin vs plasticiser vs filler. */
function CategoryBreakdown({
  lines,
  totalCost,
}: {
  lines: { phr: unknown; material: { category: string; currentPricePerKg: unknown } }[];
  totalCost: number;
}) {
  const byCat = new Map<string, number>();
  for (const l of lines) {
    const c = Number(l.phr) * Number(l.material.currentPricePerKg ?? 0);
    byCat.set(l.material.category, (byCat.get(l.material.category) ?? 0) + c);
  }
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const RAMP = ["#315B7D", "#557D98", "#7EA8C4", "#B8D0DE", "#7FAF9B", "#8E86A8", "#C7A86B"];

  return (
    <div className="space-y-1.5 py-1">
      {sorted.map(([cat, cost], i) => {
        const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        return (
          <div key={cat}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11.5px] text-ink">{titleise(cat)}</span>
              <span className="shrink-0 font-num text-[11.5px] tabular-nums text-muted">
                {pct.toFixed(1)}% · {money(cost, 2)}
              </span>
            </div>
            <div className="mt-0.5 h-[5px] w-full overflow-hidden rounded-sm bg-faint">
              <div
                className="h-full rounded-sm transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%`, background: RAMP[i % RAMP.length] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
