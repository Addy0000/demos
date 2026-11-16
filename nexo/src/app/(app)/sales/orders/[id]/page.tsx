import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, salesOrderTone, challanTone, invoiceTone, salesReturnTone, marginTone, packingListTone } from "@/components/ui/chip";
import { SalesOrderActions } from "./sales-order-actions";
import { AllocationPanel } from "./allocation-panel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const o = await prisma.salesOrder.findUnique({ where: { id }, select: { code: true } });
  return { title: o?.code ?? "Sales order" };
}

export const dynamic = "force-dynamic";

export default async function SalesOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("so:read");
  const { id } = await params;

  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true, code: true, name: true, city: true, state: true, gstin: true,
          creditLimit: true, creditDays: true, outstandingAmt: true, paymentTerms: true,
        },
      },
      quotation: {
        select: {
          id: true, code: true,
          costSheet: { select: { id: true, code: true, status: true, marginPct: true, sellingRatePerKg: true, materialCostPerKg: true, conversionPerKg: true } },
          inquiry: { select: { id: true, code: true } },
          lines: { select: { projectId: true, costPerKg: true } },
        },
      },
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          project: { select: { id: true, code: true, name: true, application: true } },
          allocations: {
            where: { isActive: true },
            include: {
              batch: { select: { id: true, batchNo: true, availableQtyKg: true, warehouse: { select: { name: true } } } },
            },
          },
        },
      },
      challans: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { lines: true } },
          invoices: { select: { id: true, code: true, status: true } },
          packingList: { select: { id: true, code: true, status: true } },
        },
      },
      invoices: { orderBy: { invoiceDate: "desc" } },
      returns: { orderBy: { returnedOn: "desc" }, include: { _count: { select: { lines: true } } } },
    },
  });

  if (!order) notFound();

  const ordered = order.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const allocated = order.lines.reduce((a, l) => a + Number(l.allocatedKg), 0);
  const dispatched = order.lines.reduce((a, l) => a + Number(l.dispatchedKg), 0);

  const cs = order.quotation?.costSheet;
  const marginPct = cs ? Number(cs.marginPct) : null;

  // What the customer would be exposed for if this order ships.
  const limit = Number(order.customer.creditLimit);
  const outstanding = Number(order.customer.outstandingAmt);
  const exposure = outstanding + Number(order.totalValue);
  const overLimit = limit > 0 && exposure > limit;

  // Stock that could be reserved: batches of the lead material in each line's
  // formulation. Resolved here so the allocation bench opens with real options.
  const linesWithStock = await Promise.all(
    order.lines.map(async (line) => {
      const formulation = await prisma.formulation.findUnique({
        where: { projectId: line.projectId },
        select: { lines: { orderBy: { phr: "desc" }, take: 1, select: { materialId: true, material: { select: { name: true, code: true } } } } },
      });
      const lead = formulation?.lines[0];
      const batches = lead
        ? await prisma.inventoryBatch.findMany({
            where: { materialId: lead.materialId, status: "AVAILABLE", availableQtyKg: { gt: 0 } },
            orderBy: { receivedOn: "asc" },
            take: 12,
            select: {
              id: true, batchNo: true, availableQtyKg: true, ratePerKg: true, receivedOn: true,
              warehouse: { select: { name: true } },
            },
          })
        : [];
      return {
        lineId: line.id,
        leadMaterial: lead ? `${lead.material.name} (${lead.material.code})` : null,
        batches: batches.map((b) => ({
          id: b.id,
          batchNo: b.batchNo,
          availableKg: Number(b.availableQtyKg),
          ratePerKg: Number(b.ratePerKg),
          receivedOn: b.receivedOn.toISOString(),
          warehouse: b.warehouse.name,
        })),
      };
    }),
  );

  const openChallanForInvoice = order.challans.find((c) => c.invoices.length === 0 && c.status !== "DRAFT" && c.status !== "CANCELLED");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/orders"
        backLabel="Sales orders"
        code={order.code}
        title={order.customer.name}
        status={<Chip tone={salesOrderTone(order.status)}>{titleise(order.status)}</Chip>}
        actions={
          <SalesOrderActions
            orderId={order.id}
            status={order.status}
            canConfirm={can(user.role, "so:approve")}
            canDispatch={can(user.role, "dispatch:write")}
            canInvoice={can(user.role, "invoice:write")}
            canCancel={can(user.role, "so:write") && (order.status === "PENDING_APPROVAL" || order.status === "CONFIRMED") && order.challans.length === 0}
            isOwnOrder={order.raisedBy?.id === user.id}
            hasAllocation={allocated > 0}
            challanForInvoice={openChallanForInvoice ? { id: openChallanForInvoice.id, code: openChallanForInvoice.code } : null}
            credit={{ limit, outstanding, exposure, overLimit, customerName: order.customer.name }}
          />
        }
        meta={[
          { label: "Ordered", value: date(order.orderedOn) },
          { label: "Promised", value: date(order.promisedOn) },
          { label: "Their PO", value: order.customerPoNo ?? "—" },
          { label: "Quantity", value: kg(ordered) },
          { label: "Despatched", value: `${ordered > 0 ? ((dispatched / ordered) * 100).toFixed(0) : 0}% · ${kg(dispatched)}` },
          { label: "Order value", value: <span className="font-num">{money(order.totalValue)}</span> },
        ]}
      />

      <DocChain
        chain="sales"
        current={
          order.status === "INVOICED" ? "invoice"
            : order.status === "DISPATCHED" || order.status === "PARTIALLY_DISPATCHED" ? "dispatch"
              : order.status === "CONFIRMED" ? "allocation"
                : "sorder"
        }
        links={{
          ...(order.quotation?.inquiry && {
            sinquiry: { code: order.quotation.inquiry.code, href: `/sales/inquiries/${order.quotation.inquiry.id}` },
          }),
          ...(cs && { costsheet: { code: cs.code, href: `/sales/cost-sheets/${cs.id}` } }),
          ...(order.quotation && {
            squotation: { code: order.quotation.code, href: `/sales/quotations/${order.quotation.id}` },
          }),
          sorder: { code: order.code, href: `/sales/orders/${order.id}` },
          ...(allocated > 0 && { allocation: { code: `${kgPlain(allocated)} kg`, href: `/sales/orders/${order.id}` } }),
          ...(order.challans[0] && { dispatch: { code: order.challans[0].code, href: `/sales/dispatch/${order.challans[0].id}` } }),
          ...(order.invoices[0] && { invoice: { code: order.invoices[0].code, href: `/sales/invoices` } }),
          ...(order.returns[0] && { sreturn: { code: order.returns[0].code, href: `/sales/returns/${order.returns[0].id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            {overLimit && order.status === "PENDING_APPROVAL" && (
              <div className="border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] leading-relaxed text-ink">
                <span className="font-semibold">Over credit limit.</span> Confirming this order puts{" "}
                {order.customer.name} at{" "}
                <span className="font-num font-semibold">{money(exposure)}</span> against a{" "}
                <span className="font-num">{money(limit)}</span> limit —{" "}
                <span className="font-num">{money(outstanding)}</span> is already open. A reason is required
                to confirm past it.
              </div>
            )}

            <Section
              title="Order lines"
              hint={`${order.lines.length} ${order.lines.length === 1 ? "line" : "lines"}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Compound" }, { label: "Ordered", align: "right" },
                  { label: "Allocated", align: "right" }, { label: "Despatched", align: "right" },
                  { label: "Remaining", align: "right" },
                  { label: "Rate", align: "right" }, { label: "Line total", align: "right" },
                ]}
              >
                {order.lines.map((l) => {
                  const q = Number(l.quantityKg);
                  const a = Number(l.allocatedKg);
                  const d = Number(l.dispatchedKg);
                  const r = Number(l.reopenedKg || 0);
                  const remaining = Math.max(0, (q + r) - d);
                  return (
                    <Tr key={l.id}>
                      <Td num muted>{l.lineNo}</Td>
                      <Td>
                        <Link href={`/projects/${l.project.id}`} className="ref-link">{l.project.name}</Link>
                        <span className="block text-[11px] text-muted">
                          {l.project.code} · {l.project.application}
                        </span>
                      </Td>
                      <Td align="right" num>{kgPlain(q)}</Td>
                      <Td align="right" num className={a > 0 ? "text-info-text" : "text-muted"}>
                        {a > 0 ? kgPlain(a) : "—"}
                      </Td>
                      <Td align="right" num className={d > 0 ? "text-success-text" : "text-muted"}>
                        {d > 0 ? kgPlain(d) : "—"}
                      </Td>
                      <Td align="right" num className={remaining > 0 ? "font-medium text-warning-text" : "text-muted"}>
                        {remaining > 0 ? kgPlain(remaining) : "0"}
                      </Td>
                      <Td align="right" num muted>₹{Number(l.ratePerKg).toFixed(2)}</Td>
                      <Td align="right" num>{amount(Number(l.lineTotal))}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
            </Section>

            {can(user.role, "allocate:write") && order.status !== "CANCELLED" && (
              <AllocationPanel
                orderCode={order.code}
                orderStatus={order.status}
                lines={order.lines.map((l) => {
                  const stock = linesWithStock.find((s) => s.lineId === l.id);
                  return {
                    id: l.id,
                    lineNo: l.lineNo,
                    projectName: l.project.name,
                    orderedKg: Number(l.quantityKg),
                    allocatedKg: Number(l.allocatedKg),
                    dispatchedKg: Number(l.dispatchedKg),
                    leadMaterial: stock?.leadMaterial ?? null,
                    available: stock?.batches ?? [],
                    reserved: l.allocations.map((a) => ({
                      id: a.id,
                      batchNo: a.batch.batchNo,
                      warehouse: a.batch.warehouse.name,
                      quantityKg: Number(a.quantityKg),
                    })),
                  };
                })}
              />
            )}

            {order.challans.length > 0 && (
              <Section title="Despatches" hint={`${order.challans.length}`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Challan" }, { label: "Status" }, { label: "Despatched" },
                    { label: "Vehicle" }, { label: "Lines", align: "right" },
                    { label: "Packing list" }, { label: "Invoice" },
                  ]}
                >
                  {order.challans.map((c) => (
                    <Tr key={c.id}>
                      <Td><Link href={`/sales/dispatch/${c.id}`} className="ref-link font-num">{c.code}</Link></Td>
                      <Td><Chip tone={challanTone(c.status)}>{titleise(c.status)}</Chip></Td>
                      <Td muted>{date(c.dispatchedOn)}</Td>
                      <Td muted><span className="font-num">{c.vehicleNo ?? "—"}</span></Td>
                      <Td align="right" num>{c._count.lines}</Td>
                      <Td>
                        {c.packingList ? (
                          <div className="flex items-center gap-1.5">
                            <Link href={`/sales/packing-lists/${c.packingList.id}`} className="ref-link font-num text-[11.5px]">
                              {c.packingList.code}
                            </Link>
                            <Chip tone={packingListTone(c.packingList.status)}>{titleise(c.packingList.status)}</Chip>
                          </div>
                        ) : (
                          <Chip tone="neutral">no packing list</Chip>
                        )}
                      </Td>
                      <Td>
                        {c.invoices[0] ? (
                          <div className="flex items-center gap-1.5">
                            <Link href={`/sales/invoices/${c.invoices[0].id}`} className="ref-link font-num text-[11.5px]">
                              {c.invoices[0].code}
                            </Link>
                            <Chip tone={invoiceTone(c.invoices[0].status)}>{titleise(c.invoices[0].status)}</Chip>
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-warning font-medium">not invoiced</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}

            {order.invoices.length > 0 && (
              <Section title="Invoices" hint={`${order.invoices.length}`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Invoice" }, { label: "Status" }, { label: "Date" },
                    { label: "Due" }, { label: "Value", align: "right" }, { label: "Outstanding", align: "right" },
                  ]}
                >
                  {order.invoices.map((i) => {
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

            {order.returns.length > 0 && (
              <Section title="Returns against this order" hint={`${order.returns.length}`} padded={false}>
                <MiniTable head={[{ label: "Return" }, { label: "Status" }, { label: "Returned" }, { label: "Reason" }]}>
                  {order.returns.map((r) => (
                    <Tr key={r.id}>
                      <Td><Link href={`/sales/returns/${r.id}`} className="ref-link font-num">{r.code}</Link></Td>
                      <Td><Chip tone={salesReturnTone(r.status)}>{titleise(r.status)}</Chip></Td>
                      <Td muted>{date(r.returnedOn)}</Td>
                      <Td muted>{r.reason ?? "—"}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Order">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: <Link href={`/customers/${order.customer.id}`} className="ref-link">{order.customer.name}</Link>,
                  },
                  { label: "Their PO", value: order.customerPoNo ?? "—" },
                  { label: "Their PO date", value: date(order.customerPoDate) },
                  {
                    label: "From quotation",
                    value: order.quotation ? (
                      <Link href={`/sales/quotations/${order.quotation.id}`} className="ref-link font-num">
                        {order.quotation.code}
                      </Link>
                    ) : "Raised directly",
                  },
                  { label: "Payment terms", value: order.paymentTerms ?? "—" },
                  { label: "Delivery terms", value: order.deliveryTerms ?? "—" },
                  { label: "Raised by", value: order.raisedBy?.name ?? "—" },
                  { label: "Confirmed by", value: order.approvedBy?.name ?? "—" },
                  { label: "Confirmed on", value: order.approvedAt ? dateTime(order.approvedAt) : "—" },
                ]}
              />
            </Section>

            <Section title="Credit position" hint={overLimit ? "Over limit" : undefined}>
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Credit limit", value: <span className="font-num">{limit > 0 ? money(limit) : "No limit set"}</span> },
                  { label: "Already open", value: <span className="font-num">{money(outstanding)}</span> },
                  { label: "This order", value: <span className="font-num">{money(order.totalValue)}</span> },
                  {
                    label: "Exposure if shipped",
                    value: (
                      <span className={`font-num font-semibold ${overLimit ? "text-danger-text" : "text-success-text"}`}>
                        {money(exposure)}
                      </span>
                    ),
                  },
                  { label: "Credit days", value: `${order.customer.creditDays} days` },
                ]}
              />
            </Section>

            {cs && can(user.role, "costsheet:read") && marginPct !== null && (
              <Section title="Margin" hint={cs.code}>
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Material cost", value: <span className="font-num">₹{Number(cs.materialCostPerKg).toFixed(2)}/kg</span> },
                    { label: "Conversion", value: <span className="font-num">₹{Number(cs.conversionPerKg).toFixed(2)}/kg</span> },
                    { label: "Sheet selling rate", value: <span className="font-num">₹{Number(cs.sellingRatePerKg).toFixed(2)}/kg</span> },
                    {
                      label: "Margin on the sheet",
                      value: <Chip tone={marginTone(marginPct)}>{marginPct.toFixed(1)}%</Chip>,
                    },
                  ]}
                />
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  From the cost sheet as approved. The rate actually ordered may differ — compare against the
                  line rate above to see what was given away.
                </p>
              </Section>
            )}

            {order.remark && (
              <Section title="Remark">
                <p className="text-[12px] leading-relaxed text-ink">{order.remark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
