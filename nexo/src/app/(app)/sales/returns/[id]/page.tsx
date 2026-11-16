import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { kg, money, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Tr, Td } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, salesReturnTone } from "@/components/ui/chip";
import { IconCheck } from "@/components/icons";
import { ReturnQcPanel } from "./return-qc-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await prisma.salesReturn.findUnique({ where: { id }, select: { code: true } });
  return { title: r?.code ?? "Sales return" };
}

export const dynamic = "force-dynamic";

export default async function ReturnDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("sreturn:read");
  const { id } = await params;

  const srn = await prisma.salesReturn.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, city: true } },
      salesOrder: {
        select: {
          id: true, code: true, customerPoNo: true,
          quotation: { select: { id: true, code: true, costSheet: { select: { id: true, code: true } } } },
          challans: { select: { id: true, code: true, dispatchedOn: true } },
          invoices: { select: { id: true, code: true } },
        },
      },
      resendOrder: { select: { id: true, code: true } },
      receivedBy: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { project: { select: { id: true, code: true, name: true, application: true } } },
      },
      creditNotes: {
        orderBy: { date: "desc" },
        include: {
          salesInvoice: { select: { id: true, code: true } },
        },
      },
    },
  });

  if (!srn) notFound();

  const returnPostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: srn.id },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ side: "asc" }, { postedAt: "asc" }],
  });

  const debitTotal = returnPostings
    .filter((p) => p.side === "DEBIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const creditTotal = returnPostings
    .filter((p) => p.side === "CREDIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const isBalanced = returnPostings.length > 0 && Math.abs(debitTotal - creditTotal) < 0.01;

  const back = srn.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const restocked = srn.lines.reduce((a, l) => a + Number(l.restockedKg), 0);
  const scrapped = srn.lines.reduce((a, l) => a + Number(l.scrappedKg), 0);
  const resend = srn.lines.reduce((a, l) => a + Number(l.resendKg || 0), 0);
  const so = srn.salesOrder;
  const inspected = srn.status !== "PENDING_QC" && srn.status !== "DRAFT";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/returns"
        backLabel="Sales returns"
        code={srn.code}
        title={srn.customer.name}
        status={<Chip tone={salesReturnTone(srn.status)}>{titleise(srn.status)}</Chip>}
        meta={[
          { label: "Returned", value: date(srn.returnedOn) },
          { label: "Their DC", value: srn.customerDcNo ?? "—" },
          { label: "Lines", value: String(srn.lines.length) },
          { label: "Came back", value: kg(back) },
          { label: "Back to stock", value: restocked > 0 ? <span className="text-success-text">{kg(restocked)}</span> : "—" },
          { label: "Scrapped", value: scrapped > 0 ? <span className="text-danger-text">{kg(scrapped)}</span> : "—" },
          { label: "Resend Qty", value: resend > 0 ? <span className="text-primary-text">{kg(resend)}</span> : "—" },
        ]}
      />

      <DocChain
        chain="sales"
        current="sreturn"
        links={{
          ...(so.quotation?.costSheet && {
            costsheet: { code: so.quotation.costSheet.code, href: `/sales/cost-sheets/${so.quotation.costSheet.id}` },
          }),
          ...(so.quotation && { squotation: { code: so.quotation.code, href: `/sales/quotations/${so.quotation.id}` } }),
          sorder: { code: so.code, href: `/sales/orders/${so.id}` },
          ...(so.challans[0] && { dispatch: { code: so.challans[0].code, href: `/sales/dispatch/${so.challans[0].id}` } }),
          ...(so.invoices[0] && { invoice: { code: so.invoices[0].code, href: `/sales/invoices/${so.invoices[0].id}` } }),
          sreturn: { code: srn.code, href: `/sales/returns/${srn.id}` },
        }}
      />

      <RecordBody
        main={
          <>
            <ReturnQcPanel
              returnId={srn.id}
              status={srn.status}
              canInspect={can(user.role, "sreturn:qc")}
              defaultRemark={srn.qcRemark ?? ""}
              lines={srn.lines.map((l) => ({
                id: l.id,
                lineNo: l.lineNo,
                projectId: l.project.id,
                projectName: l.project.name,
                projectCode: l.project.code,
                application: l.project.application,
                returnedKg: Number(l.quantityKg),
                restockedKg: Number(l.restockedKg),
                scrappedKg: Number(l.scrappedKg),
                resendKg: Number(l.resendKg || 0),
                qcResult: l.qcResult,
                qcRemark: l.qcRemark ?? "",
              }))}
            />

            {inspected && (
              <Section
                title="AR reversal"
                hint={so.invoices[0] ? `Against invoice ${so.invoices[0].code}` : undefined}
                actions={
                  <div className="flex items-center gap-2 flex-wrap">
                    {srn.creditNotes.map((cn) => (
                      <Link
                        key={cn.id}
                        href={`/sales/credit-notes/${cn.id}`}
                        className="inline-flex items-center gap-1 rounded border border-edge bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-hover hover:border-edge-strong transition-colors"
                      >
                        Credit Note {cn.number} &rarr;
                      </Link>
                    ))}
                    {so.invoices[0] && (
                      <Link href={`/sales/invoices/${so.invoices[0].id}`} className="ref-link font-num text-[11.5px]">
                        Invoice {so.invoices[0].code}
                      </Link>
                    )}
                    {returnPostings.length > 0 && (
                      isBalanced ? (
                        <span className="inline-flex items-center gap-1 rounded bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success-text border border-success/30">
                          <IconCheck size={12} />
                          Balanced (DR = CR)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-danger-bg px-2 py-0.5 text-[11px] font-medium text-danger-text border border-danger/30">
                          Unbalanced
                        </span>
                      )
                    )}
                  </div>
                }
                padded={returnPostings.length === 0}
              >
                {returnPostings.length === 0 ? (
                  <p className="px-3 py-4 text-[12px] text-muted italic">
                    No AR reversal: the order was not invoiced when this return was settled
                  </p>
                ) : (
                  <>
                    <MiniTable
                      head={[
                        { label: "Account Code" },
                        { label: "Account Name" },
                        { label: "Side", width: "90px" },
                        { label: "Amount", align: "right" },
                        { label: "Remark" },
                      ]}
                      empty="No ledger postings found for this return."
                    >
                      {returnPostings.map((p) => (
                        <Tr key={p.id}>
                          <Td num>
                            <span className="font-semibold text-ink">{p.account.code}</span>
                          </Td>
                          <Td>{p.account.name}</Td>
                          <Td>
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                                p.side === "DEBIT"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {p.side}
                            </span>
                          </Td>
                          <Td align="right" num>
                            <span className="font-medium text-ink">{money(Number(p.amount))}</span>
                          </Td>
                          <Td muted className="text-[11.5px]">
                            {p.remark ?? "—"}
                          </Td>
                        </Tr>
                      ))}
                    </MiniTable>
                    <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5 text-[11.5px]">
                      <span className="text-muted">
                        Total Debits:{" "}
                        <span className="font-num font-medium text-ink">{money(debitTotal)}</span>
                        {" · "}
                        Total Credits:{" "}
                        <span className="font-num font-medium text-ink">{money(creditTotal)}</span>
                      </span>
                      {so.invoices[0] && (
                        <Link href={`/sales/invoices/${so.invoices[0].id}`} className="ref-link text-[11.5px]">
                          View invoice {so.invoices[0].code} →
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Return">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: <Link href={`/customers/${srn.customer.id}`} className="ref-link">{srn.customer.name}</Link>,
                  },
                  {
                    label: "Against order",
                    value: <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">{so.code}</Link>,
                  },
                  { label: "Their PO", value: so.customerPoNo ?? "—" },
                  { label: "Their DC number", value: srn.customerDcNo ?? "—" },
                  { label: "Returned on", value: dateTime(srn.returnedOn) },
                  { label: "Received by", value: srn.receivedBy?.name ?? "—" },
                  { label: "Inspected by", value: srn.inspectedBy?.name ?? "Not yet" },
                  { label: "Inspected on", value: srn.inspectedAt ? dateTime(srn.inspectedAt) : "—" },
                ]}
              />
            </Section>

            {srn.resolution && (
              <Section title="Resolution">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Decision", value: <Chip tone="info">{srn.resolution}</Chip> },
                    { label: "Details", value: srn.resolutionNote ?? "—" },
                    ...(srn.resolution === "REOPENED_ORDER"
                      ? [
                          {
                            label: "Reopened SO",
                            value: <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">{so.code}</Link>,
                          },
                        ]
                      : []),
                    ...(srn.resolution === "NEW_ORDER" && srn.resendOrder
                      ? [
                          {
                            label: "Replacement SO",
                            value: (
                              <Link href={`/sales/orders/${srn.resendOrder.id}`} className="ref-link font-num">
                                {srn.resendOrder.code}
                              </Link>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </Section>
            )}

            {srn.creditNotes.length > 0 && (
              <Section title="Credit notes">
                <div className="space-y-2">
                  {srn.creditNotes.map((cn) => (
                    <div
                      key={cn.id}
                      className="flex items-center justify-between text-xs border-b border-edge/60 pb-1.5 last:border-0 last:pb-0"
                    >
                      <div>
                        <Link href={`/sales/credit-notes/${cn.id}`} className="ref-link font-num font-semibold">
                          {cn.number}
                        </Link>
                        <div className="text-[11px] text-muted">
                          Invoice{" "}
                          <Link href={`/sales/invoices/${cn.salesInvoice.id}`} className="ref-link">
                            {cn.salesInvoice.code}
                          </Link>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-num font-medium text-ink">{money(Number(cn.totalValue))}</div>
                        <Chip tone={cn.status === "ISSUED" ? "success" : "danger"}>{titleise(cn.status)}</Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {srn.reason && (
              <Section title="Why it came back">
                <p className="text-[12px] leading-relaxed text-ink">{srn.reason}</p>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  The customer&apos;s stated reason. What the inspection actually found is on the lines.
                </p>
              </Section>
            )}

            {inspected && (
              <Section title="Outcome">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Came back", value: <span className="font-num">{kg(back)}</span> },
                    { label: "Back to stock", value: <span className="font-num text-success-text">{kg(restocked)}</span> },
                    { label: "Scrapped", value: <span className="font-num text-danger-text">{kg(scrapped)}</span> },
                    { label: "Resend Qty", value: <span className="font-num text-primary-text">{kg(resend)}</span> },
                    {
                      label: "Recovered",
                      value: (
                        <span className={`font-num font-semibold ${back > 0 && restocked / back >= 0.5 ? "text-success-text" : "text-danger-text"}`}>
                          {back > 0 ? ((restocked / back) * 100).toFixed(0) : 0}%
                        </span>
                      ),
                    },
                  ]}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Restocked quantity re-enters as its own batch, marked as a return. Material that has been to
                  a customer and back does not get merged into an original lot.
                </p>
              </Section>
            )}

            {srn.qcRemark && (
              <Section title="Inspection remark">
                <p className="text-[12px] leading-relaxed text-ink">{srn.qcRemark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}

