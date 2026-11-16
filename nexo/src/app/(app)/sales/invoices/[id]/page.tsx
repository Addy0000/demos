import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, invoiceTone, salesReturnTone } from "@/components/ui/chip";
import { IconCheck } from "@/components/icons";
import { isInvoiceOverdue, getInvoiceOverdueInfo } from "@/lib/invoice-overdue";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const inv = await prisma.salesInvoice.findUnique({ where: { id }, select: { code: true } });
  return { title: inv?.code ?? "Sales invoice" };
}

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("invoice:read");
  const { id } = await params;

  const invoice = await prisma.salesInvoice.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          code: true,
          name: true,
          city: true,
          state: true,
          addressLine1: true,
          addressLine2: true,
          pincode: true,
          gstin: true,
          creditDays: true,
          creditLimit: true,
          outstandingAmt: true,
        },
      },
      salesOrder: {
        select: {
          id: true,
          code: true,
          customerPoNo: true,
          customerPoDate: true,
          paymentTerms: true,
          deliveryTerms: true,
          quotation: {
            select: {
              id: true,
              code: true,
              costSheet: { select: { id: true, code: true } },
              inquiry: { select: { id: true, code: true } },
            },
          },
          returns: {
            orderBy: { returnedOn: "desc" },
            include: {
              receivedBy: { select: { name: true } },
              inspectedBy: { select: { name: true } },
              lines: {
                orderBy: { lineNo: "asc" },
                include: {
                  project: { select: { id: true, code: true, name: true, application: true } },
                },
              },
            },
          },
        },
      },
      challan: {
        select: {
          id: true,
          code: true,
          dispatchedOn: true,
          packedOn: true,
          vehicleNo: true,
          driverName: true,
          lrNo: true,
          eWayBillNo: true,
          packageCnt: true,
          grossKg: true,
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              batch: { select: { id: true, batchNo: true, lotRef: true, warehouse: { select: { name: true } } } },
              salesOrderLine: {
                select: {
                  id: true,
                  taxPct: true,
                  project: { select: { id: true, code: true, name: true, application: true } },
                },
              },
            },
          },
        },
      },
      raisedBy: { select: { name: true } },
      creditNotes: {
        orderBy: { date: "desc" },
        include: {
          salesReturn: { select: { id: true, code: true } },
        },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const invoicePostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: "SALES_INVOICE" },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ side: "asc" }, { postedAt: "asc" }],
  });

  const paymentPostings = await prisma.ledgerPosting.findMany({
    where: { sourceId: invoice.id, sourceType: "PAYMENT" },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ postedAt: "asc" }],
  });

  const orderReturns = invoice.salesOrder.returns;
  const returnIds = orderReturns.map((r) => r.id);

  const returnPostings =
    returnIds.length > 0
      ? await prisma.ledgerPosting.findMany({
          where: { sourceId: { in: returnIds } },
          include: {
            account: { select: { code: true, name: true, type: true } },
          },
          orderBy: [{ postedAt: "asc" }],
        })
      : [];

  const returnPostingsByReturnId = new Map<string, typeof returnPostings>();
  for (const p of returnPostings) {
    const list = returnPostingsByReturnId.get(p.sourceId) ?? [];
    list.push(p);
    returnPostingsByReturnId.set(p.sourceId, list);
  }

  const challanLines = invoice.challan?.lines ?? [];
  const so = invoice.salesOrder;
  const dc = invoice.challan;

  const returnLines = orderReturns.flatMap((r) => r.lines);
  const getReturnedKgForLine = (salesOrderLineId: string) => {
    const matching = returnLines.filter((rl) => rl.salesOrderLineId === salesOrderLineId);
    return matching.reduce((sum, rl) => {
      const inspected = Number(rl.restockedKg) + Number(rl.scrappedKg);
      return sum + (inspected > 0 ? inspected : Number(rl.quantityKg));
    }, 0);
  };

  const linesData = challanLines.map((l) => {
    const qtyKg = Number(l.quantityKg);
    const rate = Number(l.ratePerKg);
    const taxPct = Number(l.salesOrderLine.taxPct);
    const lineAmount = qtyKg * rate;
    const lineTax = Math.round(((lineAmount * taxPct) / 100 + Number.EPSILON) * 100) / 100;
    const returnedKg = getReturnedKgForLine(l.salesOrderLineId);

    return {
      id: l.id,
      lineNo: l.lineNo,
      project: l.salesOrderLine.project,
      batch: l.batch,
      qtyKg,
      returnedKg,
      rate,
      taxPct,
      lineAmount,
      lineTax,
    };
  });

  const totalKg = linesData.reduce((acc, l) => acc + l.qtyKg, 0);
  const totalReturnedKg = linesData.reduce((acc, l) => acc + l.returnedKg, 0);

  const subtotal = Number(invoice.subtotal);
  const taxAmount = Number(invoice.taxAmount);
  const totalValue = Number(invoice.totalValue);
  const paidAmount = Number(invoice.paidAmount);
  const creditedAmount = Number(invoice.creditedAmount);
  const balance = Math.max(0, totalValue - paidAmount - creditedAmount);

  const isOverdue = isInvoiceOverdue(invoice);
  const { daysOverdue } = getInvoiceOverdueInfo(invoice);

  const debitTotal = invoicePostings
    .filter((p) => p.side === "DEBIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const creditTotal = invoicePostings
    .filter((p) => p.side === "CREDIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const isBalanced = invoicePostings.length > 0 && Math.abs(debitTotal - creditTotal) < 0.01;

  const effectiveStatus = isOverdue ? "OVERDUE" : invoice.status;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/invoices"
        backLabel="Sales invoices"
        code={invoice.code}
        title={invoice.customer.name}
        status={<Chip tone={invoiceTone(effectiveStatus)}>{titleise(effectiveStatus)}</Chip>}
        meta={[
          { label: "Invoice Date", value: date(invoice.invoiceDate) },
          {
            label: "Due Date",
            value: invoice.dueOn ? (
              <span>
                {date(invoice.dueOn)}
                {isOverdue && (
                  <span className="ml-1.5 font-medium text-danger-text text-xs">
                    (Overdue by {daysOverdue} {daysOverdue === 1 ? "day" : "days"})
                  </span>
                )}
              </span>
            ) : (
              "—"
            ),
          },
          {
            label: "Sales Order",
            value: (
              <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">
                {so.code}
              </Link>
            ),
          },
          ...(dc
            ? [
                {
                  label: "Challan",
                  value: (
                    <Link href={`/sales/dispatch/${dc.id}`} className="ref-link font-num">
                      {dc.code}
                    </Link>
                  ),
                },
              ]
            : []),
          { label: "Lines", value: String(linesData.length) },
          { label: "Quantity", value: kg(totalKg) },
          { label: "Total Value", value: <span className="font-num font-semibold text-ink">{money(totalValue)}</span> },
        ]}
      />

      <DocChain
        chain="sales"
        current="invoice"
        links={{
          ...(so.quotation?.inquiry && {
            sinquiry: { code: so.quotation.inquiry.code, href: `/sales/inquiries/${so.quotation.inquiry.id}` },
          }),
          ...(so.quotation?.costSheet && {
            costsheet: { code: so.quotation.costSheet.code, href: `/sales/cost-sheets/${so.quotation.costSheet.id}` },
          }),
          ...(so.quotation && {
            squotation: { code: so.quotation.code, href: `/sales/quotations/${so.quotation.id}` },
          }),
          sorder: { code: so.code, href: `/sales/orders/${so.id}` },
          ...(dc && { dispatch: { code: dc.code, href: `/sales/dispatch/${dc.id}` } }),
          invoice: { code: invoice.code, href: `/sales/invoices/${invoice.id}` },
          ...(orderReturns[0] && {
            sreturn: { code: orderReturns[0].code, href: `/sales/returns/${orderReturns[0].id}` },
          }),
        }}
      />

      <RecordBody
        main={
          <>
            {/* 2. Challan Lines */}
            <Section
              title="Challan lines"
              hint={`${linesData.length} ${linesData.length === 1 ? "line" : "lines"} · billed against despatch`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" },
                  { label: "Item / Compound" },
                  { label: "Batch" },
                  { label: "Dispatched kg", align: "right" },
                  { label: "Returned kg", align: "right" },
                  { label: "Rate (₹/kg)", align: "right" },
                  { label: "Tax %", align: "right" },
                  { label: "Line Amount", align: "right" },
                  { label: "Line Tax", align: "right" },
                ]}
                empty="No challan lines found for this invoice."
              >
                {linesData.map((l) => (
                  <Tr key={l.id}>
                    <Td num muted>
                      {l.lineNo}
                    </Td>
                    <Td>
                      <Link href={`/projects/${l.project.id}`} className="ref-link">
                        {l.project.name}
                      </Link>
                      <span className="block text-[11px] text-muted">
                        {l.project.code} · {l.project.application}
                      </span>
                    </Td>
                    <Td>
                      {l.batch ? (
                        <>
                          <Link
                            href={`/procurement/inventory/${l.batch.id}`}
                            className="ref-link font-num text-[11.5px]"
                          >
                            {l.batch.batchNo}
                          </Link>
                          {l.batch.lotRef && (
                            <span className="block font-num text-[10.5px] text-muted">{l.batch.lotRef}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td align="right" num>
                      {kgPlain(l.qtyKg)}
                    </Td>
                    <Td align="right" num>
                      {l.returnedKg > 0 ? (
                        <span className="font-medium text-danger-text">{kgPlain(l.returnedKg)}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </Td>
                    <Td align="right" num muted>
                      ₹{l.rate.toFixed(2)}
                    </Td>
                    <Td align="right" num muted>
                      {l.taxPct}%
                    </Td>
                    <Td align="right" num>
                      {amount(l.lineAmount)}
                    </Td>
                    <Td align="right" num muted>
                      {amount(l.lineTax)}
                    </Td>
                  </Tr>
                ))}
              </MiniTable>
              {linesData.length > 0 && (
                <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5 text-[11.5px]">
                  <span className="text-muted">
                    Total billed quantity: <span className="font-num font-medium text-ink">{kg(totalKg)}</span>
                    {totalReturnedKg > 0 && (
                      <>
                        {" · "}
                        Returned:{" "}
                        <span className="font-num font-medium text-danger-text">{kg(totalReturnedKg)}</span>
                      </>
                    )}
                  </span>
                  <span className="font-num font-semibold tabular-nums text-ink">
                    Line Total: {money(linesData.reduce((acc, l) => acc + l.lineAmount + l.lineTax, 0))}
                  </span>
                </div>
              )}
            </Section>

            {/* 3. Invoice Totals */}
            <Section title="Stored invoice totals">
              <div className="flex justify-end">
                <div className="w-full max-w-sm space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
                    <span className="text-muted">Subtotal (Net of returns at raise)</span>
                    <span className="font-num font-medium tabular-nums text-ink">{money(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
                    <span className="text-muted">Tax Amount (GST)</span>
                    <span className="font-num font-medium tabular-nums text-ink">{money(taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[13.5px] font-bold">
                    <span className="text-ink">Total Invoice Value</span>
                    <span className="font-num text-primary tabular-nums">{money(totalValue)}</span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 4. Ledger Postings */}
            <Section
              title="Ledger postings"
              hint={`Source ID: ${invoice.id}`}
              actions={
                <div className="flex items-center gap-1.5">
                  {isBalanced ? (
                    <span className="inline-flex items-center gap-1 rounded bg-success-bg px-2 py-0.5 text-[11px] font-medium text-success-text border border-success/30">
                      <IconCheck size={12} />
                      Balanced (DR = CR: {money(debitTotal)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-danger-bg px-2 py-0.5 text-[11px] font-medium text-danger-text border border-danger/30">
                      Unbalanced (DR {money(debitTotal)} ≠ CR {money(creditTotal)})
                    </span>
                  )}
                </div>
              }
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "Account Code" },
                  { label: "Account Name" },
                  { label: "Side", width: "90px" },
                  { label: "Amount", align: "right" },
                  { label: "Remark" },
                ]}
                empty="No ledger postings found for this invoice."
              >
                {invoicePostings.map((p) => (
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
              {invoicePostings.length > 0 && (
                <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5 text-[11.5px]">
                  <span className="text-muted">
                    Total Debits:{" "}
                    <span className="font-num font-medium text-ink">{money(debitTotal)}</span>
                    {" · "}
                    Total Credits:{" "}
                    <span className="font-num font-medium text-ink">{money(creditTotal)}</span>
                  </span>
                  <span className="text-[11px] text-muted">
                    {isBalanced ? "Double-entry verified" : "Check ledger configuration"}
                  </span>
                </div>
              )}
            </Section>

            {/* 5. Returns Against this Order */}
            <Section
              title="Returns against this order"
              hint={`${orderReturns.length} ${orderReturns.length === 1 ? "return" : "returns"} on ${so.code}`}
              padded={false}
            >
              {orderReturns.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-muted">
                  No returns recorded against sales order {so.code}.
                </p>
              ) : (
                <div className="divide-y divide-edge">
                  {orderReturns.map((r) => {
                    const retKg = r.lines.reduce((acc, l) => acc + Number(l.quantityKg), 0);
                    const restocked = r.lines.reduce((acc, l) => acc + Number(l.restockedKg), 0);
                    const scrapped = r.lines.reduce((acc, l) => acc + Number(l.scrappedKg), 0);
                    const postings = returnPostingsByReturnId.get(r.id) ?? [];

                    return (
                      <div key={r.id} className="p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <Link href={`/sales/returns/${r.id}`} className="ref-link font-num font-semibold text-[13px]">
                              {r.code}
                            </Link>
                            <Chip tone={salesReturnTone(r.status)}>{titleise(r.status)}</Chip>
                            <span className="text-[11.5px] text-muted">Returned on {date(r.returnedOn)}</span>
                          </div>
                          <div className="text-[12px] font-num">
                            <span className="text-muted">Total: </span>
                            <span className="font-medium text-ink">{kg(retKg)}</span>
                            {restocked > 0 && (
                              <>
                                {" · "}
                                <span className="text-success-text">{kg(restocked)} restocked</span>
                              </>
                            )}
                            {scrapped > 0 && (
                              <>
                                {" · "}
                                <span className="text-danger-text">{kg(scrapped)} scrapped</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Reversal Postings for this return */}
                        <div className="mt-2 rounded border border-edge/80 bg-surface overflow-hidden">
                          <div className="bg-faint/80 px-2.5 py-1 text-[11px] font-semibold text-muted border-b border-edge/60 flex items-center justify-between">
                            <span>Reversal postings ({postings.length})</span>
                            <span className="font-num text-[10.5px]">Source: {r.id}</span>
                          </div>
                          {postings.length === 0 ? (
                            <p className="px-3 py-2 text-[11.5px] text-muted italic">
                              No ledger reversal postings found for this return (credit note posted during QC inspection if invoiced).
                            </p>
                          ) : (
                            <table className="w-full text-left text-[11.5px]">
                              <thead>
                                <tr className="border-b border-edge/60 bg-faint/40 text-[10.5px] font-medium text-muted">
                                  <th className="px-2.5 py-1">Account</th>
                                  <th className="px-2.5 py-1">Name</th>
                                  <th className="px-2.5 py-1 w-20">Side</th>
                                  <th className="px-2.5 py-1 text-right">Amount</th>
                                  <th className="px-2.5 py-1">Remark</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-edge/40">
                                {postings.map((p) => (
                                  <tr key={p.id} className="hover:bg-faint/50">
                                    <td className="px-2.5 py-1 font-num font-medium text-ink">{p.account.code}</td>
                                    <td className="px-2.5 py-1 text-ink">{p.account.name}</td>
                                    <td className="px-2.5 py-1">
                                      <span
                                        className={`inline-block rounded px-1 py-0.2 text-[10px] font-bold ${
                                          p.side === "DEBIT"
                                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        }`}
                                      >
                                        {p.side}
                                      </span>
                                    </td>
                                    <td className="px-2.5 py-1 text-right font-num font-medium text-ink">
                                      {money(Number(p.amount))}
                                    </td>
                                    <td className="px-2.5 py-1 text-muted text-[10.5px] truncate max-w-xs">
                                      {p.remark ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* 6. Credit Notes */}
            <Section
              title="Credit notes"
              hint={`${invoice.creditNotes.length} ${
                invoice.creditNotes.length === 1 ? "credit note" : "credit notes"
              }${
                invoice.creditNotes.length > 0
                  ? ` · Total credited: ${money(
                      invoice.creditNotes.reduce((sum, c) => sum + Number(c.totalValue), 0)
                    )}`
                  : ""
              }`}
              padded={false}
            >
              {invoice.creditNotes.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-muted">
                  No credit notes issued for this invoice.
                </p>
              ) : (
                <MiniTable
                  head={[
                    { label: "Number" },
                    { label: "Date" },
                    { label: "Against Return" },
                    { label: "Reason" },
                    { label: "Status", width: "90px" },
                    { label: "Amount", align: "right" },
                  ]}
                  empty="No credit notes."
                >
                  {invoice.creditNotes.map((cn) => (
                    <Tr key={cn.id}>
                      <Td>
                        <Link
                          href={`/sales/credit-notes/${cn.id}`}
                          className="ref-link font-num font-semibold"
                        >
                          {cn.number}
                        </Link>
                      </Td>
                      <Td muted className="text-[11.5px] font-num">
                        {date(cn.date)}
                      </Td>
                      <Td>
                        <Link
                          href={`/sales/returns/${cn.salesReturn.id}`}
                          className="ref-link font-num text-[11.5px]"
                        >
                          {cn.salesReturn.code}
                        </Link>
                      </Td>
                      <Td muted className="text-[11.5px] truncate max-w-xs">
                        {cn.reason || "Sales Return Credit"}
                      </Td>
                      <Td>
                        <Chip tone={cn.status === "ISSUED" ? "success" : "danger"}>
                          {titleise(cn.status)}
                        </Chip>
                      </Td>
                      <Td align="right" num>
                        <span className="font-medium text-ink">
                          {money(Number(cn.totalValue))}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              )}
            </Section>

            {/* 7. Payments */}
            <Section
              title="Payments"
              hint={`Paid: ${money(paidAmount)}${creditedAmount > 0 ? ` · Credited: ${money(creditedAmount)}` : ""} · Balance: ${money(balance)}`}
              actions={
                <Link
                  href="/finance/receivable"
                  className="inline-flex items-center gap-1 rounded border border-edge bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-hover hover:border-edge-strong transition-colors"
                >
                  Receive payment in Finance AR &rarr;
                </Link>
              }
              padded={false}
            >
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-edge bg-faint/50 p-3 text-xs">
                <div>
                  <div className="text-[11px] text-muted">Invoice Total</div>
                  <div className="font-num font-semibold text-ink text-sm mt-0.5">{money(totalValue)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Paid Amount</div>
                  <div className="font-num font-semibold text-success-text text-sm mt-0.5">{money(paidAmount)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Credited Amount</div>
                  <div className="font-num font-semibold text-warning-text text-sm mt-0.5">{money(creditedAmount)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Balance Due</div>
                  <div className={`font-num font-semibold text-sm mt-0.5 ${balance > 0 ? "text-danger-text" : "text-muted"}`}>
                    {money(balance)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Status</div>
                  <div className="mt-0.5">
                    <Chip tone={invoiceTone(effectiveStatus)}>{titleise(effectiveStatus)}</Chip>
                  </div>
                </div>
              </div>

              <MiniTable
                head={[
                  { label: "Date" },
                  { label: "Account" },
                  { label: "Side", width: "90px" },
                  { label: "Amount", align: "right" },
                  { label: "Remark" },
                ]}
                empty="No payments received yet."
              >
                {paymentPostings.map((p) => (
                  <Tr key={p.id}>
                    <Td muted className="text-[11.5px] font-num">
                      {dateTime(p.postedAt)}
                    </Td>
                    <Td>
                      <span className="font-semibold text-ink font-num">{p.account.code}</span>
                      <span className="text-muted ml-1.5 text-[11.5px]">{p.account.name}</span>
                    </Td>
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
            </Section>
          </>
        }
        aside={
          <>
            <Section title="Invoice summary">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/customers/${invoice.customer.id}`} className="ref-link">
                        {invoice.customer.name}
                      </Link>
                    ),
                  },
                  {
                    label: "Against order",
                    value: (
                      <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">
                        {so.code}
                      </Link>
                    ),
                  },
                  ...(dc
                    ? [
                        {
                          label: "Challan",
                          value: (
                            <Link href={`/sales/dispatch/${dc.id}`} className="ref-link font-num">
                              {dc.code}
                            </Link>
                          ),
                        },
                      ]
                    : []),
                  { label: "Customer PO", value: so.customerPoNo ?? "—" },
                  { label: "Invoice date", value: date(invoice.invoiceDate) },
                  {
                    label: "Due on",
                    value: invoice.dueOn ? (
                      <span>
                        {date(invoice.dueOn)}
                        {isOverdue && (
                          <span className="ml-1.5 font-medium text-danger-text text-xs">
                            (Overdue by {daysOverdue} {daysOverdue === 1 ? "day" : "days"})
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  { label: "Payment terms", value: so.paymentTerms ?? "—" },
                  { label: "Delivery terms", value: so.deliveryTerms ?? "—" },
                  { label: "Raised by", value: invoice.raisedBy?.name ?? "—" },
                  {
                    label: "Customer GSTIN",
                    value: invoice.customer.gstin ? (
                      <span className="font-num">{invoice.customer.gstin}</span>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </Section>

            {dc && (
              <Section title="Despatch & logistics">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Vehicle", value: dc.vehicleNo ? <span className="font-num">{dc.vehicleNo}</span> : "—" },
                    { label: "Driver", value: dc.driverName ?? "—" },
                    { label: "LR number", value: dc.lrNo ? <span className="font-num">{dc.lrNo}</span> : "—" },
                    { label: "E-way bill", value: dc.eWayBillNo ? <span className="font-num">{dc.eWayBillNo}</span> : "—" },
                    { label: "Packages", value: dc.packageCnt ? String(dc.packageCnt) : "—" },
                    { label: "Gross weight", value: dc.grossKg ? kg(Number(dc.grossKg)) : "—" },
                    { label: "Despatched on", value: dc.dispatchedOn ? dateTime(dc.dispatchedOn) : "—" },
                  ]}
                />
              </Section>
            )}

            {invoice.remark && (
              <Section title="Remark">
                <p className="text-[12px] leading-relaxed text-ink">{invoice.remark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
