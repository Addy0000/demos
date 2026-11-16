"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, requisitionStatusTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string; purpose: string;
  requiredBy: string | null; raisedOn: string; raisedBy: string; approvedBy: string;
  projectId: string | null; projectName: string | null;
  lineCount: number; firstMaterial: string;
  wantedKg: number; orderedKg: number; coverage: number; estimate: number;
  inquiryCount: number; orderCount: number;
};

const PAGE_SIZE = 50;
const STATUSES = [
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "PARTIALLY_ORDERED",
  "ORDERED", "REJECTED", "CLOSED", "CANCELLED",
];

export function RequisitionsGrid({
  rows,
  canWrite,
  canApprove,
}: {
  rows: Row[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [unsourcedOnly, setUnsourcedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "raisedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Approved demand nobody has taken to the market yet — the queue that
    // actually costs the business time.
    if (unsourcedOnly) out = out.filter((r) => r.status === "APPROVED" && r.inquiryCount === 0);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, unsourcedOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const awaiting = rows.filter((r) => r.status === "PENDING_APPROVAL").length;
  const unsourced = rows.filter((r) => r.status === "APPROVED" && r.inquiryCount === 0).length;

  const crumbs: Crumb[] = [{ label: "All requisitions" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (unsourcedOnly) crumbs.push({ label: "Approved,", value: "not yet sourced", onRemove: () => setUnsourcedOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Requisition", width: 122, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/procurement/requisitions/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 150, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={requisitionStatusTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    { key: "purpose", header: "Purpose", width: 250, text: (r) => r.purpose, render: (r) => <span className="text-muted">{r.purpose}</span> },
    {
      key: "firstMaterial", header: "Material", width: 210, text: (r) => r.firstMaterial,
      render: (r) => (
        <span className="text-muted">
          {r.firstMaterial}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "wantedKg", header: "Wanted", width: 110, align: "right", sortable: true, text: (r) => String(r.wantedKg), render: (r) => kg(r.wantedKg) },
    {
      key: "coverage", header: "Ordered", width: 128, align: "right", sortable: true,
      text: (r) => String(r.coverage),
      render: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="tnum">{r.coverage.toFixed(0)}%</span>
          <span className="h-[5px] w-[46px] shrink-0 overflow-hidden rounded-sm bg-faint">
            <span
              className="block h-full rounded-sm bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, r.coverage)}%` }}
            />
          </span>
        </span>
      ),
    },
    {
      key: "estimate", header: "Est. value", width: 126, align: "right", sortable: true,
      text: (r) => String(r.estimate),
      render: (r) => <span className="text-muted" title="At the current approved rate — the real figure arrives with the quotations">{money(r.estimate)}</span>,
    },
    {
      key: "requiredBy", header: "Required by", width: 112, sortable: true,
      text: (r) => r.requiredBy ?? "",
      render: (r) => {
        if (!r.requiredBy) return <span className="text-muted">—</span>;
        const late = new Date(r.requiredBy) < new Date() && r.coverage < 100;
        return <span className={late ? "font-medium text-danger" : "text-muted"}>{date(r.requiredBy)}</span>;
      },
    },
    {
      key: "inquiryCount", header: "Inquiries", width: 78, align: "right", text: (r) => String(r.inquiryCount),
      render: (r) =>
        r.inquiryCount ? (
          r.inquiryCount
        ) : r.status === "APPROVED" ? (
          <span className="text-warning" title="Approved but never put to the market">none</span>
        ) : (
          <span className="text-muted">0</span>
        ),
    },
    { key: "raisedBy", header: "Raised by", width: 150, text: (r) => r.raisedBy, render: (r) => <span className="text-muted">{r.raisedBy}</span> },
    { key: "raisedOn", header: "Raised", width: 100, sortable: true, text: (r) => r.raisedOn, render: (r) => <span className="text-muted">{date(r.raisedOn)}</span> },
  ];

  return (
    <ListShell
      title="Purchase requisitions"
      count={filtered.length}
      newHref={canWrite ? "/procurement/requisitions/new" : undefined}
      newLabel="New requisition"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search requisition, purpose, material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setUnsourcedOnly(false); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Status" value={status}
            onChange={(v) => { setStatus(v); setPage(0); }}
            options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
          />
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
            <input
              type="checkbox"
              checked={unsourcedOnly}
              onChange={(e) => { setUnsourcedOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Not yet sourced
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            {canApprove && awaiting > 0 && (
              <>
                <span className="font-semibold text-ink">{awaiting}</span> awaiting you
                {unsourced > 0 && " · "}
              </>
            )}
            {unsourced > 0 && (
              <>
                <span className="font-semibold text-ink">{unsourced}</span> approved, unsourced
              </>
            )}
          </span>
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/requisitions/${r.id}`}
        emptyTitle="No requisitions match"
        emptyBody="Clear the filters, or raise a requisition to start a sourcing round."
      />
    </ListShell>
  );
}
