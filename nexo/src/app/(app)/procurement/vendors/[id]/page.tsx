import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PoStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, ratePerKg, date, titleise, percent } from "@/lib/format";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { Chip, vendorStatusTone, poStatusTone, grnStatusTone, priceStatusTone } from "@/components/ui/chip";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const v = await prisma.vendor.findUnique({ where: { id }, select: { name: true } });
  return { title: v?.name ?? "Vendor" };
}

export const dynamic = "force-dynamic";

export default async function VendorDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("vendor:read");
  const { id } = await params;
  const seesPrices = can(user.role, "price:read");

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true } },
      materials: { include: { material: { select: { id: true, code: true, name: true, category: true, grade: true, currentPricePerKg: true } } } },
      prices: {
        include: { material: { select: { id: true, name: true } } },
        orderBy: { submittedAt: "desc" },
        take: 40,
      },
      purchaseOrders: { orderBy: { orderedOn: "desc" }, take: 30, include: { _count: { select: { lines: true } } } },
      goodsReceipts: { orderBy: { receivedOn: "desc" }, take: 20, include: { purchaseOrder: { select: { code: true } } } },
      vendorBills: {
        where: { status: { notIn: ["VOID"] } },
        select: { totalValue: true, paidAmount: true, debitedAmount: true, status: true },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!vendor) notFound();

  const live = vendor.purchaseOrders.filter((p) => p.status !== PoStatus.CANCELLED);
  const spend = live.reduce((a, p) => a + Number(p.totalValue), 0);
  const pending = vendor.prices.filter((p) => p.status === "PENDING_APPROVAL");
  const outstanding = vendor.vendorBills.reduce(
    (a, b) => a + Math.max(0, Number(b.totalValue) - Number(b.paidAmount) - Number(b.debitedAmount ?? 0)),
    0
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/vendors"
        backLabel="Vendors"
        code={vendor.code}
        title={vendor.name}
        status={<Chip tone={vendorStatusTone(vendor.status)}>{titleise(vendor.status)}</Chip>}
        meta={[
          { label: "Rating", value: `${Number(vendor.rating).toFixed(1)} / 100` },
          { label: "Location", value: `${vendor.city ?? "—"}, ${vendor.state ?? "—"}` },
          { label: "Materials", value: String(vendor.materials.length) },
          { label: "Orders", value: String(vendor.purchaseOrders.length) },
          { label: "Spend (recent)", value: <span className="font-num">{money(spend)}</span> },
          { label: "Outstanding", value: <span className={`font-num ${outstanding > 0 ? "font-semibold text-danger-text" : ""}`}>{money(outstanding)}</span> },
          ...(pending.length ? [{ label: "Awaiting approval", value: <span className="text-warning">{pending.length}</span> }] : []),
        ]}
      />

      <RecordTabs
        storageKey="vendor"
        tabs={[
          {
            id: "materials",
            label: "Materials",
            count: vendor.materials.length || undefined,
            content: (
            <Section title="Supplied materials" hint={`${vendor.materials.length} approved`} padded={false}>
              <MiniTable
                head={[
                  { label: "Code", width: "84px" },
                  { label: "Material" },
                  { label: "Category", width: "150px" },
                  { label: "Grade", width: "110px" },
                  { label: "Vendor SKU", width: "160px" },
                  ...(seesPrices ? ([{ label: "Current ₹/kg", width: "110px", align: "right" as const }]) : []),
                ]}
                empty="No materials linked to this vendor."
              >
                {vendor.materials.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/procurement/materials/${m.material.id}`} className="ref-link font-num">{m.material.code}</Link>
                    </Td>
                    <Td>
                      <Link href={`/procurement/materials/${m.material.id}`} className="ref-link">{m.material.name}</Link>
                      {m.isPreferred && <span className="ml-1.5"><Chip tone="info">Preferred</Chip></span>}
                    </Td>
                    <Td muted>{titleise(m.material.category)}</Td>
                    <Td muted>{m.material.grade ?? "—"}</Td>
                    <Td num muted>{m.vendorSku ?? "—"}</Td>
                    {seesPrices && (
                      <Td align="right" num className="font-medium">
                        {m.material.currentPricePerKg ? ratePerKg(m.material.currentPricePerKg) : "—"}
                      </Td>
                    )}
                  </Tr>
                ))}
              </MiniTable>
            </Section>

            ),
          },
          ...(seesPrices
            ? [{
                id: "prices",
                label: "Price submissions",
                count: vendor.prices.length || undefined,
                content: (
              <Section title="Price submissions" hint={`${vendor.prices.length} most recent`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Material" },
                    { label: "Rate ₹/kg", width: "104px", align: "right" },
                    { label: "Change", width: "92px", align: "right" },
                    { label: "Status", width: "148px" },
                    { label: "Effective", width: "104px" },
                    { label: "Submitted", width: "104px" },
                  ]}
                  empty="No price submissions from this vendor."
                >
                  {vendor.prices.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        <Link href={`/procurement/materials/${p.material.id}`} className="ref-link">{p.material.name}</Link>
                      </Td>
                      <Td align="right" num className="font-medium">{ratePerKg(p.pricePerKg)}</Td>
                      <Td align="right">
                        {p.changePct !== null ? (
                          <Chip tone={Number(p.changePct) > 8 ? "danger" : Number(p.changePct) > 0 ? "warning" : "success"}>
                            {percent(Number(p.changePct), 1)}
                          </Chip>
                        ) : <span className="text-muted">—</span>}
                      </Td>
                      <Td><Chip tone={priceStatusTone(p.status)}>{titleise(p.status)}</Chip></Td>
                      <Td num muted>{date(p.effectiveFrom)}</Td>
                      <Td num muted>{date(p.submittedAt)}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
                ),
              }]
            : []),
          {
            id: "orders",
            label: "Purchase orders",
            count: vendor.purchaseOrders.length || undefined,
            content: (
            <Section title="Purchase orders" hint={`${vendor.purchaseOrders.length} most recent`} padded={false}>
              <MiniTable
                head={[
                  { label: "PO", width: "130px" },
                  { label: "Status", width: "152px" },
                  { label: "Ordered", width: "104px" },
                  { label: "Expected", width: "104px" },
                  { label: "Lines", width: "60px", align: "right" },
                  { label: "Value", width: "130px", align: "right" },
                ]}
                empty="No purchase orders raised on this vendor."
              >
                {vendor.purchaseOrders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <Link href={`/procurement/orders/${o.id}`} className="ref-link font-num">{o.code}</Link>
                    </Td>
                    <Td><Chip tone={poStatusTone(o.status)}>{titleise(o.status)}</Chip></Td>
                    <Td num muted>{date(o.orderedOn)}</Td>
                    <Td num muted>{date(o.expectedOn)}</Td>
                    <Td align="right" num>{o._count.lines}</Td>
                    <Td align="right" num className="font-medium">{money(o.totalValue)}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>

            ),
          },
          {
            id: "receipts",
            label: "Goods receipts",
            count: vendor.goodsReceipts.length || undefined,
            content: (
            <Section title="Goods receipts" hint={`${vendor.goodsReceipts.length} most recent`} padded={false}>
              <MiniTable
                head={[
                  { label: "GRN", width: "130px" },
                  { label: "Status", width: "152px" },
                  { label: "Against", width: "124px" },
                  { label: "Received", width: "104px" },
                  { label: "Invoice", width: "120px" },
                  { label: "Vehicle" },
                ]}
                empty="Nothing received from this vendor yet."
              >
                {vendor.goodsReceipts.map((g) => (
                  <Tr key={g.id}>
                    <Td>
                      <Link href={`/procurement/grn/${g.id}`} className="ref-link font-num">{g.code}</Link>
                    </Td>
                    <Td><Chip tone={grnStatusTone(g.status)}>{titleise(g.status)}</Chip></Td>
                    <Td num muted>{g.purchaseOrder.code}</Td>
                    <Td num muted>{date(g.receivedOn)}</Td>
                    <Td num muted>{g.invoiceNo ?? "—"}</Td>
                    <Td num muted>{g.vehicleNo ?? "—"}</Td>
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
                  <>
                    <Section title="Registration">
                      <FieldGrid
                        columns={2}
                        fields={[
                          { label: "Vendor code", value: <span className="font-num">{vendor.code}</span> },
                          { label: "Legal name", value: vendor.legalName ?? "—" },
                          { label: "GSTIN", value: <span className="font-num">{vendor.gstin ?? "—"}</span> },
                          { label: "PAN", value: <span className="font-num">{vendor.pan ?? "—"}</span> },
                          {
                            label: "Address",
                            value: [vendor.addressLine1, vendor.city, vendor.state, vendor.pincode]
                              .filter(Boolean).join(", ") || "—",
                            span: true,
                          },
                        ]}
                      />
                    </Section>

                    <Section title="Commercial">
                      <FieldGrid
                        columns={2}
                        fields={[
                          { label: "Payment terms", value: vendor.paymentTerms ?? "—" },
                          { label: "Credit days", value: `${vendor.creditDays} days` },
                          { label: "Rating", value: `${Number(vendor.rating).toFixed(1)} / 100` },
                          { label: "Contact", value: vendor.contactName ?? "—" },
                          { label: "Phone", value: <span className="font-num">{vendor.contactPhone ?? "—"}</span> },
                          { label: "Email", value: <span className="font-num text-[11.5px]">{vendor.contactEmail ?? "—"}</span> },
                        ]}
                      />
                    </Section>
                  </>
                }
                aside={
                  <Section
                    title="Portal access"
                    hint={`${vendor.users.length} account${vendor.users.length === 1 ? "" : "s"}`}
                    padded={false}
                  >
                    <MiniTable
                      head={[{ label: "User" }, { label: "Last seen", width: "104px" }]}
                      empty="No portal login issued to this vendor."
                    >
                      {vendor.users.map((u) => (
                        <Tr key={u.id}>
                          <Td>
                            {u.name}
                            <span className="block font-num text-[11px] text-muted">{u.email}</span>
                          </Td>
                          <Td num muted>{u.lastLoginAt ? date(u.lastLoginAt) : "never"}</Td>
                        </Tr>
                      ))}
                    </MiniTable>
                    <p className="border-t border-edge px-3 py-2 text-[11px] leading-relaxed text-muted">
                      Vendor accounts see only their own price list and purchase orders. Never inventory,
                      customers, formulations, or another vendor&apos;s rates.
                    </p>
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
