import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { money, date, dateTime, titleise, amount, kg, kgPlain } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip } from "@/components/ui/chip";
import { IconCheck } from "@/components/icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    select: { code: true },
  });
  return { title: bill?.code ?? "Vendor bill" };
}

export const dynamic = "force-dynamic";

export default async function VendorBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("invoice:read");
  const { id } = await params;

  const bill = await prisma.vendorBill.findUnique({
    where: { id },
    include: {
      vendor: {
        select: {
          id: true,
          code: true,
          name: true,
          legalName: true,
          gstin: true,
          pan: true,
          contactName: true,
          contactPhone: true,
          contactEmail: true,
          city: true,
          state: true,
          addressLine1: true,
          pincode: true,
          paymentTerms: true,
          creditDays: true,
        },
      },
      purchaseOrder: {
        select: {
          id: true,
          code: true,
          orderedOn: true,
          totalValue: true,
          requisition: { select: { id: true, code: true } },
          quotation: { select: { code: true, inquiry: { select: { id: true, code: true } } } },
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              material: { select: { id: true, code: true, name: true, grade: true } },
            },
          },
        },
      },
      goodsReceipt: {
        select: {
          id: true,
          code: true,
          receivedOn: true,
          invoiceNo: true,
          vehicleNo: true,
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              purchaseOrderLine: {
                include: {
                  material: { select: { id: true, code: true, name: true, grade: true } },
                },
              },
              batch: { select: { id: true, batchNo: true } },
              rejectedBatch: { select: { id: true, batchNo: true } },
            },
          },
        },
      },
      createdBy: { select: { name: true } },
      debitNotes: {
        orderBy: { date: "desc" },
        include: {
          goodsReceipt: { select: { id: true, code: true } },
          lines: {
            include: {
              material: { select: { id: true, code: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!bill) {
    notFound();
  }

  // 1. Bill's own ledger postings
  const billPostings = await prisma.ledgerPosting.findMany({
    where: {
      OR: [
        { vendorBillId: bill.id, sourceType: "VENDOR_BILL" },
        { sourceId: bill.id, sourceType: "VENDOR_BILL" },
      ],
    },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ side: "asc" }, { postedAt: "asc" }],
  });

  // 2. Debit postings under the bill's postings
  const debitPostings = await prisma.ledgerPosting.findMany({
    where: {
      OR: [
        { vendorBillId: bill.id, sourceType: "DEBIT_NOTE" },
        { sourceId: bill.id, sourceType: "DEBIT_NOTE" },
      ],
    },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ side: "asc" }, { postedAt: "asc" }],
  });

  // 3. Payment postings
  const paymentPostings = await prisma.ledgerPosting.findMany({
    where: {
      OR: [
        { vendorBillId: bill.id, sourceType: "PAYMENT" },
        { sourceId: bill.id, sourceType: "PAYMENT" },
      ],
    },
    include: {
      account: { select: { code: true, name: true, type: true } },
    },
    orderBy: [{ postedAt: "asc" }],
  });

  const subtotal = Number(bill.subtotal);
  const taxAmount = Number(bill.taxAmount);
  const totalValue = Number(bill.totalValue);
  const paidAmount = Number(bill.paidAmount);
  const debitedAmount = Number(bill.debitedAmount ?? 0);
  const balanceDue = Math.max(0, totalValue - paidAmount - debitedAmount);

  const debitTotal = billPostings
    .filter((p) => p.side === "DEBIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const creditTotal = billPostings
    .filter((p) => p.side === "CREDIT")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 0.01;

  const billStatusTone = (status: string) => {
    switch (status) {
      case "APPROVED":
      case "PAID":
        return "success";
      case "PENDING_APPROVAL":
      case "PARTIALLY_PAID":
        return "warning";
      case "VOID":
      case "CANCELLED":
        return "danger";
      default:
        return "neutral";
    }
  };

  const grn = bill.goodsReceipt;
  const po = bill.purchaseOrder;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/finance/payable"
        backLabel="Accounts payable"
        code={bill.code}
        title={bill.vendor.name}
        status={<Chip tone={billStatusTone(bill.status)}>{titleise(bill.status)}</Chip>}
        actions={
          <div className="flex items-center gap-2">
            {bill.debitNotes.length > 0 && (
              <Link
                href={`/purchase/debit-notes/${bill.debitNotes[0].id}`}
                className="flex items-center gap-1.5 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
              >
                Debit note <span className="font-num text-primary">{bill.debitNotes[0].number}</span>
              </Link>
            )}
            <Link
              href="/finance/payable"
              className="rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:bg-faint transition-colors"
            >
              Payable grid &rarr;
            </Link>
          </div>
        }
        meta={[
          { label: "Bill date", value: date(bill.billDate) },
          { label: "Due on", value: bill.dueOn ? date(bill.dueOn) : "—" },
          { label: "Ref / Invoice", value: <span className="font-num">{bill.billNo ?? "—"}</span> },
          { label: "Basis", value: titleise(bill.basis) },
          ...(po
            ? [
                {
                  label: "Purchase order",
                  value: (
                    <Link href={`/procurement/orders/${po.id}`} className="ref-link font-num">
                      {po.code}
                    </Link>
                  ),
                },
              ]
            : []),
          ...(grn
            ? [
                {
                  label: "Goods receipt",
                  value: (
                    <Link href={`/procurement/grn/${grn.id}`} className="ref-link font-num">
                      {grn.code}
                    </Link>
                  ),
                },
              ]
            : []),
          { label: "Total value", value: <span className="font-num font-semibold text-ink">{money(totalValue)}</span> },
        ]}
      />

      <RecordBody
        main={
          <>
            {/* 1. GRN Lines or PO Lines */}
            {grn && grn.lines.length > 0 ? (
              <Section
                title="Goods receipt lines"
                hint={`${grn.lines.length} ${grn.lines.length === 1 ? "line" : "lines"} · against ${grn.code}`}
                padded={false}
              >
                <MiniTable
                  head={[
                    { label: "#" },
                    { label: "Material" },
                    { label: "Challan kg", align: "right" },
                    { label: "Weighed kg", align: "right" },
                    { label: "Accepted kg", align: "right" },
                    { label: "Rejected kg", align: "right" },
                    { label: "Rate (₹/kg)", align: "right" },
                    { label: "Line Total", align: "right" },
                  ]}
                  empty="No goods receipt lines found for this bill."
                >
                  {grn.lines.map((l) => {
                    const rate = Number(l.purchaseOrderLine.ratePerKg);
                    const acceptedQ = Number(l.acceptedQtyKg);
                    const rejectedQ = Number(l.rejectedQtyKg);
                    const lineVal = acceptedQ * rate;
                    return (
                      <Tr key={l.id}>
                        <Td num muted>
                          {l.lineNo}
                        </Td>
                        <Td>
                          <Link href={`/procurement/materials/${l.purchaseOrderLine.material.id}`} className="ref-link">
                            {l.purchaseOrderLine.material.name}
                          </Link>
                          <span className="block text-[11px] text-muted">
                            {l.purchaseOrderLine.material.code}
                            {l.purchaseOrderLine.material.grade ? ` · ${l.purchaseOrderLine.material.grade}` : ""}
                          </span>
                        </Td>
                        <Td align="right" num muted>
                          {kgPlain(Number(l.challanQtyKg))}
                        </Td>
                        <Td align="right" num>
                          {kgPlain(Number(l.receivedQtyKg))}
                        </Td>
                        <Td align="right" num className="text-success-text font-medium">
                          {kgPlain(acceptedQ)}
                        </Td>
                        <Td align="right" num>
                          {rejectedQ > 0 ? (
                            <span className="font-medium text-danger-text">{kgPlain(rejectedQ)}</span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </Td>
                        <Td align="right" num muted>
                          {money(rate, 2)}
                        </Td>
                        <Td align="right" num>
                          {money(lineVal, 2)}
                        </Td>
                      </Tr>
                    );
                  })}
                </MiniTable>
              </Section>
            ) : po && po.lines.length > 0 ? (
              <Section
                title="Purchase order lines"
                hint={`${po.lines.length} ${po.lines.length === 1 ? "line" : "lines"} · against ${po.code}`}
                padded={false}
              >
                <MiniTable
                  head={[
                    { label: "#" },
                    { label: "Material" },
                    { label: "Ordered kg", align: "right" },
                    { label: "Received kg", align: "right" },
                    { label: "Rate (₹/kg)", align: "right" },
                    { label: "Tax %", align: "right" },
                    { label: "Line Total", align: "right" },
                  ]}
                  empty="No order lines found for this bill."
                >
                  {po.lines.map((l) => (
                    <Tr key={l.id}>
                      <Td num muted>
                        {l.lineNo}
                      </Td>
                      <Td>
                        <Link href={`/procurement/materials/${l.material.id}`} className="ref-link">
                          {l.material.name}
                        </Link>
                        <span className="block text-[11px] text-muted">
                          {l.material.code}
                          {l.material.grade ? ` · ${l.material.grade}` : ""}
                        </span>
                      </Td>
                      <Td align="right" num>
                        {kgPlain(Number(l.quantityKg))}
                      </Td>
                      <Td align="right" num muted>
                        {kgPlain(Number(l.receivedKg))}
                      </Td>
                      <Td align="right" num muted>
                        {money(Number(l.ratePerKg), 2)}
                      </Td>
                      <Td align="right" num muted>
                        {Number(l.taxPct)}%
                      </Td>
                      <Td align="right" num>
                        {money(Number(l.lineTotal), 2)}
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            ) : null}

            {/* 2. Bill Totals */}
            <Section title="Stored bill totals">
              <div className="flex justify-end">
                <div className="w-full max-w-sm space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
                    <span className="text-muted">Subtotal (Pre-tax purchases)</span>
                    <span className="font-num font-medium tabular-nums text-ink">{money(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-edge/60 pb-1.5">
                    <span className="text-muted">Tax Amount (GST)</span>
                    <span className="font-num font-medium tabular-nums text-ink">{money(taxAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[13.5px] font-bold">
                    <span className="text-ink">Total Bill Value</span>
                    <span className="font-num text-primary tabular-nums">{money(totalValue)}</span>
                  </div>
                </div>
              </div>
            </Section>

            {/* 3. Ledger Postings & Debit Postings */}
            <Section
              title="Ledger postings"
              hint={`Source ID: ${bill.id}`}
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
                empty="No ledger postings found for this bill."
              >
                {billPostings.map((p) => (
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

              {/* Debit Postings Under the Bill's Postings */}
              <div className="border-t border-edge bg-surface">
                <div className="bg-faint/80 px-3 py-1.5 text-[11px] font-semibold text-muted border-b border-edge/60 flex items-center justify-between">
                  <span>Debit postings (reversals from debit notes) ({debitPostings.length})</span>
                  <span className="font-num text-[10.5px]">Source: DEBIT_NOTE</span>
                </div>
                {debitPostings.length === 0 ? (
                  <p className="px-3 py-3 text-[11.5px] text-muted italic">
                    No debit note postings recorded against this bill.
                  </p>
                ) : (
                  <table className="w-full text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-edge/60 bg-faint/40 text-[10.5px] font-medium text-muted">
                        <th className="px-3 py-1.5">Account Code</th>
                        <th className="px-3 py-1.5">Account Name</th>
                        <th className="px-3 py-1.5 w-20">Side</th>
                        <th className="px-3 py-1.5 text-right">Amount</th>
                        <th className="px-3 py-1.5">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-edge/40">
                      {debitPostings.map((p) => (
                        <tr key={p.id} className="hover:bg-faint/50">
                          <td className="px-3 py-1.5 font-num font-semibold text-ink">{p.account.code}</td>
                          <td className="px-3 py-1.5 text-ink">{p.account.name}</td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                p.side === "DEBIT"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {p.side}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right font-num font-medium text-ink">
                            {money(Number(p.amount))}
                          </td>
                          <td className="px-3 py-1.5 text-muted text-[10.5px] truncate max-w-sm">
                            {p.remark ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Section>

            {/* 4. Debit Notes Section */}
            <Section
              title="Debit notes"
              hint={`${bill.debitNotes.length} ${
                bill.debitNotes.length === 1 ? "debit note" : "debit notes"
              }${
                bill.debitNotes.length > 0
                  ? ` · Total debited: ${money(
                      bill.debitNotes.reduce((sum, d) => sum + Number(d.totalValue), 0)
                    )}`
                  : ""
              }`}
              padded={false}
            >
              {bill.debitNotes.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-muted">
                  No debit notes issued for this bill.
                </p>
              ) : (
                <MiniTable
                  head={[
                    { label: "Number" },
                    { label: "Date" },
                    { label: "Against GRN" },
                    { label: "Reason" },
                    { label: "Status", width: "90px" },
                    { label: "Amount", align: "right" },
                  ]}
                  empty="No debit notes."
                >
                  {bill.debitNotes.map((dn) => (
                    <Tr key={dn.id}>
                      <Td>
                        <Link
                          href={`/purchase/debit-notes/${dn.id}`}
                          className="ref-link font-num font-semibold"
                        >
                          {dn.number}
                        </Link>
                      </Td>
                      <Td muted className="text-[11.5px] font-num">
                        {date(dn.date)}
                      </Td>
                      <Td>
                        {dn.goodsReceipt ? (
                          <Link
                            href={`/procurement/grn/${dn.goodsReceipt.id}`}
                            className="ref-link font-num text-[11.5px]"
                          >
                            {dn.goodsReceipt.code}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </Td>
                      <Td muted className="text-[11.5px] truncate max-w-xs">
                        {dn.reason || "Debit note for rejected goods"}
                      </Td>
                      <Td>
                        <Chip tone={dn.status === "ISSUED" ? "success" : "danger"}>
                          {titleise(dn.status)}
                        </Chip>
                      </Td>
                      <Td align="right" num>
                        <span className="font-medium text-ink">
                          {money(Number(dn.totalValue))}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              )}
            </Section>

            {/* 5. Payments & Payment Summary */}
            <Section
              title="Payments"
              hint={`Paid: ${money(paidAmount)}${debitedAmount > 0 ? ` · Debited: ${money(debitedAmount)}` : ""} · Balance: ${money(balanceDue)}`}
              actions={
                <Link
                  href="/finance/payable"
                  className="inline-flex items-center gap-1 rounded border border-edge bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-hover hover:border-edge-strong transition-colors"
                >
                  Apply payment in Accounts Payable &rarr;
                </Link>
              }
              padded={false}
            >
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-edge bg-faint/50 p-3 text-xs">
                <div>
                  <div className="text-[11px] text-muted">Bill Total</div>
                  <div className="font-num font-semibold text-ink text-sm mt-0.5">{money(totalValue)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Paid Amount</div>
                  <div className="font-num font-semibold text-success-text text-sm mt-0.5">{money(paidAmount)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Debited (Debit notes)</div>
                  <div className="font-num font-semibold text-amber-700 text-sm mt-0.5">
                    {debitedAmount > 0 ? `-${money(debitedAmount)}` : "₹0.00"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Balance Due</div>
                  <div className={`font-num font-semibold text-sm mt-0.5 ${balanceDue > 0 ? "text-danger-text" : "text-muted"}`}>
                    {money(balanceDue)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">Status</div>
                  <div className="mt-0.5">
                    <Chip tone={billStatusTone(bill.status)}>{titleise(bill.status)}</Chip>
                  </div>
                </div>
              </div>

              {paymentPostings.length > 0 ? (
                <MiniTable
                  head={[
                    { label: "Account Code" },
                    { label: "Account Name" },
                    { label: "Side", width: "90px" },
                    { label: "Amount", align: "right" },
                    { label: "Date" },
                    { label: "Remark" },
                  ]}
                  empty="No payment postings."
                >
                  {paymentPostings.map((p) => (
                    <Tr key={p.id}>
                      <Td num>{p.account.code}</Td>
                      <Td>{p.account.name}</Td>
                      <Td>
                        <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {p.side}
                        </span>
                      </Td>
                      <Td align="right" num>
                        <span className="font-medium text-ink">{money(Number(p.amount))}</span>
                      </Td>
                      <Td muted className="text-[11.5px] font-num">
                        {date(p.postedAt)}
                      </Td>
                      <Td muted className="text-[11.5px] truncate max-w-xs">
                        {p.remark ?? "—"}
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              ) : (
                <p className="px-3 py-4 text-center text-[12px] text-muted">
                  No payment disbursements recorded for this bill.
                </p>
              )}
            </Section>
          </>
        }
        aside={
          <>
            <Section title="Vendor commercial">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Vendor",
                    value: (
                      <Link href={`/procurement/vendors/${bill.vendor.id}`} className="ref-link">
                        {bill.vendor.name}
                      </Link>
                    ),
                  },
                  { label: "Vendor code", value: <span className="font-num">{bill.vendor.code}</span> },
                  { label: "GSTIN", value: <span className="font-num">{bill.vendor.gstin ?? "—"}</span> },
                  { label: "PAN", value: <span className="font-num">{bill.vendor.pan ?? "—"}</span> },
                  { label: "Payment terms", value: bill.vendor.paymentTerms ?? "—" },
                  { label: "Credit days", value: `${bill.vendor.creditDays} days` },
                  { label: "Contact", value: bill.vendor.contactName ?? "—" },
                  { label: "Phone", value: <span className="font-num">{bill.vendor.contactPhone ?? "—"}</span> },
                ]}
              />
            </Section>

            <Section title="Bill metadata">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Bill code", value: <span className="font-num">{bill.code}</span> },
                  { label: "Invoice ref", value: <span className="font-num">{bill.billNo ?? "—"}</span> },
                  { label: "Registered on", value: dateTime(bill.createdAt) },
                  { label: "Registered by", value: bill.createdBy?.name ?? "—" },
                  { label: "Basis", value: titleise(bill.basis) },
                  { label: "Remark", value: bill.remark ?? "—" },
                ]}
              />
            </Section>
          </>
        }
      />
    </div>
  );
}

