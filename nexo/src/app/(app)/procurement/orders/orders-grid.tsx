"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, poStatusTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string; vendorId: string; vendorName: string;
  orderedOn: string; expectedOn: string | null; lineCount: number; firstMaterial: string;
  orderedKg: number; receivedKg: number; progress: number;
  subtotal: number; totalValue: number; grnCount: number; raisedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"];

export function OrdersGrid({
  rows,
  canWrite,
}: {
  rows: Row[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "orderedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    if (overdueOnly) {
      out = out.filter(
        (r) =>
          r.expectedOn &&
          new Date(r.expectedOn) < new Date() &&
          !["RECEIVED", "CLOSED", "CANCELLED"].includes(r.status),
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, overdueOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const totalValue = filtered.reduce((a, r) => a + r.totalValue, 0);

  const crumbs: Crumb[] = [{ label: "All orders" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (overdueOnly) crumbs.push({ label: "Delivery", value: "overdue", onRemove: () => setOverdueOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "PO number", width: 122, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/orders/${r.id}`}>{r.code}</RefLink> },
    { key: "status", header: "Status", width: 152, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={poStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    { key: "vendorName", header: "Vendor", width: 220, sortable: true, text: (r) => r.vendorName, render: (r) => <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink> },
    { key: "orderedOn", header: "Ordered", width: 100, sortable: true, text: (r) => r.orderedOn, render: (r) => <span className="text-muted">{date(r.orderedOn)}</span> },
    {
      key: "expectedOn", header: "Expected", width: 104, sortable: true,
      text: (r) => r.expectedOn ?? "",
      render: (r) => {
        if (!r.expectedOn) return <span className="text-muted">—</span>;
        const late =
          new Date(r.expectedOn) < new Date() && !["RECEIVED", "CLOSED", "CANCELLED"].includes(r.status);
        return <span className={late ? "font-medium text-danger" : "text-muted"}>{date(r.expectedOn)}</span>;
      },
    },
    { key: "lineCount", header: "Lines", width: 62, align: "right", sortable: true, text: (r) => String(r.lineCount), render: (r) => r.lineCount },
    { key: "firstMaterial", header: "Material", width: 220, text: (r) => r.firstMaterial, render: (r) => <span className="text-muted">{r.firstMaterial}{r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}</span> },
    { key: "orderedKg", header: "Ordered", width: 110, align: "right", sortable: true, text: (r) => String(r.orderedKg), render: (r) => kg(r.orderedKg) },
    {
      key: "progress", header: "Received", width: 130, align: "right", sortable: true,
      text: (r) => String(r.progress),
      render: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="tnum">{r.progress.toFixed(0)}%</span>
          <span className="h-[5px] w-[46px] shrink-0 overflow-hidden rounded-sm bg-faint">
            <span
              className="block h-full rounded-sm bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.min(100, r.progress)}%` }}
            />
          </span>
        </span>
      ),
    },
    { key: "grnCount", header: "GRNs", width: 62, align: "right", text: (r) => String(r.grnCount), render: (r) => (r.grnCount ? r.grnCount : <span className="text-muted">0</span>) },
    { key: "totalValue", header: "Order value", width: 132, align: "right", sortable: true, text: (r) => String(r.totalValue), render: (r) => <span className="font-medium">{money(r.totalValue)}</span> },
    { key: "raisedBy", header: "Raised by", width: 150, text: (r) => r.raisedBy, render: (r) => <span className="text-muted">{r.raisedBy}</span> },
  ];

  return (
    <ListShell
      title="Purchase orders"
      count={filtered.length}
      newHref={canWrite ? "/procurement/orders/new" : undefined}
      newLabel="New order"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search PO number, vendor, material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setOverdueOnly(false); setSearch(""); setPage(0); }}
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
              checked={overdueOnly}
              onChange={(e) => { setOverdueOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Overdue
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Total <span className="font-num font-semibold tabular-nums text-ink">{money(totalValue)}</span>
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
        hrefFor={(r) => `/procurement/orders/${r.id}`}
        emptyTitle="No purchase orders match"
        emptyBody="Clear the status filter or search to see every order raised."
      />
    </ListShell>
  );
}
