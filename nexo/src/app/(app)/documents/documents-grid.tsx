"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { date, titleise } from "@/lib/format";
import { IconDocument } from "@/components/icons";

type Row = {
  id: string; code: string; title: string; type: string; revision: string;
  fileName: string; fileSize: number; issuedOn: string | null; expiresOn: string | null;
  isCurrent: boolean; attachedTo: string; attachedHref: string | null; attachedKind: string;
  uploadedBy: string; createdAt: string;
};

const PAGE_SIZE = 100;
const TYPES = ["TDS", "SDS", "COA", "ROHS", "REACH", "SPEC_SHEET", "TEST_REPORT", "DRAWING", "CUSTOMER_SPEC", "OTHER"];

const typeTone = (t: string) =>
  t === "TDS" ? "info" : t === "COA" ? "success" : t === "SDS" ? "warning" : t === "ROHS" || t === "REACH" ? "special" : "neutral";

const fileSize = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export function DocumentsGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (type) out = out.filter((r) => r.type === type);
    if (expiringOnly) {
      const soon = Date.now() + 90 * 86_400_000;
      out = out.filter((r) => r.expiresOn && new Date(r.expiresOn).getTime() < soon);
    }
    return out;
  }, [rows, type, expiringOnly]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const crumbs: Crumb[] = [{ label: "All documents" }];
  if (type) crumbs.push({ label: "Type =", value: type, onRemove: () => setType("") });
  if (expiringOnly) crumbs.push({ label: "Expiring within", value: "90 days", onRemove: () => setExpiringOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 100, text: (r) => r.code, render: (r) => <span className="font-num text-muted">{r.code}</span> },
    {
      key: "type", header: "Type", width: 118,
      text: (r) => r.type,
      render: (r) => <Chip tone={typeTone(r.type)}>{titleise(r.type)}</Chip>,
    },
    {
      key: "title", header: "Document", width: 330,
      text: (r) => r.title,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <IconDocument size={13} className="shrink-0 text-nav-dim" />
          <RefLink href={`/documents/${r.id}`}>{r.title}</RefLink>
        </span>
      ),
    },
    { key: "revision", header: "Rev", width: 56, align: "right", text: (r) => r.revision, render: (r) => <span className="text-muted">{r.revision}</span> },
    { key: "attachedKind", header: "Attached to", width: 90, text: (r) => r.attachedKind, render: (r) => <span className="text-muted">{r.attachedKind}</span> },
    {
      key: "attachedTo", header: "Record", width: 250,
      text: (r) => r.attachedTo,
      render: (r) => (r.attachedHref ? <RefLink href={r.attachedHref}>{r.attachedTo}</RefLink> : <span className="text-muted">{r.attachedTo}</span>),
    },
    { key: "issuedOn", header: "Issued", width: 100, text: (r) => r.issuedOn ?? "", render: (r) => <span className="text-muted">{date(r.issuedOn)}</span> },
    {
      key: "expiresOn", header: "Expires", width: 110,
      text: (r) => r.expiresOn ?? "",
      render: (r) => {
        if (!r.expiresOn) return <span className="text-muted">—</span>;
        const t = new Date(r.expiresOn).getTime();
        const expired = t < Date.now();
        const soon = t < Date.now() + 90 * 86_400_000;
        return <span className={expired ? "font-medium text-danger" : soon ? "text-warning" : "text-muted"}>{date(r.expiresOn)}</span>;
      },
    },
    { key: "fileSize", header: "Size", width: 74, align: "right", text: (r) => String(r.fileSize), render: (r) => <span className="text-muted">{fileSize(r.fileSize)}</span> },
    { key: "uploadedBy", header: "Uploaded by", width: 150, text: (r) => r.uploadedBy, render: (r) => <span className="text-muted">{r.uploadedBy}</span> },
  ];

  return (
    <ListShell
      title="Documents"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search title, record, file"
      crumbs={crumbs}
      onClearFilters={() => { setType(""); setExpiringOnly(false); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Type" value={type}
            onChange={(v) => { setType(v); setPage(0); }}
            options={TYPES.map((t) => ({ value: t, label: titleise(t) }))}
          />
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
            <input
              type="checkbox"
              checked={expiringOnly}
              onChange={(e) => { setExpiringOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Expiring soon
          </label>
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        hrefFor={(r) => `/documents/${r.id}`}
        emptyTitle="No documents match"
        emptyBody="Clear the type filter or search to see the whole register."
      />
    </ListShell>
  );
}
