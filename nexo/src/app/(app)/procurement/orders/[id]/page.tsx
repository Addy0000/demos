import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can, canApproveValue, approvalLimit } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, poStatusTone, grnStatusTone } from "@/components/ui/chip";
import { PoActions } from "./po-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { code: true } });
  return { title: po?.code ?? "Purchase order" };
}

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("po:read");
  const { id } = await params;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, code: true, name: true, contactName: true, contactEmail: true, contactPhone: true, city: true, state: true, gstin: true } },
      requisition: { select: { id: true, code: true } },
      quotation: { select: { id: true, code: true, inquiry: { select: { id: true, code: true } } } },
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { material: { select: { id: true, code: true, name: true, grade: true, uom: true } } } },
      goodsReceipts: {
        orderBy: { receivedOn: "desc" },
        include: { _count: { select: { lines: true } }, receivedBy: { select: { name: true } } },
      },
    },
  });

  if (!po) notFound();

  const ordered = po.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const received = po.lines.reduce((a, l) => a + Number(l.receivedKg), 0);
  const progress = ordered > 0 ? (received / ordered) * 100 : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/orders"
        backLabel="Purchase orders"
        code={po.code}
        title={po.vendor.name}
        status={<Chip tone={poStatusTone(po.status)}>{titleise(po.status)}</Chip>}
        actions={
          <PoActions
            poId={po.id}
            poCode={po.code}
            vendorName={po.vendor.name}
            status={po.status}
            canApprove={canApproveValue(user.role, Number(po.totalValue)) && po.raisedBy?.id !== user.id}
            canWrite={can(user.role, "po:write")}
            canReceive={can(user.role, "grn:write")}
            blockedReason={
              !can(user.role, "po:approve")
                ? null
                : po.raisedBy?.id === user.id
                  ? "You raised this order — it needs another signer."
                  : !canApproveValue(user.role, Number(po.totalValue))
                    ? `Above your ₹${(approvalLimit(user.role) ?? 0).toLocaleString("en-IN")} limit — Management must approve.`
                    : null
            }
            lines={po.lines.map((l) => ({
              id: l.id,
              lineNo: l.lineNo,
              materialCode: l.material.code,
              materialName: l.material.name,
              grade: l.material.grade,
              quantityKg: Number(l.quantityKg),
              receivedKg: Number(l.receivedKg),
            }))}
          />
        }
        meta={[
          { label: "Ordered", value: date(po.orderedOn) },
          { label: "Expected", value: date(po.expectedOn) },
          { label: "Lines", value: String(po.lines.length) },
          { label: "Received", value: `${progress.toFixed(0)}% · ${kg(received)} of ${kg(ordered)}` },
          { label: "Order value", value: <span className="font-num">{money(po.totalValue)}</span> },
          {
            label: "Approval",
            value:
              po.status === "PENDING_APPROVAL" ? (
                <Chip tone={po.approvalTier === "MANAGEMENT" ? "special" : "warning"}>
                  {po.approvalTier === "MANAGEMENT" ? "Management" : "Purchase Head"}
                </Chip>
              ) : po.approvedBy ? (
                <span className="text-[12px]">{po.approvedBy.name}</span>
              ) : "—",
          },
        ]}
      />

      <DocChain
        current="order"
        links={{
          ...(po.requisition && {
            requisition: { code: po.requisition.code, href: `/procurement/requisitions/${po.requisition.id}` },
          }),
          ...(po.quotation && {
            inquiry: { code: po.quotation.inquiry.code, href: `/procurement/inquiries/${po.quotation.inquiry.id}` },
            quotation: { code: po.quotation.code, href: `/procurement/inquiries/${po.quotation.inquiry.id}` },
            comparison: { code: po.quotation.code, href: `/procurement/inquiries/${po.quotation.inquiry.id}` },
          }),
          order: { code: po.code, href: `/procurement/orders/${po.id}` },
          ...(po.goodsReceipts[0] && {
            receipt: { code: po.goodsReceipts[0].code, href: `/procurement/grn/${po.goodsReceipts[0].id}` },
          }),
        }}
      />

      <RecordTabs
        storageKey="purchase-order"
        tabs={[
          {
            id: "lines",
            label: "Order lines",
            count: po.lines.length || undefined,
            content: (
            <Section title="Order lines" hint={`${po.lines.length} line${po.lines.length === 1 ? "" : "s"}`} padded={false}>
              <MiniTable
                head={[
                  { label: "#", width: "36px" },
                  { label: "Code", width: "84px" },
                  { label: "Material" },
                  { label: "Ordered kg", width: "112px", align: "right" },
                  { label: "Received kg", width: "112px", align: "right" },
                  { label: "Pending", width: "104px", align: "right" },
                  { label: "Rate ₹/kg", width: "94px", align: "right" },
                  { label: "Tax", width: "60px", align: "right" },
                  { label: "Line total", width: "120px", align: "right" },
                ]}
              >
                {po.lines.map((l) => {
                  const orderedQ = Number(l.quantityKg);
                  const receivedQ = Number(l.receivedKg);
                  const pending = orderedQ - receivedQ;
                  return (
                    <Tr key={l.id}>
                      <Td muted num>{l.lineNo}</Td>
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
                      <Td align="right" num>{kgPlain(orderedQ)}</Td>
                      <Td align="right" num className={receivedQ > 0 ? "text-success" : "text-muted"}>
                        {kgPlain(receivedQ)}
                      </Td>
                      <Td align="right" num className={pending > 0.001 ? "text-warning" : "text-muted"}>
                        {pending > 0.001 ? kgPlain(pending) : "—"}
                      </Td>
                      <Td align="right" num muted>{amount(l.ratePerKg)}</Td>
                      <Td align="right" num muted>{Number(l.taxPct).toFixed(0)}%</Td>
                      <Td align="right" num className="font-medium">{amount(l.lineTotal)}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>

              <dl className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-edge bg-faint px-3 py-2 text-[11.5px]">
                <div className="flex gap-2">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="font-num tabular-nums text-ink">{money(po.subtotal, 2)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted">GST</dt>
                  <dd className="font-num tabular-nums text-ink">{money(po.taxAmount, 2)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted">Freight</dt>
                  <dd className="font-num tabular-nums text-ink">{money(po.freight, 2)}</dd>
                </div>
                <div className="flex gap-2 border-l border-edge pl-6">
                  <dt className="font-medium text-ink">Total</dt>
                  <dd className="font-num text-[13px] font-semibold tabular-nums text-ink">{money(po.totalValue, 2)}</dd>
                </div>
              </dl>
            </Section>

            ),
          },
          {
            id: "receipts",
            label: "Goods receipts",
            count: po.goodsReceipts.length || undefined,
            content: (
            <Section
              title="Goods receipts against this order"
              hint={`${po.goodsReceipts.length} receipt${po.goodsReceipts.length === 1 ? "" : "s"}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "GRN", width: "130px" },
                  { label: "Status", width: "150px" },
                  { label: "Received", width: "104px" },
                  { label: "Invoice", width: "120px" },
                  { label: "Vehicle", width: "120px" },
                  { label: "Lines", width: "60px", align: "right" },
                  { label: "Received by" },
                ]}
                empty="Nothing received against this order yet."
              >
                {po.goodsReceipts.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <Link href={`/procurement/grn/${g.id}`} className="ref-link font-num">{g.code}</Link>
                    </Td>
                    <Td><Chip tone={grnStatusTone(g.status)}>{titleise(g.status)}</Chip></Td>
                    <Td num muted>{date(g.receivedOn)}</Td>
                    <Td num muted>{g.invoiceNo ?? "—"}</Td>
                    <Td num muted>{g.vehicleNo ?? "—"}</Td>
                    <Td align="right" num>{g._count.lines}</Td>
                    <Td muted>{g.receivedBy?.name ?? "—"}</Td>
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
                  <Section title="Terms & approval">
                    <FieldGrid
                      columns={2}
                      fields={[
                        { label: "Delivery terms", value: po.deliveryTerms ?? "—" },
                        { label: "Payment terms", value: po.paymentTerms ?? "—" },
                        { label: "Raised by", value: po.raisedBy?.name ?? "—" },
                        {
                          label: "Approval route",
                          value: po.approvalTier === "MANAGEMENT" ? "Management (above Head limit)" : "Purchase Head",
                        },
                        { label: "Approved by", value: po.approvedBy?.name ?? "Not approved" },
                        { label: "Approved at", value: po.approvedAt ? dateTime(po.approvedAt) : "—" },
                        { label: "Remark", value: po.remark ?? "—", span: true },
                      ]}
                    />
                  </Section>
                }
                aside={
                  <Section title="Vendor">
                    <FieldGrid
                      columns={1}
                      fields={[
                        {
                          label: "Vendor",
                          value: (
                            <Link href={`/procurement/vendors/${po.vendor.id}`} className="ref-link">
                              {po.vendor.name}
                            </Link>
                          ),
                        },
                        { label: "Code", value: <span className="font-num">{po.vendor.code}</span> },
                        { label: "Contact", value: po.vendor.contactName ?? "—" },
                        { label: "Phone", value: <span className="font-num">{po.vendor.contactPhone ?? "—"}</span> },
                        { label: "Email", value: <span className="font-num text-[11.5px]">{po.vendor.contactEmail ?? "—"}</span> },
                        { label: "Location", value: `${po.vendor.city ?? "—"}, ${po.vendor.state ?? "—"}` },
                        { label: "GSTIN", value: <span className="font-num">{po.vendor.gstin ?? "—"}</span> },
                      ]}
                    />
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
