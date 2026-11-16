import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can, isVendor } from "@/lib/rbac";
import { money, kg, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, inquiryStatusTone } from "@/components/ui/chip";
import { Comparison } from "./comparison";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const q = await prisma.purchaseInquiry.findUnique({ where: { id }, select: { code: true } });
  return { title: q?.code ?? "Inquiry" };
}

export const dynamic = "force-dynamic";

export default async function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inquiry:read");
  const { id } = await params;

  const inquiry = await prisma.purchaseInquiry.findUnique({
    where: { id },
    include: {
      requisition: { select: { id: true, code: true, purpose: true } },
      raisedBy: { select: { name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { material: { select: { id: true, code: true, name: true, grade: true, currentPricePerKg: true } } },
      },
      vendors: {
        include: { vendor: { select: { id: true, name: true, city: true, rating: true } } },
      },
      quotations: {
        include: {
          vendor: { select: { id: true, name: true, city: true, rating: true } },
          selectedBy: { select: { name: true } },
          lines: true,
          orders: { select: { id: true, code: true } },
        },
        orderBy: { totalValue: "asc" },
      },
    },
  });

  if (!inquiry) notFound();

  // The data-layer half of the keyhole, in two parts.
  //
  // Being invited is necessary but not sufficient: the comparison is the one
  // screen in the app that holds every vendor's price side by side, so a vendor
  // reading it would be reading its competitors' rate cards. Scope the
  // quotations to its own before anything renders them.
  const viewerIsVendor = isVendor(user.role);
  if (viewerIsVendor) {
    const invited = inquiry.vendors.some((v) => v.vendorId === user.vendorId);
    if (!invited) redirect("/denied?need=this+inquiry");
    inquiry.quotations = inquiry.quotations.filter((q) => q.vendorId === user.vendorId);
    inquiry.vendors = inquiry.vendors.filter((v) => v.vendorId === user.vendorId);
  }

  const selected = inquiry.quotations.find((q) => q.status === "SELECTED");
  const order = selected?.orders[0];
  const totalQty = inquiry.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const silent = inquiry.vendors.filter(
    (v) => !inquiry.quotations.some((q) => q.vendorId === v.vendorId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/inquiries"
        backLabel="Inquiries"
        code={inquiry.code}
        title={inquiry.requisition?.purpose ?? "Purchase inquiry"}
        status={<Chip tone={inquiryStatusTone(inquiry.status)}>{titleise(inquiry.status)}</Chip>}
        meta={[
          { label: "Issued", value: date(inquiry.issuedOn) },
          { label: "Due", value: date(inquiry.dueOn) },
          { label: "Lines", value: String(inquiry.lines.length) },
          { label: "Quantity", value: kg(totalQty) },
          // How many rivals replied is competitive information in itself.
          viewerIsVendor
            ? { label: "Your quotation", value: inquiry.quotations[0]?.code ?? "Not submitted" }
            : { label: "Responses", value: `${inquiry.quotations.length} of ${inquiry.vendors.length}` },
        ]}
      />

      <DocChain
        current={selected ? "comparison" : "inquiry"}
        links={{
          ...(inquiry.requisition && {
            requisition: { code: inquiry.requisition.code, href: `/procurement/requisitions/${inquiry.requisition.id}` },
          }),
          inquiry: { code: inquiry.code, href: `/procurement/inquiries/${inquiry.id}` },
          ...(inquiry.quotations.length > 0 && {
            quotation: { code: `${inquiry.quotations.length} in`, href: `/procurement/inquiries/${inquiry.id}` },
          }),
          ...(selected && { comparison: { code: selected.code, href: `/procurement/inquiries/${inquiry.id}` } }),
          ...(order && { order: { code: order.code, href: `/procurement/orders/${order.id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            <Comparison
              inquiryId={inquiry.id}
              status={inquiry.status}
              viewerIsVendor={viewerIsVendor}
              canSelect={can(user.role, "quote:select")}
              canOrder={can(user.role, "po:write")}
              lines={inquiry.lines.map((l) => ({
                id: l.id,
                lineNo: l.lineNo,
                materialId: l.material.id,
                materialCode: l.material.code,
                materialName: l.material.name,
                grade: l.material.grade ?? "",
                quantityKg: Number(l.quantityKg),
                baseRate: Number(l.material.currentPricePerKg ?? 0),
              }))}
              quotes={inquiry.quotations.map((q) => ({
                id: q.id,
                code: q.code,
                status: q.status,
                vendorId: q.vendor.id,
                vendorName: q.vendor.name,
                vendorCity: q.vendor.city ?? "—",
                rating: Number(q.vendor.rating),
                receivedOn: q.receivedOn.toISOString(),
                validUntil: q.validUntil?.toISOString() ?? null,
                leadTimeDays: q.leadTimeDays,
                subtotal: Number(q.subtotal),
                freight: Number(q.freight),
                totalValue: Number(q.totalValue),
                decisionNote: q.decisionNote ?? "",
                selectedBy: q.selectedBy?.name ?? "",
                orderId: q.orders[0]?.id ?? null,
                orderCode: q.orders[0]?.code ?? null,
                rates: Object.fromEntries(
                  q.lines.map((ql) => [
                    ql.inquiryLineId ?? ql.materialId,
                    { rate: Number(ql.ratePerKg), qty: Number(ql.quantityKg), total: Number(ql.lineTotal), leadDays: ql.leadDays },
                  ]),
                ),
              }))}
            />

            {/* Who else was asked, and who stayed quiet, is ours — not theirs. */}
            {!viewerIsVendor && silent.length > 0 && (
              <Section
                title="No response"
                hint={`${silent.length} of ${inquiry.vendors.length} invited`}
                padded={false}
              >
                <MiniTable head={[{ label: "Vendor" }, { label: "City" }, { label: "Sent" }, { label: "Rating", align: "right" }]}>
                  {silent.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <Link href={`/procurement/vendors/${v.vendor.id}`} className="ref-link">{v.vendor.name}</Link>
                      </Td>
                      <Td muted>{v.vendor.city ?? "—"}</Td>
                      <Td muted>{date(v.sentAt)}</Td>
                      <Td align="right" num muted>{Number(v.vendor.rating).toFixed(1)}</Td>
                    </Tr>
                  ))}
                </MiniTable>
                <p className="border-t border-edge px-3 py-1.5 text-[11px] text-muted">
                  Kept on the record deliberately — a vendor that stops quoting is worth knowing about at rating time.
                </p>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Inquiry">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Against",
                    value: inquiry.requisition ? (
                      <Link href={`/procurement/requisitions/${inquiry.requisition.id}`} className="ref-link font-num">
                        {inquiry.requisition.code}
                      </Link>
                    ) : "Raised directly",
                  },
                  { label: "Issued on", value: dateTime(inquiry.issuedOn) },
                  { label: "Quotes due", value: date(inquiry.dueOn) },
                  { label: "Raised by", value: inquiry.raisedBy?.name ?? "—" },
                  ...(viewerIsVendor
                    ? []
                    : [{ label: "Invited", value: `${inquiry.vendors.length} vendors` }]),
                ]}
              />
            </Section>

            {inquiry.terms && (
              <Section title="Terms sent">
                <p className="text-[12px] leading-relaxed text-ink">{inquiry.terms}</p>
              </Section>
            )}

            <Section title="What was asked" padded={false}>
              <MiniTable head={[{ label: "Material" }, { label: "Quantity", align: "right" }]}>
                {inquiry.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      <Link href={`/procurement/materials/${l.material.id}`} className="ref-link">{l.material.name}</Link>
                      <span className="block font-num text-[11px] text-muted">{l.material.code}</span>
                    </Td>
                    <Td align="right" num>{kg(Number(l.quantityKg))}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
          </>
        }
      />
    </div>
  );
}
