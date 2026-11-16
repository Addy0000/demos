import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { kgPlain, kg, date, dateTime, titleise, amount } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, grnStatusTone } from "@/components/ui/chip";
import { QcPanel } from "./qc-panel";
import { GrnRejectionAction } from "./grn-rejection-action";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const g = await prisma.goodsReceipt.findUnique({ where: { id }, select: { code: true } });
  return { title: g?.code ?? "Goods receipt" };
}

export const dynamic = "force-dynamic";

export default async function GrnDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("grn:read");
  const { id } = await params;

  const grn = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, code: true, name: true, contactName: true, contactPhone: true } },
      purchaseOrder: {
        select: {
          id: true, code: true, orderedOn: true, expectedOn: true,
          requisition: { select: { id: true, code: true } },
          quotation: { select: { code: true, inquiry: { select: { id: true, code: true } } } },
        },
      },
      rejectionNotes: { select: { id: true, code: true, status: true } },
      debitNotes: {
        where: { status: "ISSUED" },
        select: {
          id: true,
          number: true,
          totalValue: true,
          status: true,
          vendorBill: { select: { id: true, code: true } },
        },
      },
      receivedBy: { select: { name: true } },
      inspectedBy: { select: { name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          purchaseOrderLine: {
            select: {
              id: true, quantityKg: true, receivedKg: true, ratePerKg: true,
              material: { select: { id: true, code: true, name: true, grade: true } },
            },
          },
          batch: { select: { id: true, batchNo: true, status: true, availableQtyKg: true } },
          debitNoteLines: {
            where: { debitNote: { status: "ISSUED" } },
            select: {
              id: true,
              quantity: true,
              debitNote: {
                select: { id: true, number: true },
              },
            },
          },
        },
      },
    },
  });

  if (!grn) notFound();

  const challan = grn.lines.reduce((a, l) => a + Number(l.challanQtyKg), 0);
  const received = grn.lines.reduce((a, l) => a + Number(l.receivedQtyKg), 0);
  const accepted = grn.lines.reduce((a, l) => a + Number(l.acceptedQtyKg), 0);
  const value = grn.lines.reduce((a, l) => a + Number(l.acceptedQtyKg) * Number(l.purchaseOrderLine.ratePerKg), 0);

  const canInspect = can(user.role, "grn:qc") && grn.status !== "POSTED";
  const rejected = grn.lines.reduce((a, l) => a + Number(l.rejectedQtyKg), 0);
  const note = grn.rejectionNotes[0];
  const po = grn.purchaseOrder;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/grn"
        backLabel="Goods receipts"
        code={grn.code}
        title={grn.vendor.name}
        status={<Chip tone={grnStatusTone(grn.status)}>{titleise(grn.status)}</Chip>}
        actions={
          <div className="flex items-center gap-2">
            {grn.debitNotes[0] && (
              <Link
                href={`/purchase/debit-notes/${grn.debitNotes[0].id}`}
                className="flex items-center gap-1.5 rounded border border-edge bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors duration-150 hover:bg-faint hover:text-primary"
              >
                Debit note <span className="font-num text-primary font-semibold">{grn.debitNotes[0].number}</span>
              </Link>
            )}
            <GrnRejectionAction
              grnId={grn.id}
              rejectedKg={rejected}
              canRaise={can(user.role, "vrn:write")}
              existingNote={note ? { id: note.id, code: note.code } : null}
            />
          </div>
        }
        meta={[
          { label: "Received", value: date(grn.receivedOn) },
          { label: "Against", value: <Link href={`/procurement/orders/${grn.purchaseOrder.id}`} className="ref-link">{grn.purchaseOrder.code}</Link> },
          { label: "Challan", value: kg(challan) },
          { label: "Weighed", value: kg(received) },
          { label: "Accepted", value: <span className="text-success">{kg(accepted)}</span> },
          { label: "Value", value: <span className="font-num">{amount(value)}</span> },
        ]}
      />

      <DocChain
        current={grn.status === "PENDING_QC" ? "receipt" : "qc"}
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
          receipt: { code: grn.code, href: `/procurement/grn/${grn.id}` },
          ...(grn.status === "POSTED" && {
            qc: { code: "passed", href: `/procurement/grn/${grn.id}` },
            store: { code: `${grn.lines.filter((l) => l.batch).length} batches`, href: "/procurement/inventory" },
          }),
          ...(note && { rejection: { code: note.code, href: `/procurement/rejections/${note.id}` } }),
        }}
      />

      <RecordBody
        main={
          <QcPanel
            grnId={grn.id}
            status={grn.status}
            canInspect={canInspect}
            defaultRemark={grn.qcRemark ?? ""}
            lines={grn.lines.map((l) => ({
              id: l.id,
              lineNo: l.lineNo,
              materialId: l.purchaseOrderLine.material.id,
              materialCode: l.purchaseOrderLine.material.code,
              materialName: l.purchaseOrderLine.material.name,
              grade: l.purchaseOrderLine.material.grade ?? "",
              orderedKg: Number(l.purchaseOrderLine.quantityKg),
              challanKg: Number(l.challanQtyKg),
              receivedKg: Number(l.receivedQtyKg),
              acceptedKg: Number(l.acceptedQtyKg),
              rejectedKg: Number(l.rejectedQtyKg),
              rate: Number(l.purchaseOrderLine.ratePerKg),
              qcResult: l.qcResult,
              qcRemark: l.qcRemark ?? "",
              batchId: l.batch?.id ?? null,
              batchNo: l.batch?.batchNo ?? null,
              batchStatus: l.batch?.status ?? null,
              debitNote: l.debitNoteLines[0]?.debitNote
                ? {
                    id: l.debitNoteLines[0].debitNote.id,
                    number: l.debitNoteLines[0].debitNote.number,
                    quantityKg: Number(l.debitNoteLines[0].quantity),
                  }
                : null,
            }))}
          />
        }
        aside={
          <>
            <Section title="Consignment">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "GRN number", value: <span className="font-num">{grn.code}</span> },
                  { label: "Received on", value: dateTime(grn.receivedOn) },
                  { label: "Invoice no.", value: <span className="font-num">{grn.invoiceNo ?? "—"}</span> },
                  { label: "Invoice date", value: date(grn.invoiceDate) },
                  { label: "Vehicle", value: <span className="font-num">{grn.vehicleNo ?? "—"}</span> },
                  { label: "E-way bill", value: <span className="font-num text-[11.5px]">{grn.eWayBillNo ?? "—"}</span> },
                  { label: "Gate entry", value: <span className="font-num">{grn.gateEntryNo ?? "—"}</span> },
                ]}
              />
            </Section>

            <Section title="Chain of custody">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Purchase order", value: <Link href={`/procurement/orders/${grn.purchaseOrder.id}`} className="ref-link">{grn.purchaseOrder.code}</Link> },
                  { label: "Ordered on", value: date(grn.purchaseOrder.orderedOn) },
                  { label: "Expected on", value: date(grn.purchaseOrder.expectedOn) },
                  { label: "Received by", value: grn.receivedBy?.name ?? "—" },
                  { label: "Inspected by", value: grn.inspectedBy?.name ?? "Not yet inspected" },
                  { label: "Inspected at", value: grn.inspectedAt ? dateTime(grn.inspectedAt) : "—" },
                  { label: "Posted at", value: grn.postedAt ? dateTime(grn.postedAt) : "Not posted" },
                ]}
              />
            </Section>

            <Section title="Vendor">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Vendor", value: <Link href={`/procurement/vendors/${grn.vendor.id}`} className="ref-link">{grn.vendor.name}</Link> },
                  { label: "Code", value: <span className="font-num">{grn.vendor.code}</span> },
                  { label: "Contact", value: grn.vendor.contactName ?? "—" },
                  { label: "Phone", value: <span className="font-num">{grn.vendor.contactPhone ?? "—"}</span> },
                ]}
              />
            </Section>

            {grn.debitNotes.length > 0 && (
              <Section
                title="Debit notes"
                hint={`${grn.debitNotes.length} issued against rejections`}
                padded={false}
              >
                <div className="divide-y divide-edge/60 text-xs">
                  {grn.debitNotes.map((dn) => (
                    <div key={dn.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <Link href={`/purchase/debit-notes/${dn.id}`} className="ref-link font-num font-semibold text-primary">
                          {dn.number}
                        </Link>
                        {dn.vendorBill && (
                          <span className="block text-[11px] text-muted">
                            Bill: <Link href={`/finance/payable/${dn.vendorBill.id}`} className="ref-link">{dn.vendorBill.code}</Link>
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-num font-medium text-ink">{amount(Number(dn.totalValue))}</span>
                        <div className="mt-0.5">
                          <Chip tone={dn.status === "ISSUED" ? "success" : "neutral"}>{titleise(dn.status)}</Chip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
