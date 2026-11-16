import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, challanTone, invoiceTone } from "@/components/ui/chip";
import { ChallanActions } from "./challan-actions";
import { PackingListSection } from "./packing-list-section";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.deliveryChallan.findUnique({ where: { id }, select: { code: true } });
  return { title: c?.code ?? "Delivery challan" };
}

export const dynamic = "force-dynamic";

export default async function ChallanDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("dispatch:read");
  const { id } = await params;

  const dc = await prisma.deliveryChallan.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, addressLine1: true, city: true, state: true, pincode: true, gstin: true } },
      salesOrder: {
        select: {
          id: true, code: true, customerPoNo: true,
          quotation: { select: { id: true, code: true, costSheet: { select: { id: true, code: true } }, inquiry: { select: { id: true, code: true } } } },
        },
      },
      raisedBy: { select: { name: true } },
      invoices: { orderBy: { invoiceDate: "desc" } },
      packingList: {
        select: {
          id: true,
          code: true,
          status: true,
          _count: { select: { packages: true } },
        },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          batch: { select: { id: true, batchNo: true, lotRef: true, warehouse: { select: { name: true } } } },
          salesOrderLine: {
            select: {
              quantityKg: true,
              dispatchedKg: true,
              reopenedKg: true,
              project: { select: { id: true, code: true, name: true, application: true } },
            },
          },
        },
      },
    },
  });

  if (!dc) notFound();

  const qty = dc.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const value = dc.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0);
  const so = dc.salesOrder;
  const invoice = dc.invoices[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/dispatch"
        backLabel="Despatch"
        code={dc.code}
        title={dc.customer.name}
        status={<Chip tone={challanTone(dc.status)}>{titleise(dc.status)}</Chip>}
        actions={
          <ChallanActions
            challanId={dc.id}
            canInvoice={can(user.role, "invoice:write")}
            alreadyInvoiced={invoice ? { id: invoice.id, code: invoice.code } : null}
            dispatched={dc.status === "DISPATCHED" || dc.status === "DELIVERED"}
          />
        }
        meta={[
          { label: "Despatched", value: date(dc.dispatchedOn) },
          { label: "Delivered", value: dc.deliveredOn ? date(dc.deliveredOn) : "—" },
          { label: "Packages", value: dc.packageCnt ? String(dc.packageCnt) : "—" },
          { label: "Net", value: kg(qty) },
          { label: "Gross", value: dc.grossKg ? kg(Number(dc.grossKg)) : "—" },
          { label: "Value", value: <span className="font-num">{money(value)}</span> },
        ]}
      />

      <DocChain
        chain="sales"
        current="dispatch"
        links={{
          ...(so.quotation?.inquiry && { sinquiry: { code: so.quotation.inquiry.code, href: `/sales/inquiries/${so.quotation.inquiry.id}` } }),
          ...(so.quotation?.costSheet && { costsheet: { code: so.quotation.costSheet.code, href: `/sales/cost-sheets/${so.quotation.costSheet.id}` } }),
          ...(so.quotation && { squotation: { code: so.quotation.code, href: `/sales/quotations/${so.quotation.id}` } }),
          sorder: { code: so.code, href: `/sales/orders/${so.id}` },
          allocation: { code: `${kgPlain(qty)} kg`, href: `/sales/orders/${so.id}` },
          dispatch: { code: dc.code, href: `/sales/dispatch/${dc.id}` },
          ...(dc.packingList && { packinglist: { code: dc.packingList.code, href: `/sales/packing-lists/${dc.packingList.id}` } }),
          ...(invoice && { invoice: { code: invoice.code, href: "/sales/invoices" } }),
        }}
      />

      <RecordBody
        main={
          <>
            <Section
              title="What went out"
              hint={`${dc.lines.length} ${dc.lines.length === 1 ? "line" : "lines"} · batch traced`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Compound" }, { label: "Batch" },
                  { label: "From" }, { label: "Quantity", align: "right" },
                  { label: "Remaining", align: "right" },
                  { label: "Rate", align: "right" }, { label: "Value", align: "right" },
                ]}
              >
                {dc.lines.map((l) => {
                  const sol = l.salesOrderLine;
                  const q = Number(sol.quantityKg);
                  const d = Number(sol.dispatchedKg);
                  const r = Number(sol.reopenedKg || 0);
                  const remaining = Math.max(0, (q + r) - d);
                  return (
                    <Tr key={l.id}>
                      <Td num muted>{l.lineNo}</Td>
                      <Td>
                        <Link href={`/projects/${sol.project.id}`} className="ref-link">
                          {sol.project.name}
                        </Link>
                        <span className="block text-[11px] text-muted">
                          {sol.project.code} · {sol.project.application}
                        </span>
                      </Td>
                      <Td>
                        {l.batch ? (
                          <>
                            <Link href={`/procurement/inventory/${l.batch.id}`} className="ref-link font-num text-[11.5px]">
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
                      <Td muted>{l.batch?.warehouse.name ?? "—"}</Td>
                      <Td align="right" num>{kgPlain(Number(l.quantityKg))}</Td>
                      <Td align="right" num className={remaining > 0 ? "font-medium text-warning-text" : "text-muted"}>
                        {remaining > 0 ? kgPlain(remaining) : "0"}
                      </Td>
                      <Td align="right" num muted>₹{Number(l.ratePerKg).toFixed(2)}</Td>
                      <Td align="right" num>{amount(Number(l.quantityKg) * Number(l.ratePerKg))}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5">
                <span className="text-[11.5px] text-muted">
                  Each line carries the batch it came from — this is the trail a customer complaint is worked back along.
                </span>
                <span className="font-num text-[12.5px] font-semibold tabular-nums text-ink">{money(value)}</span>
              </div>
            </Section>

            {dc.invoices.length > 0 && (
              <Section title="Invoiced" padded={false}>
                <MiniTable
                  head={[{ label: "Invoice" }, { label: "Status" }, { label: "Date" }, { label: "Due" }, { label: "Value", align: "right" }, { label: "Outstanding", align: "right" }]}
                >
                  {dc.invoices.map((i) => {
                    const due = Number(i.totalValue) - Number(i.paidAmount);
                    return (
                      <Tr key={i.id}>
                        <Td><span className="font-num">{i.code}</span></Td>
                        <Td><Chip tone={invoiceTone(i.status)}>{titleise(i.status)}</Chip></Td>
                        <Td muted>{date(i.invoiceDate)}</Td>
                        <Td muted>{date(i.dueOn)}</Td>
                        <Td align="right" num>{amount(Number(i.totalValue))}</Td>
                        <Td align="right" num className={due > 0 ? "text-danger-text" : "text-success-text"}>
                          {due > 0 ? amount(due) : "settled"}
                        </Td>
                      </Tr>
                    );
                  })}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Consignment">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: <Link href={`/customers/${dc.customer.id}`} className="ref-link">{dc.customer.name}</Link>,
                  },
                  {
                    label: "Ship to",
                    value: [dc.customer.addressLine1, dc.customer.city, dc.customer.state, dc.customer.pincode]
                      .filter(Boolean)
                      .join(", ") || "—",
                  },
                  { label: "GSTIN", value: dc.customer.gstin ? <span className="font-num">{dc.customer.gstin}</span> : "—" },
                  {
                    label: "Against order",
                    value: <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">{so.code}</Link>,
                  },
                  { label: "Their PO", value: so.customerPoNo ?? "—" },
                ]}
              />
            </Section>

            <Section title="Transport">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Vehicle", value: dc.vehicleNo ? <span className="font-num">{dc.vehicleNo}</span> : "—" },
                  { label: "Driver", value: dc.driverName ?? "—" },
                  { label: "LR number", value: dc.lrNo ? <span className="font-num">{dc.lrNo}</span> : "—" },
                  { label: "E-way bill", value: dc.eWayBillNo ? <span className="font-num">{dc.eWayBillNo}</span> : "—" },
                  { label: "Packages", value: dc.packageCnt ? String(dc.packageCnt) : "—" },
                  { label: "Gross weight", value: dc.grossKg ? kg(Number(dc.grossKg)) : "—" },
                  { label: "Packed on", value: dc.packedOn ? dateTime(dc.packedOn) : "—" },
                  { label: "Despatched on", value: dc.dispatchedOn ? dateTime(dc.dispatchedOn) : "—" },
                  { label: "Raised by", value: dc.raisedBy?.name ?? "—" },
                ]}
              />
            </Section>

            <Section title="Packing list">
              <PackingListSection
                challanId={dc.id}
                canWrite={can(user.role, "dispatch:write")}
                dispatched={dc.status === "DISPATCHED" || dc.status === "DELIVERED"}
                packingList={
                  dc.packingList
                    ? {
                        id: dc.packingList.id,
                        code: dc.packingList.code,
                        status: dc.packingList.status,
                        packageCount: dc.packingList._count.packages,
                      }
                    : null
                }
              />
            </Section>

            {dc.remark && (
              <Section title="Remark">
                <p className="text-[12px] leading-relaxed text-ink">{dc.remark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
