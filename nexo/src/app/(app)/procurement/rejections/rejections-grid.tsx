"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, vrnStatusTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  vendorId: string; vendorName: string;
  grnId: string; grnCode: string;
  raisedOn: string; raisedBy: string; approvedBy: string;
  dispatchedAt: string | null; challanNo: string;
  lineCount: number; firstMaterial: string; quantityKg: number; value: number;
  resolution: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "DISPATCHED", "CLOSED", "CANCELLED"];

export function RejectionsGrid({ rows, canApprove }: { rows: Row[]; canApprove: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "raisedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Still sitting in the Rejection warehouse — material we are holding and
    // money we have not recovered.
    if (heldOnly) out = out.filter((r) => r.status !== "DISPATCHED" && r.status !== "CLOSED" && r.status !== "CANCELLED");

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, heldOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const held = rows.filter((r) => !["DISPATCHED", "CLOSED", "CANCELLED"].includes(r.status));
  const heldValue = held.reduce((a, r) => a + r.value, 0);

  const crumbs: Crumb[] = [{ label: "All rejection notes" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (heldOnly) crumbs.push({ label: "Still", value: "in rejection store", onRemove: () => setHeldOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Note", width: 126, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/procurement/rejections/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 150, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={vrnStatusTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "vendorName", header: "Vendor", width: 216, sortable: true, text: (r) => r.vendorName,
      render: (r) => <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink>,
    },
    {
      key: "grnCode", header: "Against receipt", width: 130, text: (r) => r.grnCode,
      render: (r) => <RefLink href={`/procurement/grn/${r.grnId}`}>{r.grnCode}</RefLink>,
    },
    {
      key: "firstMaterial", header: "Material", width: 210, text: (r) => r.firstMaterial,
      render: (r) => (
        <span className="text-muted">
          {r.firstMaterial}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "quantityKg", header: "Rejected", width: 108, align: "right", sortable: true, text: (r) => String(r.quantityKg), render: (r) => <span className="text-danger">{kg(r.quantityKg)}</span> },
    { key: "value", header: "Value", width: 122, align: "right", sortable: true, text: (r) => String(r.value), render: (r) => <span className="font-medium">{money(r.value)}</span> },
    { key: "resolution", header: "Recovery", width: 200, text: (r) => r.resolution, render: (r) => <span className="text-muted">{r.resolution}</span> },
    {
      key: "challanNo", header: "Challan", width: 132, text: (r) => r.challanNo,
      render: (r) => (r.challanNo === "—" ? <span className="text-muted">—</span> : <span className="font-num">{r.challanNo}</span>),
    },
    { key: "raisedOn", header: "Raised", width: 100, sortable: true, text: (r) => r.raisedOn, render: (r) => <span className="text-muted">{date(r.raisedOn)}</span> },
  ];

  return (
    <ListShell
      title="Vendor rejection notes"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search note, vendor, receipt, material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setHeldOnly(false); setSearch(""); setPage(0); }}
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
              checked={heldOnly}
              onChange={(e) => { setHeldOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Still held
          </label>
          {held.length > 0 && (
            <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              <span className="font-semibold text-ink">{held.length}</span> held ·{" "}
              <span className="font-num font-semibold tabular-nums text-ink">{money(heldValue)}</span> unrecovered
            </span>
          )}
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/rejections/${r.id}`}
        emptyTitle="No rejection notes match"
        emptyBody="A note is raised from a goods receipt where QC turned quantity away."
      />
    </ListShell>
  );
}
