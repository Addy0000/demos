import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { DocumentsGrid } from "./documents-grid";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  await requirePermission("document:read");

  const rows = await prisma.document.findMany({
    include: {
      project: { select: { id: true, code: true, name: true } },
      material: { select: { id: true, code: true, name: true } },
      vendor: { select: { id: true, name: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
  });

  return (
    <DocumentsGrid
      rows={rows.map((d) => ({
        id: d.id,
        code: d.code,
        title: d.title,
        type: d.type,
        revision: d.revision,
        fileName: d.fileName,
        fileSize: d.fileSize,
        issuedOn: d.issuedOn?.toISOString() ?? null,
        expiresOn: d.expiresOn?.toISOString() ?? null,
        isCurrent: d.isCurrent,
        attachedTo:
          d.project?.name ?? d.material?.name ?? d.vendor?.name ?? "Unattached",
        attachedHref: d.project
          ? `/projects/${d.project.id}`
          : d.material
            ? `/procurement/materials/${d.material.id}`
            : d.vendor
              ? `/procurement/vendors/${d.vendor.id}`
              : null,
        attachedKind: d.project ? "Project" : d.material ? "Material" : d.vendor ? "Vendor" : "—",
        uploadedBy: d.uploadedBy?.name ?? "—",
        createdAt: d.createdAt.toISOString(),
      }))}
    />
  );
}
