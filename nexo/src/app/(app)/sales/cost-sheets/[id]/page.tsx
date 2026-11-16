import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, costSheetTone, marginTone, salesQuotationTone } from "@/components/ui/chip";
import { CostSheetActions } from "./cost-sheet-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.costSheet.findUnique({ where: { id }, select: { code: true } });
  return { title: c?.code ?? "Cost sheet" };
}

export const dynamic = "force-dynamic";

export default async function CostSheetDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("costsheet:read");
  const { id } = await params;

  const sheet = await prisma.costSheet.findUnique({
    where: { id },
    include: {
      preparedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      formulation: {
        select: {
          id: true, basis: true,
          project: {
            select: {
              id: true, code: true, name: true, application: true, stage: true, targetPricePerKg: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          material: { select: { id: true, code: true, name: true, grade: true, category: true, currentPricePerKg: true } },
        },
      },
      quotations: {
        orderBy: { issuedOn: "desc" },
        include: { customer: { select: { name: true } }, orders: { select: { id: true, code: true } } },
      },
    },
  });

  if (!sheet) notFound();

  const material = Number(sheet.materialCostPerKg);
  const conversion = Number(sheet.conversionPerKg);
  const overheadPct = Number(sheet.overheadPct);
  const marginPct = Number(sheet.marginPct);
  const selling = Number(sheet.sellingRatePerKg);
  const overhead = (material + conversion) * (overheadPct / 100);
  const contribution = selling - material - conversion - overhead;

  // The sheet is frozen. This is what the same formulation would cost today —
  // the number that tells Finance whether the quotation still stands up.
  const todayMaterial = sheet.lines.reduce(
    (a, l) => a + Number(l.fractionKg) * Number(l.material.currentPricePerKg ?? 0),
    0,
  );
  const drift = todayMaterial - material;
  const driftPct = material > 0 ? (drift / material) * 100 : 0;

  const firstQuote = sheet.quotations[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/cost-sheets"
        backLabel="Cost sheets"
        code={sheet.code}
        title={sheet.formulation.project.name}
        status={<Chip tone={costSheetTone(sheet.status)}>{titleise(sheet.status)}</Chip>}
        actions={
          <CostSheetActions
            sheetId={sheet.id}
            status={sheet.status}
            canApprove={can(user.role, "costsheet:approve")}
            isOwnSheet={sheet.preparedBy?.id === user.id}
            marginPct={marginPct}
          />
        }
        meta={[
          { label: "Prepared", value: date(sheet.createdAt) },
          { label: "Material", value: <span className="font-num">₹{material.toFixed(2)}/kg</span> },
          { label: "Selling rate", value: <span className="font-num">₹{selling.toFixed(2)}/kg</span> },
          { label: "Margin", value: <Chip tone={marginTone(marginPct)}>{marginPct.toFixed(1)}%</Chip> },
          { label: "Quoted on", value: String(sheet.quotations.length) },
        ]}
      />

      <DocChain
        chain="sales"
        current="costsheet"
        links={{
          costsheet: { code: sheet.code, href: `/sales/cost-sheets/${sheet.id}` },
          ...(firstQuote && { squotation: { code: firstQuote.code, href: `/sales/quotations/${firstQuote.id}` } }),
          ...(firstQuote?.orders[0] && { sorder: { code: firstQuote.orders[0].code, href: `/sales/orders/${firstQuote.orders[0].id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            {Math.abs(driftPct) > 3 && (
              <div
                className={`border px-3 py-2 text-[12px] leading-relaxed text-ink ${
                  drift > 0 ? "border-danger/35 bg-danger-bg" : "border-success/35 bg-success-bg"
                }`}
              >
                <span className="font-semibold">
                  The rate base has moved {drift > 0 ? "against" : "in favour of"} this sheet.
                </span>{" "}
                Material would cost <span className="font-num">₹{todayMaterial.toFixed(2)}/kg</span> today
                against the <span className="font-num">₹{material.toFixed(2)}</span> frozen here —{" "}
                <span className="font-num font-semibold">
                  {drift > 0 ? "+" : ""}{driftPct.toFixed(1)}%
                </span>
                . {drift > 0
                  ? "Margin quoted off this sheet is thinner than it reads."
                  : "There is more room than this sheet shows."}
              </div>
            )}

            <Section
              title="Material cost"
              hint={`${sheet.lines.length} materials · per kg of finished compound`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Material" }, { label: "phr", align: "right" },
                  { label: "Share of 1 kg", align: "right" }, { label: "Rate then", align: "right" },
                  { label: "Cost/kg", align: "right" }, { label: "Rate now", align: "right" },
                ]}
              >
                {sheet.lines.map((l) => {
                  const now = Number(l.material.currentPricePerKg ?? 0);
                  const then = Number(l.ratePerKg);
                  const moved = then > 0 ? ((now - then) / then) * 100 : 0;
                  return (
                    <Tr key={l.id}>
                      <Td num muted>{l.lineNo}</Td>
                      <Td>
                        <Link href={`/procurement/materials/${l.material.id}`} className="ref-link">
                          {l.material.name}
                        </Link>
                        <span className="block font-num text-[11px] text-muted">
                          {l.material.code}{l.material.grade && ` · ${l.material.grade}`}
                        </span>
                      </Td>
                      <Td align="right" num muted>{Number(l.phr).toFixed(2)}</Td>
                      <Td align="right" num muted>{(Number(l.fractionKg) * 100).toFixed(2)}%</Td>
                      <Td align="right" num>₹{then.toFixed(2)}</Td>
                      <Td align="right" num>₹{Number(l.costPerKg).toFixed(3)}</Td>
                      <Td align="right" num>
                        <span className={Math.abs(moved) < 0.05 ? "text-muted" : moved > 0 ? "text-danger-text" : "text-success-text"}>
                          ₹{now.toFixed(2)}
                          {Math.abs(moved) >= 0.05 && (
                            <span className="ml-1 text-[10.5px]">{moved > 0 ? "+" : ""}{moved.toFixed(1)}%</span>
                          )}
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5">
                <span className="text-[11.5px] text-muted">
                  Rates as they stood when the sheet was built. Frozen so the quotation can be defended later.
                </span>
                <span className="font-num text-[12.5px] font-semibold tabular-nums text-ink">
                  ₹{material.toFixed(4)}/kg
                </span>
              </div>
            </Section>

            <Section title="Build-up to the selling rate" padded={false}>
              <MiniTable head={[{ label: "Element" }, { label: "Basis" }, { label: "₹ per kg", align: "right" }]}>
                <Tr>
                  <Td>Raw material</Td>
                  <Td muted>{sheet.lines.length} materials at the rates above</Td>
                  <Td align="right" num>₹{material.toFixed(3)}</Td>
                </Tr>
                <Tr>
                  <Td>Conversion</Td>
                  <Td muted>Power, labour, packing, wastage</Td>
                  <Td align="right" num>₹{conversion.toFixed(3)}</Td>
                </Tr>
                <Tr>
                  <Td>Overhead</Td>
                  <Td muted>{overheadPct.toFixed(2)}% of material plus conversion</Td>
                  <Td align="right" num>₹{overhead.toFixed(3)}</Td>
                </Tr>
                <Tr>
                  <Td>Margin</Td>
                  <Td muted>{marginPct.toFixed(2)}% on cost</Td>
                  <Td align="right" num className="text-success-text">₹{contribution.toFixed(3)}</Td>
                </Tr>
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-2">
                <span className="text-[11.5px] font-medium text-ink">Selling rate</span>
                <span className="font-num text-[13px] font-semibold tabular-nums text-ink">
                  ₹{selling.toFixed(2)}/kg
                </span>
              </div>
            </Section>

            {sheet.quotations.length > 0 && (
              <Section title="Quoted on" hint={`${sheet.quotations.length}`} padded={false}>
                <MiniTable
                  head={[{ label: "Quotation" }, { label: "Status" }, { label: "Customer" }, { label: "Issued" }, { label: "Value", align: "right" }]}
                >
                  {sheet.quotations.map((q) => (
                    <Tr key={q.id}>
                      <Td><Link href={`/sales/quotations/${q.id}`} className="ref-link font-num">{q.code}</Link></Td>
                      <Td><Chip tone={salesQuotationTone(q.status)}>{titleise(q.status)}</Chip></Td>
                      <Td muted>{q.customer.name}</Td>
                      <Td muted>{date(q.issuedOn)}</Td>
                      <Td align="right" num>{money(Number(q.totalValue))}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Sheet">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Compound",
                    value: <Link href={`/projects/${sheet.formulation.project.id}`} className="ref-link">{sheet.formulation.project.name}</Link>,
                  },
                  { label: "Application", value: sheet.formulation.project.application },
                  { label: "Stage", value: titleise(sheet.formulation.project.stage) },
                  {
                    label: "Customer",
                    value: sheet.formulation.project.customer ? (
                      <Link href={`/customers/${sheet.formulation.project.customer.id}`} className="ref-link">
                        {sheet.formulation.project.customer.name}
                      </Link>
                    ) : "—",
                  },
                  {
                    label: "Their target",
                    value: sheet.formulation.project.targetPricePerKg
                      ? <span className="font-num">₹{Number(sheet.formulation.project.targetPricePerKg).toFixed(2)}/kg</span>
                      : "—",
                  },
                  { label: "Prepared by", value: sheet.preparedBy?.name ?? "—" },
                  { label: "Prepared on", value: dateTime(sheet.createdAt) },
                  { label: "Approved by", value: sheet.approvedBy?.name ?? "—" },
                  { label: "Approved on", value: sheet.approvedAt ? dateTime(sheet.approvedAt) : "—" },
                ]}
              />
            </Section>

            <Section title="Against their target">
              {sheet.formulation.project.targetPricePerKg ? (
                (() => {
                  const target = Number(sheet.formulation.project.targetPricePerKg);
                  const gap = selling - target;
                  return (
                    <>
                      <FieldGrid
                        columns={1}
                        fields={[
                          { label: "Customer target", value: <span className="font-num">₹{target.toFixed(2)}/kg</span> },
                          { label: "Our selling rate", value: <span className="font-num">₹{selling.toFixed(2)}/kg</span> },
                          {
                            label: "Gap",
                            value: (
                              <span className={`font-num font-semibold ${gap > 0 ? "text-danger-text" : "text-success-text"}`}>
                                {gap > 0 ? "+" : ""}₹{gap.toFixed(2)}/kg
                              </span>
                            ),
                          },
                        ]}
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted">
                        {gap > 0
                          ? `We are ₹${gap.toFixed(2)} above what they said they would pay. Closing it costs ${((gap / selling) * 100).toFixed(1)}% of the rate.`
                          : "Inside their target — there is room to hold the rate."}
                      </p>
                    </>
                  );
                })()
              ) : (
                <p className="text-[12px] text-muted">
                  No target price recorded on the project, so there is nothing to compare against.
                </p>
              )}
            </Section>

            {sheet.decisionNote && (
              <Section title="Decision note">
                <p className="text-[12px] leading-relaxed text-ink">{sheet.decisionNote}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
