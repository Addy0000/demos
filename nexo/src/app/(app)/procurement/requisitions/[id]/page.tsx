import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { money, amount, kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, requisitionStatusTone, inquiryStatusTone, poStatusTone } from "@/components/ui/chip";
import { RequisitionActions } from "./requisition-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await prisma.purchaseRequisition.findUnique({ where: { id }, select: { code: true } });
  return { title: r?.code ?? "Requisition" };
}

export const dynamic = "force-dynamic";

export default async function RequisitionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("req:read");
  const { id } = await params;

  const req = await prisma.purchaseRequisition.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { id: true, name: true } },
      approvedBy: { select: { name: true } },
      project: { select: { id: true, name: true, code: true } },
      lines: {
        orderBy: { lineNo: "asc" },
        include: {
          material: {
            select: { id: true, code: true, name: true, grade: true, uom: true, currentPricePerKg: true, reorderLevelKg: true },
          },
        },
      },
      inquiries: {
        orderBy: { issuedOn: "desc" },
        include: { _count: { select: { vendors: true, quotations: true } } },
      },
      orders: {
        orderBy: { orderedOn: "desc" },
        include: { vendor: { select: { name: true } } },
      },
    },
  });

  if (!req) notFound();

  const wanted = req.lines.reduce((a, l) => a + Number(l.quantityKg), 0);
  const ordered = req.lines.reduce((a, l) => a + Number(l.orderedKg), 0);
  const estimate = req.lines.reduce(
    (a, l) => a + Number(l.quantityKg) * Number(l.material.currentPricePerKg ?? 0),
    0,
  );

  const firstInquiry = req.inquiries[0];
  const firstOrder = req.orders[0];

  // Vendors who can actually supply what is being asked for — the shortlist the
  // inquiry will go to, computed here rather than made the operator's problem.
  const candidates = await prisma.vendor.findMany({
    where: {
      status: "ACTIVE",
      materials: { some: { materialId: { in: req.lines.map((l) => l.materialId) } } },
    },
    select: {
      id: true, code: true, name: true, city: true, rating: true,
      materials: { where: { materialId: { in: req.lines.map((l) => l.materialId) } }, select: { materialId: true } },
    },
    orderBy: { rating: "desc" },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/requisitions"
        backLabel="Requisitions"
        code={req.code}
        title={req.purpose ?? "Purchase requisition"}
        status={<Chip tone={requisitionStatusTone(req.status)}>{titleise(req.status)}</Chip>}
        actions={
          <RequisitionActions
            requisitionId={req.id}
            status={req.status}
            canWrite={can(user.role, "req:write")}
            canApprove={can(user.role, "req:approve")}
            canInquire={can(user.role, "inquiry:write")}
            canOrder={can(user.role, "po:write")}
            isOwnRequisition={req.raisedBy?.id === user.id}
            hasInquiry={req.inquiries.length > 0}
            candidates={candidates.map((v) => ({
              id: v.id,
              name: v.name,
              city: v.city ?? "—",
              rating: Number(v.rating),
              covers: v.materials.length,
            }))}
            lineCount={req.lines.length}
          />
        }
        meta={[
          { label: "Raised", value: date(req.createdAt) },
          { label: "Required by", value: date(req.requiredBy) },
          { label: "Lines", value: String(req.lines.length) },
          { label: "Quantity", value: kg(wanted) },
          { label: "Est. value", value: <span className="font-num">{money(estimate)}</span> },
        ]}
      />

      <DocChain
        current="requisition"
        links={{
          requisition: { code: req.code, href: `/procurement/requisitions/${req.id}` },
          ...(firstInquiry && { inquiry: { code: firstInquiry.code, href: `/procurement/inquiries/${firstInquiry.id}` } }),
          ...(firstOrder && { order: { code: firstOrder.code, href: `/procurement/orders/${firstOrder.id}` } }),
        }}
      />

      <RecordBody
        main={
          <>
            {req.status === "REJECTED" && req.decisionNote && (
              <div className="border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-ink">
                <span className="font-semibold">Rejected.</span> {req.decisionNote}
              </div>
            )}

            <Section
              title="What was asked for"
              hint={`${req.lines.length} ${req.lines.length === 1 ? "line" : "lines"}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "#" }, { label: "Material" }, { label: "Stock then", align: "right" },
                  { label: "Wanted", align: "right" }, { label: "Ordered", align: "right" },
                  { label: "Open", align: "right" }, { label: "Est. value", align: "right" },
                ]}
              >
                {req.lines.map((l) => {
                  const want = Number(l.quantityKg);
                  const got = Number(l.orderedKg);
                  const open = Math.max(0, want - got);
                  const rate = Number(l.material.currentPricePerKg ?? 0);
                  return (
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
                      <Td align="right" num muted>
                        {l.stockAtRaiseKg === null ? "—" : kgPlain(Number(l.stockAtRaiseKg))}
                      </Td>
                      <Td align="right" num>{kgPlain(want)}</Td>
                      <Td align="right" num muted>{got > 0 ? kgPlain(got) : "—"}</Td>
                      <Td align="right" num className={open > 0 ? "text-warning" : "text-success"}>
                        {open > 0 ? kgPlain(open) : "covered"}
                      </Td>
                      <Td align="right" num muted>{rate > 0 ? amount(want * rate) : "—"}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
              <div className="flex items-center justify-between border-t border-edge bg-faint px-3 py-1.5">
                <span className="text-[11.5px] text-muted">
                  Estimate at the current approved rate. The committed figure arrives with the quotations.
                </span>
                <span className="font-num text-[12.5px] font-semibold tabular-nums text-ink">{money(estimate)}</span>
              </div>
            </Section>

            <Section
              title="Sourcing"
              hint={req.inquiries.length === 0 ? "No inquiry raised yet" : `${req.inquiries.length} ${req.inquiries.length === 1 ? "inquiry" : "inquiries"}`}
              padded={false}
            >
              <MiniTable
                head={[
                  { label: "Inquiry" }, { label: "Status" }, { label: "Issued" },
                  { label: "Due" }, { label: "Vendors", align: "right" }, { label: "Quotes", align: "right" },
                ]}
                empty={
                  req.status === "APPROVED"
                    ? "Approved and waiting. Raise an inquiry to put it to the market."
                    : "Nothing has gone out against this requisition."
                }
              >
                {req.inquiries.map((q) => (
                  <Tr key={q.id}>
                    <Td>
                      <Link href={`/procurement/inquiries/${q.id}`} className="ref-link font-num">{q.code}</Link>
                    </Td>
                    <Td><Chip tone={inquiryStatusTone(q.status)}>{titleise(q.status)}</Chip></Td>
                    <Td muted>{date(q.issuedOn)}</Td>
                    <Td muted>{date(q.dueOn)}</Td>
                    <Td align="right" num>{q._count.vendors}</Td>
                    <Td align="right" num className={q._count.quotations === 0 ? "text-muted" : ""}>
                      {q._count.quotations}
                    </Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>

            {req.orders.length > 0 && (
              <Section title="Orders raised" hint={`${req.orders.length}`} padded={false}>
                <MiniTable
                  head={[{ label: "Order" }, { label: "Status" }, { label: "Vendor" }, { label: "Ordered" }, { label: "Value", align: "right" }]}
                >
                  {req.orders.map((o) => (
                    <Tr key={o.id}>
                      <Td><Link href={`/procurement/orders/${o.id}`} className="ref-link font-num">{o.code}</Link></Td>
                      <Td><Chip tone={poStatusTone(o.status)}>{titleise(o.status)}</Chip></Td>
                      <Td muted>{o.vendor.name}</Td>
                      <Td muted>{date(o.orderedOn)}</Td>
                      <Td align="right" num>{money(o.totalValue)}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Requisition">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Purpose", value: req.purpose ?? "—" },
                  { label: "Required by", value: date(req.requiredBy) },
                  {
                    label: "Project",
                    value: req.project ? (
                      <Link href={`/projects/${req.project.id}`} className="ref-link">{req.project.name}</Link>
                    ) : "—",
                  },
                  { label: "Raised by", value: req.raisedBy?.name ?? "—" },
                  { label: "Raised on", value: dateTime(req.createdAt) },
                  { label: "Approved by", value: req.approvedBy?.name ?? "—" },
                  { label: "Approved on", value: req.approvedAt ? dateTime(req.approvedAt) : "—" },
                ]}
              />
            </Section>

            <Section title="Coverage">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Wanted", value: <span className="font-num">{kg(wanted)}</span> },
                  { label: "Ordered", value: <span className="font-num">{kg(ordered)}</span> },
                  {
                    label: "Still open",
                    value: (
                      <span className={`font-num ${wanted - ordered > 0 ? "text-warning" : "text-success"}`}>
                        {wanted - ordered > 0 ? kg(wanted - ordered) : "Fully covered"}
                      </span>
                    ),
                  },
                ]}
              />
            </Section>

            {req.decisionNote && req.status !== "REJECTED" && (
              <Section title="Decision note">
                <p className="text-[12px] leading-relaxed text-ink">{req.decisionNote}</p>
              </Section>
            )}
          </>
        }
      />
    </div>
  );
}
