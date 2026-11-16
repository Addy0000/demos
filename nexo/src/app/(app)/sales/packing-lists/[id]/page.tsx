import type { Metadata } from "next";
import { getTenant } from "@/lib/tenant-server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { kg, kgPlain, date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid } from "@/components/detail/record";
import { DocChain } from "@/components/detail/doc-chain";
import { Chip, packingListTone } from "@/components/ui/chip";
import { PackingEditor, type ChallanLineOption, type PackageDraft } from "./packing-editor";
import { PrintButton } from "./print-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const pl = await prisma.packingList.findUnique({ where: { id }, select: { code: true } });
  return { title: pl?.code ?? "Packing list" };
}

export const dynamic = "force-dynamic";

export default async function PackingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const COMPANY = await getTenant();
  const user = await requirePermission("dispatch:read");
  const { id } = await params;

  const pl = await prisma.packingList.findUnique({
    where: { id },
    include: {
      challan: {
        include: {
          customer: {
            select: { id: true, name: true, code: true, addressLine1: true, addressLine2: true, city: true, state: true, pincode: true, gstin: true },
          },
          salesOrder: {
            select: {
              id: true,
              code: true,
              customerPoNo: true,
              quotation: {
                select: {
                  id: true,
                  code: true,
                  costSheet: { select: { id: true, code: true } },
                  inquiry: { select: { id: true, code: true } },
                },
              },
            },
          },
          lines: {
            orderBy: { lineNo: "asc" },
            include: {
              batch: { select: { id: true, batchNo: true, lotRef: true } },
              salesOrderLine: {
                select: {
                  project: { select: { id: true, name: true, code: true, application: true } },
                },
              },
            },
          },
        },
      },
      packages: {
        orderBy: { packageNo: "asc" },
        include: {
          lines: {
            include: {
              challanLine: {
                include: {
                  batch: { select: { batchNo: true } },
                  salesOrderLine: {
                    select: {
                      project: { select: { name: true, code: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!pl) notFound();

  let finalizedByName: string | null = null;
  if (pl.finalizedById) {
    const u = await prisma.user.findUnique({ where: { id: pl.finalizedById }, select: { name: true } });
    finalizedByName = u?.name ?? pl.finalizedById;
  }

  const challan = pl.challan;
  const so = challan.salesOrder;

  // Prepare options for the draft editor
  const challanLineOptions: ChallanLineOption[] = challan.lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    quantityKg: Number(l.quantityKg),
    itemName: l.salesOrderLine.project.name,
    itemCode: l.salesOrderLine.project.code,
    batchNo: l.batch?.batchNo ?? null,
    lotRef: l.batch?.lotRef ?? null,
  }));

  const initialPackages: PackageDraft[] = pl.packages.map((p) => ({
    packageNo: p.packageNo,
    packageType: p.packageType ?? "carton",
    grossKg: Number(p.grossKg),
    tareKg: Number(p.tareKg),
    lines: p.lines.map((l) => ({
      challanLineId: l.challanLineId,
      quantityKg: Number(l.quantityKg),
    })),
  }));

  // Summary stats for read-only / FINAL view
  const totalPackages = pl.packages.length;
  const totalGrossKg = pl.packages.reduce((acc, p) => acc + Number(p.grossKg), 0);
  const totalTareKg = pl.packages.reduce((acc, p) => acc + Number(p.tareKg), 0);
  const totalNetKg = pl.packages.reduce(
    (acc, p) => acc + p.lines.reduce((lacc, l) => lacc + Number(l.quantityKg), 0),
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="print:hidden">
        <RecordHeader
          backHref="/sales/packing-lists"
          backLabel="Packing lists"
          code={pl.code}
          title={challan.customer.name}
          status={<Chip tone={packingListTone(pl.status)}>{titleise(pl.status)}</Chip>}
          actions={pl.status === "FINAL" ? <PrintButton /> : undefined}
          meta={[
            {
              label: "Challan",
              value: (
                <Link href={`/sales/dispatch/${challan.id}`} className="ref-link font-num">
                  {challan.code}
                </Link>
              ),
            },
            {
              label: "Order",
              value: (
                <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">
                  {so.code}
                </Link>
              ),
            },
            {
              label: "Customer",
              value: (
                <Link href={`/customers/${challan.customer.id}`} className="ref-link">
                  {challan.customer.name}
                </Link>
              ),
            },
            { label: "Created", value: date(pl.createdAt) },
            { label: "Finalized by", value: finalizedByName ?? "—" },
            { label: "Finalized at", value: pl.finalizedAt ? dateTime(pl.finalizedAt) : "—" },
          ]}
        />
      </div>

      <div className="print:hidden">
        <DocChain
          chain="sales"
          current="packinglist"
          links={{
            ...(so.quotation?.inquiry && {
              sinquiry: { code: so.quotation.inquiry.code, href: `/sales/inquiries/${so.quotation.inquiry.id}` },
            }),
            ...(so.quotation?.costSheet && {
              costsheet: { code: so.quotation.costSheet.code, href: `/sales/cost-sheets/${so.quotation.costSheet.id}` },
            }),
            ...(so.quotation && { squotation: { code: so.quotation.code, href: `/sales/quotations/${so.quotation.id}` } }),
            sorder: { code: so.code, href: `/sales/orders/${so.id}` },
            dispatch: { code: challan.code, href: `/sales/dispatch/${challan.id}` },
            packinglist: { code: pl.code, href: `/sales/packing-lists/${pl.id}` },
          }}
        />
      </div>

      <RecordBody
        main={
          <>
            {pl.status === "DRAFT" ? (
              <Section title="Packaging editor" hint="Allocate challan quantities into packages">
                <PackingEditor
                  packingListId={pl.id}
                  canWrite={can(user.role, "dispatch:write")}
                  challanLines={challanLineOptions}
                  initialPackages={initialPackages}
                />
              </Section>
            ) : (
              <div className="space-y-4">
                {/* Print Action Bar (hidden on print) */}
                <div className="flex items-center justify-between border-b border-edge pb-3 print:hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Official Document:</span>
                    <span className="font-num text-xs font-semibold text-ink">{pl.code}</span>
                    <span className="text-muted text-xs">·</span>
                    <Chip tone={packingListTone(pl.status)}>{titleise(pl.status)}</Chip>
                    <span className="text-xs text-muted ml-2">
                      Finalized on {pl.finalizedAt ? dateTime(pl.finalizedAt) : date(pl.createdAt)}
                    </span>
                  </div>
                  <PrintButton />
                </div>

                {/* Printable Packing List Document Layout */}
                <div data-print-document className="rounded border border-edge bg-surface p-8 shadow-xs print:border-none print:p-0 print:shadow-none print:bg-white text-ink">
                  {/* Banner / Title Header */}
                  <div className="mb-6 flex items-start justify-between border-b-2 border-primary pb-4">
                    <div>
                      <h1 className="text-xl font-bold tracking-tight text-primary uppercase">PACKING LIST</h1>
                      <p className="text-xs text-muted">{COMPANY.name} — Despatch &amp; Packaging Documentation</p>
                    </div>
                    <div className="text-right">
                      <div className="inline-block rounded bg-primary/10 px-3 py-1 font-num text-xs font-bold text-primary border border-primary/25">
                        {pl.code}
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        Date: <span className="font-num font-semibold text-ink">{date(pl.finalizedAt ?? pl.createdAt)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Document Details: Customer, Challan, Sales Order, Vehicle/LR */}
                  <div className="mb-6 grid grid-cols-2 gap-6 text-xs">
                    <div>
                      <h2 className="font-semibold text-muted uppercase tracking-wider text-[11px] mb-1">Customer / Consignee</h2>
                      <p className="font-bold text-ink text-sm">{challan.customer.name}</p>
                      <p className="text-muted leading-relaxed mt-0.5">
                        {[challan.customer.addressLine1, challan.customer.addressLine2, challan.customer.city, challan.customer.state, challan.customer.pincode]
                          .filter(Boolean)
                          .join(", ") || "Address on file"}
                      </p>
                      {challan.customer.gstin && (
                        <p className="mt-1 font-num text-ink">
                          <span className="text-muted">GSTIN: </span>{challan.customer.gstin}
                        </p>
                      )}
                    </div>

                    <div className="text-right space-y-1">
                      <div>
                        <span className="text-muted">Delivery Challan: </span>
                        <span className="font-num font-semibold text-ink">{challan.code}</span>
                      </div>
                      <div>
                        <span className="text-muted">Sales Order: </span>
                        <span className="font-num font-semibold text-ink">{so.code}</span>
                        {so.customerPoNo && <span className="ml-1 text-muted font-num">(PO: {so.customerPoNo})</span>}
                      </div>
                      {challan.vehicleNo && (
                        <div>
                          <span className="text-muted">Vehicle No: </span>
                          <span className="font-num font-semibold text-ink">{challan.vehicleNo}</span>
                        </div>
                      )}
                      {challan.lrNo && (
                        <div>
                          <span className="text-muted">LR No: </span>
                          <span className="font-num font-semibold text-ink">{challan.lrNo}</span>
                        </div>
                      )}
                      {finalizedByName && (
                        <div>
                          <span className="text-muted">Finalized by: </span>
                          <span className="text-ink">{finalizedByName}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Packages Table */}
                  <div className="mb-6 overflow-hidden rounded border border-edge">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-faint border-b border-edge font-semibold text-ink">
                        <tr>
                          <th className="py-2.5 px-3 w-16 text-center">Pkg #</th>
                          <th className="py-2.5 px-3 w-24">Type</th>
                          <th className="py-2.5 px-3">Items in package (Item / Batch, kg)</th>
                          <th className="py-2.5 px-3 text-right w-24">Tare (kg)</th>
                          <th className="py-2.5 px-3 text-right w-24">Gross (kg)</th>
                          <th className="py-2.5 px-3 text-right w-24">Net (kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-edge">
                        {pl.packages.map((pkg) => {
                          const netKg = pkg.lines.reduce((sum, l) => sum + Number(l.quantityKg), 0);
                          return (
                            <tr key={pkg.id}>
                              <td className="py-2.5 px-3 text-center font-num font-semibold text-ink">
                                #{pkg.packageNo}
                              </td>
                              <td className="py-2.5 px-3 text-muted capitalize">
                                {pkg.packageType ?? "carton"}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="space-y-1">
                                  {pkg.lines.map((l) => (
                                    <div key={l.id} className="flex items-center justify-between text-xs">
                                      <div>
                                        <span className="font-medium text-ink">
                                          {l.challanLine.salesOrderLine.project.name}
                                        </span>
                                        <span className="ml-1 font-num text-[11px] text-muted">
                                          ({l.challanLine.salesOrderLine.project.code})
                                        </span>
                                        {l.challanLine.batch && (
                                          <span className="ml-1.5 font-num text-[11px] text-muted">
                                            · Batch: <span className="text-ink font-medium">{l.challanLine.batch.batchNo}</span>
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-num font-semibold text-ink">
                                        {kgPlain(Number(l.quantityKg))} kg
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-num text-muted">
                                {kgPlain(Number(pkg.tareKg))}
                              </td>
                              <td className="py-2.5 px-3 text-right font-num font-semibold text-ink">
                                {kgPlain(Number(pkg.grossKg))}
                              </td>
                              <td className="py-2.5 px-3 text-right font-num font-semibold text-ink">
                                {kgPlain(netKg)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-faint border-t-2 border-edge font-semibold text-ink">
                        <tr>
                          <td colSpan={3} className="py-2.5 px-3 text-xs">
                            Total: {totalPackages} {totalPackages === 1 ? "package" : "packages"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-num text-muted">
                            {kgPlain(totalTareKg)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-num font-bold">
                            {kgPlain(totalGrossKg)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-num text-primary font-bold">
                            {kgPlain(totalNetKg)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Document Footer Totals */}
                  <div className="rounded border border-edge bg-faint p-4 text-xs flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="text-muted block uppercase tracking-wider text-[10.5px] font-semibold">Verification</span>
                      <span className="text-ink font-medium">
                        All packages verified against Delivery Challan {challan.code}.
                      </span>
                    </div>
                    <div className="flex items-center gap-6 font-num text-xs">
                      <div>
                        <span className="text-muted mr-1.5">Total Packages:</span>
                        <span className="font-bold text-ink text-sm">{totalPackages}</span>
                      </div>
                      <div>
                        <span className="text-muted mr-1.5">Total Net:</span>
                        <span className="font-bold text-primary text-sm">{kgPlain(totalNetKg)} kg</span>
                      </div>
                      <div>
                        <span className="text-muted mr-1.5">Total Gross:</span>
                        <span className="font-bold text-ink text-sm">{kgPlain(totalGrossKg)} kg</span>
                      </div>
                    </div>
                  </div>

                  {/* Remark if present */}
                  {pl.remark && (
                    <div className="mt-4 border-t border-edge pt-3 text-xs">
                      <span className="font-semibold text-muted uppercase text-[10.5px]">Remark: </span>
                      <span className="text-ink">{pl.remark}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        }
        aside={
          pl.status === "DRAFT" ? (
            <>
              <Section title="Document details">
                <FieldGrid
                  columns={1}
                  fields={[
                    {
                      label: "Challan",
                      value: (
                        <Link href={`/sales/dispatch/${challan.id}`} className="ref-link font-num">
                          {challan.code}
                        </Link>
                      ),
                    },
                    {
                      label: "Order",
                      value: (
                        <Link href={`/sales/orders/${so.id}`} className="ref-link font-num">
                          {so.code}
                        </Link>
                      ),
                    },
                    {
                      label: "Customer",
                      value: (
                        <Link href={`/customers/${challan.customer.id}`} className="ref-link">
                          {challan.customer.name}
                        </Link>
                      ),
                    },
                    { label: "Status", value: <Chip tone={packingListTone(pl.status)}>{titleise(pl.status)}</Chip> },
                    { label: "Packages", value: `${totalPackages}` },
                    { label: "Net weight", value: kg(totalNetKg) },
                    { label: "Gross weight", value: kg(totalGrossKg) },
                    { label: "Created on", value: date(pl.createdAt) },
                    { label: "Finalized by", value: finalizedByName ?? "—" },
                    { label: "Finalized on", value: pl.finalizedAt ? dateTime(pl.finalizedAt) : "—" },
                  ]}
                />
              </Section>

              {pl.remark && (
                <Section title="Remark">
                  <p className="text-[12px] leading-relaxed text-ink">{pl.remark}</p>
                </Section>
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
