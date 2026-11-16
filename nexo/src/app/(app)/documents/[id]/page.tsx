import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { date, dateTime, titleise } from "@/lib/format";
import { RecordHeader, RecordBody, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { Chip } from "@/components/ui/chip";
import { IconDocument, IconAlert } from "@/components/icons";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await prisma.document.findUnique({ where: { id }, select: { title: true } });
  return { title: d?.title ?? "Document" };
}

export const dynamic = "force-dynamic";

const TYPE_EXPLAIN: Record<string, string> = {
  TDS: "Technical Data Sheet — the declared property envelope for this compound or material.",
  SDS: "Safety Data Sheet — handling, hazard and exposure information.",
  COA: "Certificate of Analysis — measured results for a specific supplied lot.",
  ROHS: "RoHS declaration — restricted hazardous substance conformity.",
  REACH: "REACH / SVHC declaration — substances of very high concern.",
  SPEC_SHEET: "Specification sheet.",
  TEST_REPORT: "Laboratory or third-party test report.",
  DRAWING: "Drawing or dimensional reference.",
  CUSTOMER_SPEC: "The customer's own written requirement.",
  OTHER: "Supporting document.",
};

export default async function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("document:read");
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, code: true, name: true, application: true, standard: true } },
      material: { select: { id: true, code: true, name: true, grade: true, category: true } },
      vendor: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  if (!doc) notFound();

  // Sibling revisions of the same document lineage.
  const revisions = await prisma.document.findMany({
    where: {
      title: doc.title,
      id: { not: doc.id },
      ...(doc.projectId ? { projectId: doc.projectId } : {}),
      ...(doc.materialId ? { materialId: doc.materialId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, revision: true, createdAt: true, isCurrent: true },
  });

  const expired = doc.expiresOn && new Date(doc.expiresOn) < new Date();
  const attachedHref = doc.project
    ? `/projects/${doc.project.id}`
    : doc.material
      ? `/procurement/materials/${doc.material.id}`
      : doc.vendor
        ? `/procurement/vendors/${doc.vendor.id}`
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RecordHeader
        backHref="/documents"
        backLabel="Documents"
        code={doc.code}
        title={doc.title}
        status={
          <span className="flex items-center gap-1.5">
            <Chip tone={doc.type === "TDS" ? "info" : doc.type === "COA" ? "success" : "neutral"}>{titleise(doc.type)}</Chip>
            <Chip tone={doc.isCurrent ? "success" : "neutral"}>{doc.isCurrent ? "Current" : "Superseded"}</Chip>
          </span>
        }
        meta={[
          { label: "Revision", value: doc.revision },
          { label: "Issued", value: date(doc.issuedOn) },
          { label: "Expires", value: doc.expiresOn ? <span className={expired ? "text-danger" : ""}>{date(doc.expiresOn)}</span> : "—" },
          {
            label: "Attached to",
            value: attachedHref ? (
              <Link href={attachedHref} className="ref-link">
                {doc.project?.name ?? doc.material?.name ?? doc.vendor?.name}
              </Link>
            ) : "Unattached",
          },
        ]}
      />

      <RecordBody
        main={
          <>
            {expired && (
              <div className="flex items-start gap-2 border border-danger/35 bg-danger-bg px-3 py-2.5">
                <IconAlert size={15} className="mt-px shrink-0 text-danger" />
                <p className="text-[12.5px] leading-snug text-ink">
                  This document expired on {date(doc.expiresOn)}. Request a current revision from the
                  issuer before relying on it for supply or compliance.
                </p>
              </div>
            )}

            <Section title="File">
              {/* No real file store in the demo build — this states that plainly
                  rather than pretending to render a document. */}
              <div className="flex items-center gap-3 py-2">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded border border-edge bg-faint text-nav-dim">
                  <IconDocument size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-num text-[12.5px] font-medium text-ink">{doc.fileName}</p>
                  <p className="text-[11.5px] text-muted">
                    {doc.mimeType} · {doc.fileSize > 1_048_576 ? `${(doc.fileSize / 1_048_576).toFixed(1)} MB` : `${Math.round(doc.fileSize / 1024)} KB`}
                  </p>
                </div>
                <span className="shrink-0 rounded-sm bg-warning-bg px-2 py-1 text-[11px] text-ink">
                  Demo build — no file store attached
                </span>
              </div>
              <p className="border-t border-edge/60 pt-2 text-[11.5px] leading-relaxed text-muted">
                {TYPE_EXPLAIN[doc.type]}
              </p>
            </Section>

            {revisions.length > 0 && (
              <Section title="Revision history" hint={`${revisions.length} other revision${revisions.length === 1 ? "" : "s"}`} padded={false}>
                <MiniTable
                  head={[
                    { label: "Revision", width: "90px" },
                    { label: "Created" },
                    { label: "State", width: "120px" },
                  ]}
                >
                  {revisions.map((r) => (
                    <Tr key={r.id}>
                      <Td>
                        <Link href={`/documents/${r.id}`} className="ref-link font-num">{r.revision}</Link>
                      </Td>
                      <Td num muted>{dateTime(r.createdAt)}</Td>
                      <Td><Chip tone={r.isCurrent ? "success" : "neutral"}>{r.isCurrent ? "Current" : "Superseded"}</Chip></Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <Section title="Details">
              <FieldGrid
                columns={1}
                fields={[
                  { label: "Document code", value: <span className="font-num">{doc.code}</span> },
                  { label: "Type", value: titleise(doc.type) },
                  { label: "Revision", value: doc.revision },
                  { label: "Issued on", value: date(doc.issuedOn) },
                  { label: "Expires on", value: doc.expiresOn ? date(doc.expiresOn) : "No expiry" },
                  { label: "Uploaded by", value: doc.uploadedBy?.name ?? "—" },
                  { label: "Uploaded", value: dateTime(doc.createdAt) },
                ]}
              />
            </Section>

            {doc.project && (
              <Section title="Project context">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Project", value: <Link href={`/projects/${doc.project.id}`} className="ref-link">{doc.project.code}</Link> },
                    { label: "Compound", value: doc.project.name },
                    { label: "Application", value: doc.project.application },
                    { label: "Standard", value: doc.project.standard ?? "—" },
                  ]}
                />
              </Section>
            )}

            {doc.material && (
              <Section title="Material context">
                <FieldGrid
                  columns={1}
                  fields={[
                    { label: "Material", value: <Link href={`/procurement/materials/${doc.material.id}`} className="ref-link">{doc.material.code}</Link> },
                    { label: "Name", value: doc.material.name },
                    { label: "Grade", value: doc.material.grade ?? "—" },
                    { label: "Category", value: titleise(doc.material.category) },
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
