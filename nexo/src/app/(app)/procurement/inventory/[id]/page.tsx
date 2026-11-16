import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { kgPlain, amount, money, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip, batchStatusTone, movementTone, warehouseKindTone } from "@/components/ui/chip";
import { BatchActions } from "./batch-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const b = await prisma.inventoryBatch.findUnique({ where: { id }, select: { batchNo: true } });
  return { title: b?.batchNo ?? "Batch" };
}

export const dynamic = "force-dynamic";

export default async function BatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:read");
  const { id } = await params;

  const batch = await prisma.inventoryBatch.findUnique({
    where: { id },
    include: {
      material: { select: { id: true, code: true, name: true, grade: true, category: true, casNumber: true, isHazardous: true } },
      warehouse: { select: { code: true, name: true, kind: true } },
      movements: {
        orderBy: { occurredAt: "desc" },
        take: 200,
        include: { user: { select: { name: true } } },
      },
      grnLine: {
        include: {
          goodsReceipt: {
            select: {
              id: true, code: true, receivedOn: true, invoiceNo: true, vehicleNo: true,
              vendor: { select: { id: true, name: true } },
              purchaseOrder: { select: { id: true, code: true } },
            },
          },
        },
      },
    },
  });

  if (!batch) notFound();

  const received = Number(batch.receivedQtyKg);
  const available = Number(batch.availableQtyKg);
  const consumed = received - available;
  const rate = Number(batch.ratePerKg);
  const expired = batch.expiresOn && new Date(batch.expiresOn) < new Date();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/inventory"
        backLabel="Inventory"
        code={batch.batchNo}
        title={batch.material.name}
        status={
          <span className="flex items-center gap-1.5">
            {batch.material.isHazardous && <Chip tone="warning">Hazardous</Chip>}
            {expired && <Chip tone="danger">Expired</Chip>}
            <Chip tone={batchStatusTone(batch.status)}>{titleise(batch.status)}</Chip>
          </span>
        }
        actions={
          <BatchActions
            batchId={batch.id}
            status={batch.status}
            available={available}
            canAdjust={can(user.role, "inventory:adjust")}
          />
        }
        meta={[
          { label: "Received", value: `${kgPlain(received)} kg` },
          { label: "Available", value: <span className={available === 0 ? "text-muted" : "text-success"}>{kgPlain(available)} kg</span> },
          { label: "Consumed", value: `${kgPlain(consumed)} kg` },
          { label: "Rate", value: <span className="font-num">{amount(rate)}/kg</span> },
          { label: "Value on hand", value: <span className="font-num">{money(available * rate)}</span> },
          { label: "Location", value: `${batch.warehouse.name}${batch.binLocation ? ` · ${batch.binLocation}` : ""}` },
        ]}
      />

      <RecordBody
        main={
          <Section
            title="Movement history"
            hint={`${batch.movements.length} movement${batch.movements.length === 1 ? "" : "s"} against this lot`}
            padded={false}
          >
            <MiniTable
              head={[
                { label: "When", width: "140px" },
                { label: "Movement", width: "170px" },
                { label: "Quantity kg", width: "120px", align: "right" },
                { label: "Value ₹", width: "110px", align: "right" },
                { label: "Reference", width: "130px" },
                { label: "By", width: "140px" },
                { label: "Remark" },
              ]}
              empty="No movements recorded against this batch."
            >
              {batch.movements.map((m) => {
                const qty = Number(m.quantityKg);
                return (
                  <Tr key={m.id}>
                    <Td num muted>{dateTime(m.occurredAt)}</Td>
                    <Td><Chip tone={movementTone(m.kind)}>{titleise(m.kind)}</Chip></Td>
                    <Td align="right" num className={qty >= 0 ? "font-medium text-success" : ""}>
                      {qty >= 0 ? "+" : ""}{kgPlain(qty)}
                    </Td>
                    <Td align="right" num muted>{m.ratePerKg ? amount(qty * Number(m.ratePerKg)) : "—"}</Td>
                    <Td muted>{m.reference ?? "—"}</Td>
                    <Td muted>{m.user?.name ?? "—"}</Td>
                    <Td muted>{m.remark ?? "—"}</Td>
                  </Tr>
                );
              })}
            </MiniTable>
          </Section>
        }
        aside={
          <>
            <Section title="Batch">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Batch number", value: <span className="font-num">{batch.batchNo}</span> },
                  { label: "Vendor lot ref", value: <span className="font-num">{batch.lotRef ?? "—"}</span> },
                  {
                    label: "Warehouse",
                    value: (
                      <span className="flex items-center gap-1.5">
                        {batch.warehouse.name}
                        {batch.warehouse.kind !== "STORE" && (
                          <Chip tone={warehouseKindTone(batch.warehouse.kind)}>{titleise(batch.warehouse.kind)}</Chip>
                        )}
                      </span>
                    ),
                  },
                  { label: "Bin location", value: <span className="font-num">{batch.binLocation ?? "—"}</span> },
                  { label: "Manufactured", value: date(batch.manufacturedOn) },
                  { label: "Received", value: date(batch.receivedOn) },
                  { label: "Expires", value: batch.expiresOn ? <span className={expired ? "text-danger" : ""}>{date(batch.expiresOn)}</span> : "—" },
                ]}
              />
            </Section>

            <Section title="Material">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Material", value: <Link href={`/procurement/materials/${batch.material.id}`} className="ref-link">{batch.material.name}</Link> },
                  { label: "Code", value: <span className="font-num">{batch.material.code}</span> },
                  { label: "Grade", value: batch.material.grade ?? "—" },
                  { label: "Category", value: titleise(batch.material.category) },
                  { label: "CAS number", value: <span className="font-num">{batch.material.casNumber ?? "—"}</span> },
                ]}
              />
            </Section>

            {batch.grnLine && (
              <Section title="Traceability">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Goods receipt", value: <Link href={`/procurement/grn/${batch.grnLine.goodsReceipt.id}`} className="ref-link">{batch.grnLine.goodsReceipt.code}</Link> },
                    { label: "Purchase order", value: <Link href={`/procurement/orders/${batch.grnLine.goodsReceipt.purchaseOrder.id}`} className="ref-link">{batch.grnLine.goodsReceipt.purchaseOrder.code}</Link> },
                    { label: "Vendor", value: <Link href={`/procurement/vendors/${batch.grnLine.goodsReceipt.vendor.id}`} className="ref-link">{batch.grnLine.goodsReceipt.vendor.name}</Link> },
                    { label: "Invoice", value: <span className="font-num">{batch.grnLine.goodsReceipt.invoiceNo ?? "—"}</span> },
                    { label: "Vehicle", value: <span className="font-num">{batch.grnLine.goodsReceipt.vehicleNo ?? "—"}</span> },
                    { label: "QC result", value: <Chip tone={batch.grnLine.qcResult === "PASS" ? "success" : batch.grnLine.qcResult === "FAIL" ? "danger" : "warning"}>{titleise(batch.grnLine.qcResult)}</Chip> },
                    { label: "QC remark", value: batch.grnLine.qcRemark ?? "—" },
                  ]}
                />
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
