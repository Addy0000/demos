import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { IconPlus } from "@/components/icons";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, salesInquiryTone, salesQuotationTone, costSheetTone, marginTone } from "@/components/ui/chip";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const i = await prisma.salesInquiry.findUnique({ where: { id }, select: { code: true } });
  return { title: i?.code ?? "Sales inquiry" };
}

export const dynamic = "force-dynamic";

export default async function SalesInquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sales:read");
  const { id } = await params;

  const inq = await prisma.salesInquiry.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, industry: true, city: true, state: true, creditDays: true } },
      project: {
        select: {
          id: true, code: true, name: true, application: true, stage: true, targetPricePerKg: true,
          formulation: { select: { id: true, costSheets: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, code: true, status: true, marginPct: true, sellingRatePerKg: true } } } },
        },
      },
      owner: { select: { name: true } },
      lines: { orderBy: { lineNo: "asc" } },
      quotations: {
        orderBy: { issuedOn: "desc" },
        include: {
          costSheet: { select: { id: true, code: true, status: true } },
          orders: { select: { id: true, code: true } },
        },
      },
    },
  });

  if (!inq) notFound();

  const canSeeMargin = can(user.role, "costsheet:read");
  const asked = inq.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const sheet = inq.project?.formulation?.costSheets[0];
  const quote = inq.quotations[0];
  const order = quote?.orders[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/inquiries"
        backLabel="Sales inquiries"
        code={inq.code}
        title={inq.customer.name}
        status={<Chip tone={salesInquiryTone(inq.status)}>{titleise(inq.status)}</Chip>}
        actions={
          inq.status !== "CLOSED" && inq.status !== "LOST" ? (
            <div className="flex items-center gap-1.5">
              <Link
                href="/sales/cost-sheets/new"
                className="flex items-center gap-1 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
              >
                <IconPlus size={12} />
                Create cost sheet
              </Link>
              <Link
                href={`/sales/quotations/new?inquiryId=${inq.id}`}
                className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
              >
                <IconPlus size={12} />
                Create quotation
              </Link>
            </div>
          ) : null
        }
        meta={[
          { label: "Received", value: date(inq.receivedOn) },
          { label: "Required by", value: date(inq.requiredBy) },
          { label: "Lines", value: String(inq.lines.length) },
          { label: "Quantity", value: kg(asked) },
          { label: "Quotations", value: String(inq.quotations.length) },
        ]}
      />

      <DocChain
        chain="sales"
        current="sinquiry"
        links={{
          sinquiry: { code: inq.code, href: `/sales/inquiries/${inq.id}` },
          ...(sheet && { costsheet: { code: sheet.code, href: `/sales/cost-sheets/${sheet.id}` } }),
          ...(quote && { squotation: { code: quote.code, href: `/sales/quotations/${quote.id}` } }),
          ...(order && { sorder: { code: order.code, href: `/sales/orders/${order.id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            {inq.status === "LOST" && inq.lostReason && (
              <div className="border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] leading-relaxed text-ink">
                <span className="font-semibold">Lost.</span> {inq.lostReason}
              </div>
            )}

            <Section
              title="What they asked for"
              hint="In the customer's own terms, before it is matched to a compound"
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Requirement" },
                  { label: "Quantity", align: "right" }, { label: "Their target rate", align: "right" },
                ]}
              >
                {inq.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td num muted>{l.lineNo}</Td>
                    <Td>{l.description}</Td>
                    <Td align="right" num>{kgPlain(Number(l.quantityKg))}</Td>
                    <Td align="right" num muted>
                      {l.targetRate ? `₹${Number(l.targetRate).toFixed(2)}` : "not stated"}
                    </Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>

            <Section
              title="Quotations sent"
              hint={inq.quotations.length === 0 ? "Nothing quoted yet" : `${inq.quotations.length}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "Quotation" }, { label: "Status" }, { label: "Issued" },
                  { label: "Valid to" }, { label: "Cost sheet" }, { label: "Value", align: "right" },
                ]}
                empty={
                  inq.status === "OPEN"
                    ? "Open and unanswered. Build a cost sheet from the compound, then quote."
                    : "Nothing was quoted against this inquiry."
                }
              >
                {inq.quotations.map((q) => (
                  <Tr key={q.id}>
                    <Td><Link href={`/sales/quotations/${q.id}`} className="ref-link font-num">{q.code}</Link></Td>
                    <Td><Chip tone={salesQuotationTone(q.status)}>{titleise(q.status)}</Chip></Td>
                    <Td muted>{date(q.issuedOn)}</Td>
                    <Td muted>{date(q.validUntil)}</Td>
                    <Td>
                      {q.costSheet ? (
                        <span className="flex items-center gap-1.5">
                          <Link href={`/sales/cost-sheets/${q.costSheet.id}`} className="ref-link font-num text-[11.5px]">
                            {q.costSheet.code}
                          </Link>
                          {q.costSheet.status !== "APPROVED" && (
                            <span className="text-[10.5px] text-warning">unsigned</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td align="right" num>{money(Number(q.totalValue))}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </>
        }
        aside={
          <>
            <Section title="Inquiry">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: <Link href={`/customers/${inq.customer.id}`} className="ref-link">{inq.customer.name}</Link>,
                  },
                  { label: "Industry", value: titleise(inq.customer.industry) },
                  { label: "City", value: `${inq.customer.city ?? "—"}${inq.customer.state ? `, ${inq.customer.state}` : ""}` },
                  { label: "Came in via", value: inq.source ?? "—" },
                  { label: "Received on", value: dateTime(inq.receivedOn) },
                  { label: "Required by", value: date(inq.requiredBy) },
                  { label: "Owner", value: inq.owner?.name ?? "—" },
                ]}
              />
            </Section>

            <Section title="Matched compound">
              {inq.project ? (
                <FieldGrid
                  columns={1}
                  fields={[
                    {
                      label: "Project",
                      value: <Link href={`/projects/${inq.project.id}`} className="ref-link">{inq.project.name}</Link>,
                    },
                    { label: "Application", value: inq.project.application },
                    { label: "Stage", value: titleise(inq.project.stage) },
                    {
                      label: "Target price",
                      value: inq.project.targetPricePerKg
                        ? <span className="font-num">₹{Number(inq.project.targetPricePerKg).toFixed(2)}/kg</span>
                        : "—",
                    },
                    ...(canSeeMargin && sheet
                      ? [
                          {
                            label: "Latest cost sheet",
                            value: (
                              <span className="flex items-center gap-1.5">
                                <Link href={`/sales/cost-sheets/${sheet.id}`} className="ref-link font-num">{sheet.code}</Link>
                                <Chip tone={costSheetTone(sheet.status)}>{titleise(sheet.status)}</Chip>
                              </span>
                            ),
                          },
                          {
                            label: "Sheet rate",
                            value: <span className="font-num">₹{Number(sheet.sellingRatePerKg).toFixed(2)}/kg</span>,
                          },
                          {
                            label: "Sheet margin",
                            value: <Chip tone={marginTone(Number(sheet.marginPct))}>{Number(sheet.marginPct).toFixed(1)}%</Chip>,
                          },
                        ]
                      : []),
                  ]}
                />
              ) : (
                <p className="text-[12px] leading-relaxed text-muted">
                  Not matched to a compound yet. A genuinely new requirement needs a project raising for it
                  before it can be costed.
                </p>
              )}
            </Section>

            {inq.remark && (
              <Section title="Remark">
                <p className="text-[12px] leading-relaxed text-ink">{inq.remark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
