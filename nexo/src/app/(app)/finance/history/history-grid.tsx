"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, priceStatusTone } from "@/components/ui/chip";
import { ratePerKg, date, titleise, percent } from "@/lib/format";

type Row = {
  id: string; materialId: string; materialCode: string; materialName: string; category: string;
  vendorId: string; vendorName: string; pricePerKg: number; changePct: number | null;
  status: string; effectiveFrom: string; effectiveTo: string | null;
  submittedAt: string; submittedBy: string; approvedAt: string | null; approvedBy: string;
  rejectionReason: string; remark: string;
};

const PAGE_SIZE = 100;
const STATUSES = ["APPROVED", "PENDING_APPROVAL", "REJECTED", "SUPERSEDED", "DRAFT"];

export function HistoryGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "submittedAt", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const out = status ? rows.filter((r) => r.status === status) : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All price records" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "materialCode", header: "Code", width: 84, sortable: true, text: (r) => r.materialCode, render: (r) => <RefLink href={`/procurement/materials/${r.materialId}`}>{r.materialCode}</RefLink> },
    { key: "materialName", header: "Material", width: 250, sortable: true, text: (r) => r.materialName, render: (r) => <RefLink href={`/procurement/materials/${r.materialId}`}>{r.materialName}</RefLink> },
    { key: "vendorName", header: "Vendor", width: 200, sortable: true, text: (r) => r.vendorName, render: (r) => <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink> },
    { key: "status", header: "Status", width: 140, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={priceStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    { key: "pricePerKg", header: "Rate ₹/kg", width: 100, align: "right", sortable: true, text: (r) => String(r.pricePerKg), render: (r) => <span className="font-medium">{ratePerKg(r.pricePerKg)}</span> },
    {
      key: "changePct", header: "Change", width: 90, align: "right", sortable: true,
      text: (r) => String(r.changePct ?? ""),
      render: (r) =>
        r.changePct === null ? (
          <span className="text-muted">—</span>
        ) : (
          <Chip tone={r.changePct > 8 ? "danger" : r.changePct > 0 ? "warning" : "success"}>{percent(r.changePct, 1)}</Chip>
        ),
    },
    { key: "effectiveFrom", header: "Effective from", width: 110, sortable: true, text: (r) => r.effectiveFrom, render: (r) => <span className="text-muted">{date(r.effectiveFrom)}</span> },
    { key: "effectiveTo", header: "Effective to", width: 110, text: (r) => r.effectiveTo ?? "", render: (r) => <span className="text-muted">{r.effectiveTo ? date(r.effectiveTo) : "current"}</span> },
    { key: "submittedAt", header: "Submitted", width: 105, sortable: true, text: (r) => r.submittedAt, render: (r) => <span className="text-muted">{date(r.submittedAt)}</span> },
    { key: "submittedBy", header: "Submitted by", width: 150, text: (r) => r.submittedBy, render: (r) => <span className="text-muted">{r.submittedBy}</span> },
    { key: "approvedBy", header: "Decided by", width: 150, text: (r) => r.approvedBy, render: (r) => <span className="text-muted">{r.approvedBy}</span> },
    {
      key: "note", header: "Note", width: 340,
      text: (r) => r.rejectionReason || r.remark,
      render: (r) =>
        r.rejectionReason ? (
          <span className="text-danger">{r.rejectionReason}</span>
        ) : r.remark ? (
          <span className="text-muted">{r.remark}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <ListShell
      title="Price history"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search material or vendor"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <FilterSelect
          label="Status" value={status}
          onChange={(v) => { setStatus(v); setPage(0); }}
          options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
        />
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/materials/${r.materialId}`}
        emptyTitle="No price records match"
        emptyBody="Clear the status filter or search to see the full audit trail."
      />
    </ListShell>
  );
}
