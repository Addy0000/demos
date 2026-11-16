"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, grnStatusTone } from "@/components/ui/chip";
import { kgPlain, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string; vendorId: string; vendorName: string;
  poId: string; poCode: string; receivedOn: string; invoiceNo: string; vehicleNo: string;
  gateEntryNo: string; lineCount: number; challanKg: number; receivedKg: number;
  acceptedKg: number; rejectedKg: number; shortfallKg: number;
  receivedBy: string; inspectedBy: string; hasFailure: boolean;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PENDING_QC", "QC_PASSED", "QC_FAILED", "PARTIALLY_ACCEPTED", "POSTED"];

export function GrnGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "receivedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    if (issuesOnly) out = out.filter((r) => r.hasFailure || r.rejectedKg > 0 || r.shortfallKg > 0.001);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, issuesOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All receipts" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (issuesOnly) crumbs.push({ label: "With", value: "rejection or shortfall", onRemove: () => setIssuesOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "GRN", width: 130, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/grn/${r.id}`}>{r.code}</RefLink> },
    { key: "status", header: "Status", width: 158, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={grnStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    { key: "receivedOn", header: "Received", width: 100, sortable: true, text: (r) => r.receivedOn, render: (r) => <span className="text-muted">{date(r.receivedOn)}</span> },
    { key: "vendorName", header: "Vendor", width: 210, sortable: true, text: (r) => r.vendorName, render: (r) => <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink> },
    { key: "poCode", header: "Against PO", width: 124, text: (r) => r.poCode, render: (r) => <RefLink href={`/procurement/orders/${r.poId}`}>{r.poCode}</RefLink> },
    { key: "invoiceNo", header: "Invoice", width: 118, text: (r) => r.invoiceNo, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.invoiceNo}</span> },
    { key: "vehicleNo", header: "Vehicle", width: 116, text: (r) => r.vehicleNo, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.vehicleNo}</span> },
    { key: "lineCount", header: "Lines", width: 60, align: "right", text: (r) => String(r.lineCount), render: (r) => r.lineCount },
    { key: "challanKg", header: "Challan kg", width: 108, align: "right", sortable: true, text: (r) => String(r.challanKg), render: (r) => <span className="text-muted">{kgPlain(r.challanKg)}</span> },
    { key: "receivedKg", header: "Weighed kg", width: 112, align: "right", sortable: true, text: (r) => String(r.receivedKg), render: (r) => kgPlain(r.receivedKg) },
    {
      key: "shortfallKg", header: "Shortfall", width: 100, align: "right", sortable: true,
      text: (r) => String(r.shortfallKg),
      render: (r) =>
        r.shortfallKg > 0.001 ? <span className="font-medium text-warning">{kgPlain(r.shortfallKg)}</span> : <span className="text-muted">—</span>,
    },
    { key: "acceptedKg", header: "Accepted kg", width: 112, align: "right", sortable: true, text: (r) => String(r.acceptedKg), render: (r) => <span className="font-medium text-success">{kgPlain(r.acceptedKg)}</span> },
    {
      key: "rejectedKg", header: "Rejected", width: 100, align: "right", sortable: true,
      text: (r) => String(r.rejectedKg),
      render: (r) => (r.rejectedKg > 0.001 ? <span className="font-medium text-danger">{kgPlain(r.rejectedKg)}</span> : <span className="text-muted">—</span>),
    },
    { key: "receivedBy", header: "Received by", width: 140, text: (r) => r.receivedBy, render: (r) => <span className="text-muted">{r.receivedBy}</span> },
    { key: "inspectedBy", header: "Inspected by", width: 140, text: (r) => r.inspectedBy, render: (r) => <span className="text-muted">{r.inspectedBy}</span> },
  ];

  return (
    <ListShell
      title="Goods receipts"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search GRN, PO, invoice, vehicle"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setIssuesOnly(false); setSearch(""); setPage(0); }}
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
              checked={issuesOnly}
              onChange={(e) => { setIssuesOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            With issues
          </label>
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/grn/${r.id}`}
        emptyTitle="No goods receipts match"
        emptyBody="Clear the status filter or search to see every receipt."
      />
    </ListShell>
  );
}
