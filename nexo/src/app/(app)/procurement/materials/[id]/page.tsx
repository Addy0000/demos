import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/rbac";
import { ratePerKg, kgPlain, kg, money, date, titleise, percent } from "@/lib/format";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { Chip, priceStatusTone, batchStatusTone, vendorStatusTone } from "@/components/ui/chip";
import { PriceTrend } from "./price-trend";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await prisma.rawMaterial.findUnique({ where: { id }, select: { name: true } });
  return { title: m?.name ?? "Material" };
}

export const dynamic = "force-dynamic";

export default async function MaterialDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("material:read");
  const { id } = await params;
  const seesPrices = can(user.role, "price:read");

  const material = await prisma.rawMaterial.findUnique({
    where: { id },
    include: {
      prices: {
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { effectiveFrom: "desc" },
        take: 60,
      },
      vendorLinks: {
        include: { vendor: { select: { id: true, code: true, name: true, status: true, rating: true } } },
      },
      batches: {
        orderBy: { receivedOn: "desc" },
        take: 40,
        include: { warehouse: { select: { name: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      formulationLines: {
        include: {
          formulation: { include: { project: { select: { id: true, code: true, name: true, stage: true } } } },
        },
      },
    },
  });

  if (!material) notFound();

  const onHand = material.batches
    .filter((b) => b.status === "AVAILABLE" || b.status === "QUARANTINE")
    .reduce((a, b) => a + Number(b.availableQtyKg), 0);
  const rate = material.currentPricePerKg ? Number(material.currentPricePerKg) : null;

  const approvedHistory = seesPrices
    ? material.prices
        .filter((p) => p.status === PriceStatus.APPROVED || p.status === PriceStatus.SUPERSEDED)
        .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
        .map((p) => ({ date: p.effectiveFrom.toISOString(), price: Number(p.pricePerKg), vendor: p.vendor.name }))
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/procurement/materials"
        backLabel="Raw materials"
        code={material.code}
        title={material.name}
        status={
          <span className="flex items-center gap-1.5">
            {material.isHazardous && <Chip tone="warning">Hazardous</Chip>}
            <Chip tone={material.isActive ? "success" : "neutral"}>{material.isActive ? "Active" : "Inactive"}</Chip>
          </span>
        }
        meta={[
          { label: "Category", value: titleise(material.category) },
          { label: "Grade", value: material.grade ?? "—" },
          ...(material.kValue ? [{ label: "K-value", value: `K${material.kValue}` }] : []),
          ...(seesPrices ? [{ label: "Current rate", value: rate ? <span className="font-num">{ratePerKg(rate)}</span> : "No rate" }] : []),
          { label: "On hand", value: <span className={onHand < Number(material.reorderLevelKg) ? "text-danger" : ""}>{kg(onHand)}</span> },
          { label: "Reorder at", value: kg(Number(material.reorderLevelKg)) },
        ]}
      />

      <RecordTabs
        storageKey="material"
        tabs={[
          {
            id: "pricing",
            label: "Pricing",
            count: seesPrices ? material.vendorLinks.length || undefined : undefined,
            content: (
          <>
            {seesPrices && approvedHistory.length > 1 && (
              <Section title="Rate history" hint={`${approvedHistory.length} approved rates`}>
                <PriceTrend points={approvedHistory} />
              </Section>
            )}

            {seesPrices && (
              <Section title="Vendor quotes" hint={`${material.vendorLinks.length} approved supplier${material.vendorLinks.length === 1 ? "" : "s"}`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Vendor" },
                    { label: "Status", width: "120px" },
                    { label: "Rating", width: "78px", align: "right" },
                    { label: "Latest rate", width: "110px", align: "right" },
                    { label: "Change", width: "92px", align: "right" },
                    { label: "State", width: "140px" },
                    { label: "Effective", width: "104px" },
                  ]}
                  empty="No approved suppliers linked to this material."
                >
                  {material.vendorLinks.map((link) => {
                    const latest = material.prices
                      .filter((p) => p.vendorId === link.vendorId)
                      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
                    return (
                      <Tr key={link.id}>
                        <Td>
                          <Link href={`/procurement/vendors/${link.vendor.id}`} className="ref-link">{link.vendor.name}</Link>
                          {link.isPreferred && <span className="ml-1.5"><Chip tone="info">Preferred</Chip></span>}
                        </Td>
                        <Td><Chip tone={vendorStatusTone(link.vendor.status)}>{titleise(link.vendor.status)}</Chip></Td>
                        <Td align="right" num muted>{Number(link.vendor.rating).toFixed(1)}</Td>
                        <Td align="right" num className="font-medium">{latest ? ratePerKg(latest.pricePerKg) : "—"}</Td>
                        <Td align="right">
                          {latest?.changePct != null ? (
                            <Chip tone={Number(latest.changePct) > 8 ? "danger" : Number(latest.changePct) > 0 ? "warning" : "success"}>
                              {percent(Number(latest.changePct), 1)}
                            </Chip>
                          ) : <span className="text-muted">—</span>}
                        </Td>
                        <Td>{latest ? <Chip tone={priceStatusTone(latest.status)}>{titleise(latest.status)}</Chip> : <span className="text-muted">No quote</span>}</Td>
                        <Td num muted>{latest ? date(latest.effectiveFrom) : "—"}</Td>
                      </Tr>
                    );
                  })}
                </MiniTable>
              </Section>
            )}

          </>
            ),
          },
          {
            id: "batches",
            label: "Batches",
            count: material.batches.length || undefined,
            content: (
            <Section title="Batches in store" hint={`${material.batches.length} most recent`} padded={false}>
              <MiniTable
                head={[
                  { label: "Batch", width: "130px" },
                  { label: "Status", width: "120px" },
                  { label: "Received kg", width: "112px", align: "right" },
                  { label: "Available kg", width: "112px", align: "right" },
                  { label: "Rate ₹/kg", width: "96px", align: "right" },
                  { label: "Location", width: "150px" },
                  { label: "Received", width: "100px" },
                  { label: "Expires", width: "100px" },
                ]}
                empty="No batches of this material in store."
              >
                {material.batches.map((b) => {
                  const expired = b.expiresOn && new Date(b.expiresOn) < new Date();
                  return (
                    <Tr key={b.id}>
                      <Td>
                        <Link href={`/procurement/inventory/${b.id}`} className="ref-link font-num">{b.batchNo}</Link>
                      </Td>
                      <Td><Chip tone={batchStatusTone(b.status)}>{titleise(b.status)}</Chip></Td>
                      <Td align="right" num muted>{kgPlain(b.receivedQtyKg)}</Td>
                      <Td align="right" num className={Number(b.availableQtyKg) > 0 ? "font-medium text-success" : "text-muted"}>
                        {kgPlain(b.availableQtyKg)}
                      </Td>
                      <Td align="right" num muted>{ratePerKg(b.ratePerKg)}</Td>
                      <Td muted>{b.warehouse.name}{b.binLocation ? ` · ${b.binLocation}` : ""}</Td>
                      <Td num muted>{date(b.receivedOn)}</Td>
                      <Td num className={expired ? "text-danger" : "text-muted"}>{b.expiresOn ? date(b.expiresOn) : "—"}</Td>
                    </Tr>
                  );
                })}
              </MiniTable>
            </Section>

            ),
          },
          {
            id: "used-in",
            label: "Used in",
            count: material.formulationLines.length || undefined,
            content: (
            <Section title="Used in formulations" hint={`${material.formulationLines.length} compound${material.formulationLines.length === 1 ? "" : "s"}`} padded={false}>
              <MiniTable
                head={[
                  { label: "Project", width: "94px" },
                  { label: "Compound" },
                  { label: "Stage", width: "150px" },
                  { label: "phr", width: "80px", align: "right" },
                  { label: "Function" },
                ]}
                empty="Not used in any formulation yet."
              >
                {material.formulationLines.map((l) => (
                  <Tr key={l.id}>
                    <Td>
                      <Link href={`/projects/${l.formulation.project.id}`} className="ref-link font-num">
                        {l.formulation.project.code}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/projects/${l.formulation.project.id}`} className="ref-link">
                        {l.formulation.project.name}
                      </Link>
                    </Td>
                    <Td muted>{titleise(l.formulation.project.stage)}</Td>
                    <Td align="right" num className="font-medium">{Number(l.phr).toFixed(2)}</Td>
                    <Td muted>{l.remark ?? "—"}</Td>
                  </Tr>
                ))}
              </MiniTable>
            </Section>
            ),
          },
          {
            id: "documents",
            label: "Documents",
            count: material.documents.length || undefined,
            content: (
              <Section title="Documents" hint={`${material.documents.length} on file`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Type", width: "110px" },
                    { label: "Document" },
                    { label: "Rev", width: "60px" },
                    { label: "Issued", width: "110px" },
                  ]}
                  empty="No documents on file. TDS and SDS from the supplier belong here."
                >
                  {material.documents.map((d) => (
                    <Tr key={d.id}>
                      <Td><Chip tone={d.type === "TDS" ? "info" : d.type === "SDS" ? "warning" : "neutral"}>{titleise(d.type)}</Chip></Td>
                      <Td>
                        <Link href={`/documents/${d.id}`} className="ref-link">{d.title}</Link>
                      </Td>
                      <Td num muted>{d.revision}</Td>
                      <Td num muted>{date(d.issuedOn)}</Td>
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
                  <Section title="Specification">
                    <FieldGrid
                      columns={2}
                      fields={[
                        { label: "Material code", value: <span className="font-num">{material.code}</span> },
                        { label: "Category", value: titleise(material.category) },
                        { label: "Grade", value: material.grade ?? "—" },
                        ...(material.kValue ? [{ label: "K-value", value: `K${material.kValue}` }] : []),
                        { label: "CAS number", value: <span className="font-num">{material.casNumber ?? "—"}</span> },
                        { label: "HSN code", value: <span className="font-num">{material.hsnCode ?? "—"}</span> },
                        { label: "Unit", value: material.uom },
                        { label: "Hazardous", value: material.isHazardous ? "Yes — handle per SDS" : "No" },
                        { label: "Key specification", value: material.specNote ?? "—", span: true },
                      ]}
                    />
                  </Section>
                }
                aside={
                  <Section title="Replenishment">
                    <FieldGrid
                      columns={1}
                      fields={[
                        {
                          label: "On hand",
                          value: (
                            <span className={onHand < Number(material.reorderLevelKg) ? "font-medium text-danger-text" : ""}>
                              {kg(onHand)}
                            </span>
                          ),
                        },
                        { label: "Reorder level", value: kg(Number(material.reorderLevelKg)) },
                        { label: "Reorder quantity", value: kg(Number(material.reorderQtyKg)) },
                        { label: "Lead time", value: `${material.leadTimeDays} days` },
                        ...(seesPrices && rate
                          ? [{ label: "Value on hand", value: <span className="font-num">{money(onHand * rate)}</span> }]
                          : []),
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
