import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, salesQuotationTone, costSheetTone, marginTone, salesOrderTone } from "@/components/ui/chip";
import { QuotationActions } from "./quotation-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const q = await prisma.salesQuotation.findUnique({ where: { id }, select: { code: true } });
  return { title: q?.code ?? "Sales quotation" };
}

export const dynamic = "force-dynamic";

export default async function QuotationDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("squote:read");
  const { id } = await params;

  const q = await prisma.salesQuotation.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, city: true, state: true, creditDays: true } },
      inquiry: { select: { id: true, code: true, requiredBy: true } },
      costSheet: {
        select: {
          id: true, code: true, status: true, marginPct: true, sellingRatePerKg: true,
          materialCostPerKg: true, conversionPerKg: true, overheadPct: true,
        },
      },
      owner: { select: { name: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: { project: { select: { id: true, code: true, name: true, application: true, targetPricePerKg: true } } },
      },
      orders: { select: { id: true, code: true, status: true, orderedOn: true, totalValue: true } },
    },
  });

  if (!q) notFound();

  const canSeeMargin = can(user.role, "costsheet:read");
  const qty = q.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const revenue = q.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.ratePerKg), 0);
  const cost = q.lines.reduce((a, l) => a + Number(l.quantityKg) * Number(l.costPerKg ?? 0), 0);
  const realised = revenue > 0 && cost > 0 ? ((revenue - cost) / revenue) * 100 : null;
  const cs = q.costSheet;
  const order = q.orders[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/sales/quotations"
        backLabel="Quotations"
        code={q.code}
        title={q.customer.name}
        status={<Chip tone={salesQuotationTone(q.status)}>{titleise(q.status)}</Chip>}
        actions={
          <QuotationActions
            quotationId={q.id}
            status={q.status}
            canOrder={can(user.role, "so:write")}
            existingOrder={order ? { id: order.id, code: order.code } : null}
            costSheetUnsigned={Boolean(cs && cs.status !== "APPROVED")}
            costSheetCode={cs?.code ?? null}
          />
        }
        meta={[
          { label: "Issued", value: date(q.issuedOn) },
          { label: "Valid to", value: date(q.validUntil) },
          { label: "Quantity", value: kg(qty) },
          { label: "Value", value: <span className="font-num">{money(q.totalValue)}</span> },
          ...(canSeeMargin && realised !== null
            ? [{ label: "Margin", value: <Chip tone={marginTone(realised)}>{realised.toFixed(1)}%</Chip> }]
            : []),
        ]}
      />

      <DocChain
        chain="sales"
        current="squotation"
        links={{
          ...(q.inquiry && { sinquiry: { code: q.inquiry.code, href: `/sales/inquiries/${q.inquiry.id}` } }),
          ...(cs && { costsheet: { code: cs.code, href: `/sales/cost-sheets/${cs.id}` } }),
          squotation: { code: q.code, href: `/sales/quotations/${q.id}` },
          ...(order && { sorder: { code: order.code, href: `/sales/orders/${order.id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            {cs && cs.status !== "APPROVED" && (
              <div className="border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] leading-relaxed text-ink">
                <span className="font-semibold">Margin not signed.</span> This quotation rests on cost sheet{" "}
                <Link href={`/sales/cost-sheets/${cs.id}`} className="ref-link font-num">{cs.code}</Link>, which is{" "}
                {cs.status.toLowerCase().replace(/_/g, " ")}. An order cannot be taken against it until Finance approves the margin.
              </div>
            )}

            <Section title="Quoted lines" hint={`${q.lines.length} ${q.lines.length === 1 ? "line" : "lines"}`} padded={false}>
              <MiniTable
                head={[
                  { label: "#" }, { label: "Compound" }, { label: "Quantity", align: "right" },
                  { label: "Rate", align: "right" },
                  ...(canSeeMargin ? [{ label: "Cost", align: "right" as const }, { label: "Margin", align: "right" as const }] : []),
                  { label: "Line total", align: "right" as const },
                ]}
              >
                {q.lines.map((l) => {
                  const rate = Number(l.ratePerKg);
                  const c = Number(l.costPerKg ?? 0);
                  const m = rate > 0 && c > 0 ? ((rate - c) / rate) * 100 : null;
                  return (
                    <Tr key={l.id}>
                      <Td num muted>{l.lineNo}</Td>
                      <Td>
                        <Link href={`/projects/${l.project.id}`} className="ref-link">{l.project.name}</Link>
                        <span className="block text-[11px] text-muted">
                          {l.project.code} · {l.project.application}
                        </span>
                      </Td>
                      <Td align="right" num>{kgPlain(Number(l.quantityKg))}</Td>
                      <Td align="right" num>₹{rate.toFixed(2)}</Td>
                      {canSeeMargin && (
                        <>
                          <Td align="right" num muted>{c > 0 ? `₹${c.toFixed(2)}` : "—"}</Td>
                          <Td align="right" num>
                            {m === null ? <span className="text-muted">—</span> : <Chip tone={marginTone(m)}>{m.toFixed(1)}%</Chip>}
                          </Td>
                        </>
                      )}
                      <Td align="right" num>{amount(Number(l.lineTotal))}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5">
                <span className="text-[11.5px] text-muted">
                  Subtotal {money(q.subtotal)} · tax {money(q.taxAmount)}
                </span>
                <span className="font-num text-[12.5px] font-semibold tabular-nums text-ink">{money(q.totalValue)}</span>
              </div>
            </Section>

            {canSeeMargin && cs && realised !== null && (
              <Section title="What was given away" hint={`Against ${cs.code}`}>
                {(() => {
                  const sheetRate = Number(cs.sellingRatePerKg);
                  const quotedAvg = qty > 0 ? revenue / qty : 0;
                  const gap = quotedAvg - sheetRate;
                  const sheetMargin = Number(cs.marginPct);
                  return (
                    <>
                      <FieldGrid
                        columns={2}
                        fields={[
                          { label: "Sheet selling rate", value: <span className="font-num">₹{sheetRate.toFixed(2)}/kg</span> },
                          { label: "Actually quoted", value: <span className="font-num">₹{quotedAvg.toFixed(2)}/kg</span> },
                          {
                            label: "Difference",
                            value: (
                              <span className={`font-num font-semibold ${gap < 0 ? "text-danger-text" : "text-success-text"}`}>
                                {gap > 0 ? "+" : ""}₹{gap.toFixed(2)}/kg
                              </span>
                            ),
                          },
                          {
                            label: "Margin: sheet → quoted",
                            value: (
                              <span className="flex items-center gap-1.5">
                                <span className="font-num text-muted">{sheetMargin.toFixed(1)}%</span>
                                <span className="text-muted">→</span>
                                <Chip tone={marginTone(realised)}>{realised.toFixed(1)}%</Chip>
                              </span>
                            ),
                          },
                        ]}
                      />
                      <p className="mt-2 text-[11px] leading-relaxed text-muted">
                        {Math.abs(gap) < 0.01
                          ? "Quoted exactly at the sheet."
                          : gap < 0
                            ? `Discounted ₹${Math.abs(gap).toFixed(2)}/kg below the sheet — ${money(Math.abs(gap) * qty)} across this quantity.`
                            : `Quoted ₹${gap.toFixed(2)}/kg above the sheet — ${money(gap * qty)} of extra contribution.`}
                      </p>
                    </>
                  );
                })()}
              </Section>
            )}

            {q.orders.length > 0 && (
              <Section title="Order raised" padded={false}>
                <MiniTable head={[{ label: "Order" }, { label: "Status" }, { label: "Ordered" }, { label: "Value", align: "right" }]}>
                  {q.orders.map((o) => (
                    <Tr key={o.id}>
                      <Td><Link href={`/sales/orders/${o.id}`} className="ref-link font-num">{o.code}</Link></Td>
                      <Td><Chip tone={salesOrderTone(o.status)}>{titleise(o.status)}</Chip></Td>
                      <Td muted>{date(o.orderedOn)}</Td>
                      <Td align="right" num>{money(Number(o.totalValue))}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Quotation">
              <FieldGrid
                columns={1}
                fields={[
                  {
                    label: "Customer",
                    value: <Link href={`/customers/${q.customer.id}`} className="ref-link">{q.customer.name}</Link>,
                  },
                  { label: "City", value: `${q.customer.city ?? "—"}${q.customer.state ? `, ${q.customer.state}` : ""}` },
                  {
                    label: "Against inquiry",
                    value: q.inquiry ? (
                      <Link href={`/sales/inquiries/${q.inquiry.id}`} className="ref-link font-num">{q.inquiry.code}</Link>
                    ) : "Raised directly",
                  },
                  {
                    label: "Cost sheet",
                    value: cs ? (
                      <span className="flex items-center gap-1.5">
                        <Link href={`/sales/cost-sheets/${cs.id}`} className="ref-link font-num">{cs.code}</Link>
                        <Chip tone={costSheetTone(cs.status)}>{titleise(cs.status)}</Chip>
                      </span>
                    ) : "None",
                  },
                  { label: "Issued on", value: dateTime(q.issuedOn) },
                  { label: "Valid until", value: date(q.validUntil) },
                  { label: "Lead time", value: q.leadTimeDays ? `${q.leadTimeDays} days` : "—" },
                  { label: "Payment terms", value: q.paymentTerms ?? "—" },
                  { label: "Delivery terms", value: q.deliveryTerms ?? "—" },
                  { label: "Owner", value: q.owner?.name ?? "—" },
                ]}
              />
            </Section>

            {q.decisionNote && (
              <Section title="Outcome">
                <p className="text-[12px] leading-relaxed text-ink">{q.decisionNote}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
