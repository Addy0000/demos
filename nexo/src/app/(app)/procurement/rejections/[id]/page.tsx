import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, vrnStatusTone } from "@/components/ui/chip";
import { RejectionActions } from "./rejection-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const n = await prisma.vendorRejectionNote.findUnique({ where: { id }, select: { code: true } });
  return { title: n?.code ?? "Rejection note" };
}

export const dynamic = "force-dynamic";

export default async function RejectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("vrn:read");
  const { id } = await params;

  const note = await prisma.vendorRejectionNote.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, code: true, name: true, contactName: true, contactEmail: true, city: true, state: true } },
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      goodsReceipt: {
        select: {
          id: true, code: true, receivedOn: true, invoiceNo: true, qcRemark: true,
          purchaseOrder: { select: { id: true, code: true, requisitionId: true, quotationId: true } },
        },
      },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { material: { select: { id: true, code: true, name: true, grade: true } } },
      },
    },
  });

  if (!note) notFound();

  const qty = note.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const value = note.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0);
  const po = note.goodsReceipt.purchaseOrder;

  const requisition = po.requisitionId
    ? await prisma.purchaseRequisition.findUnique({ where: { id: po.requisitionId }, select: { id: true, code: true } })
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/rejections"
        backLabel="Rejection notes"
        code={note.code}
        title={note.vendor.name}
        status={<Chip tone={vrnStatusTone(note.status)}>{titleise(note.status)}</Chip>}
        actions={
          <RejectionActions
            noteId={note.id}
            status={note.status}
            canWrite={can(user.role, "vrn:write")}
            canApprove={can(user.role, "vrn:approve")}
            isOwnNote={note.raisedBy?.id === user.id}
          />
        }
        meta={[
          { label: "Raised", value: date(note.createdAt) },
          { label: "Lines", value: String(note.lines.length) },
          { label: "Rejected", value: <span className="text-danger">{kg(qty)}</span> },
          { label: "Value", value: <span className="font-num">{money(value)}</span> },
          { label: "Despatched", value: note.dispatchedAt ? date(note.dispatchedAt) : "—" },
        ]}
      />

      <DocChain
        current="rejection"
        links={{
          ...(requisition && { requisition: { code: requisition.code, href: `/procurement/requisitions/${requisition.id}` } }),
          order: { code: po.code, href: `/procurement/orders/${po.id}` },
          receipt: { code: note.goodsReceipt.code, href: `/procurement/grn/${note.goodsReceipt.id}` },
          qc: { code: "inspected", href: `/procurement/grn/${note.goodsReceipt.id}` },
          rejection: { code: note.code, href: `/procurement/rejections/${note.id}` },
        }}
      />

      <RecordBody
        main={
          <>
            <Section
              title="What was turned away"
              hint={`${note.lines.length} ${note.lines.length === 1 ? "line" : "lines"} from ${note.goodsReceipt.code}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Material" }, { label: "Reason" },
                  { label: "Quantity", align: "right" }, { label: "Rate", align: "right" }, { label: "Value", align: "right" },
                ]}
              >
                {note.lines.map((l) => (
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
                    <Td muted>{l.reason ?? "—"}</Td>
                    <Td align="right" num className="text-danger">{kgPlain(Number(l.quantityKg))}</Td>
                    <Td align="right" num muted>₹{Number(l.ratePerKg).toFixed(2)}</Td>
                    <Td align="right" num>{amount(Number(l.quantityKg) * Number(l.ratePerKg))}</Td>
                  </Tr>
                ))}
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5">
                <span className="text-[11.5px] text-muted">
                  Held in the Rejection warehouse until this note is approved and despatched.
                </span>
                <span className="font-num text-[12.5px] font-semibold tabular-nums text-ink">{money(value)}</span>
              </div>
            </Section>

            {note.goodsReceipt.qcRemark && (
              <Section title="Inspection remark" hint={note.goodsReceipt.code}>
                <p className="text-[12px] leading-relaxed text-ink">{note.goodsReceipt.qcRemark}</p>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Note">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Vendor",
                    value: <Link href={`/procurement/vendors/${note.vendor.id}`} className="ref-link">{note.vendor.name}</Link>,
                  },
                  { label: "Contact", value: note.vendor.contactName ?? "—" },
                  {
                    label: "Against receipt",
                    value: <Link href={`/procurement/grn/${note.goodsReceipt.id}`} className="ref-link font-num">{note.goodsReceipt.code}</Link>,
                  },
                  {
                    label: "Original order",
                    value: <Link href={`/procurement/orders/${po.id}`} className="ref-link font-num">{po.code}</Link>,
                  },
                  { label: "Vendor invoice", value: note.goodsReceipt.invoiceNo ?? "—" },
                  { label: "Received on", value: date(note.goodsReceipt.receivedOn) },
                ]}
              />
            </Section>

            <Section title="Recovery">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Expected", value: note.expectedResolution ?? "—" },
                  { label: "Raised by", value: note.raisedBy?.name ?? "—" },
                  { label: "Approved by", value: note.approvedBy?.name ?? "—" },
                  { label: "Approved on", value: note.approvedAt ? dateTime(note.approvedAt) : "—" },
                  { label: "Challan", value: note.challanNo ? <span className="font-num">{note.challanNo}</span> : "—" },
                  { label: "Vehicle", value: note.vehicleNo ? <span className="font-num">{note.vehicleNo}</span> : "—" },
                  { label: "Despatched", value: note.dispatchedAt ? dateTime(note.dispatchedAt) : "Not yet" },
                ]}
              />
            </Section>

            {note.remark && (
              <Section title="Remark">
                <p className="text-[12px] leading-relaxed text-ink">{note.remark}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
