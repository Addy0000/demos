"use client";

import { useTenant } from "@/components/appearance";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, salesOrderTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string; customerPoNo: string;
  quotationId: string | null; quotationCode: string | null;
  orderedOn: string; promisedOn: string | null;
  lineCount: number; firstProject: string;
  orderedKg: number; allocatedKg: number; dispatchedKg: number; progress: number;
  totalValue: number;
  challanCount: number; invoiceCount: number; returnCount: number;
  raisedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = [
  "DRAFT", "PENDING_APPROVAL", "CONFIRMED", "PARTIALLY_DISPATCHED",
  "DISPATCHED", "INVOICED", "CLOSED", "CANCELLED",
];

export function SalesOrdersGrid({
  rows,
  canWrite,
  canApprove,
}: {
  rows: Row[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const noun = useTenant().noun;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "orderedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Past the date we promised and still not fully out of the gate.
    if (lateOnly) {
      out = out.filter(
        (r) =>
          r.promisedOn &&
          new Date(r.promisedOn) < new Date() &&
          !["DISPATCHED", "INVOICED", "CLOSED", "CANCELLED"].includes(r.status),
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
  }, [rows, status, lateOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const openValue = filtered
    .filter((r) => !["INVOICED", "CLOSED", "CANCELLED"].includes(r.status))
    .reduce((a, r) => a + r.totalValue, 0);
  const late = rows.filter(
    (r) => r.promisedOn && new Date(r.promisedOn) < new Date() && !["DISPATCHED", "INVOICED", "CLOSED", "CANCELLED"].includes(r.status),
  ).length;

  const crumbs: Crumb[] = [{ label: "All sales orders" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (lateOnly) crumbs.push({ label: "Past", value: "promised date", onRemove: () => setLateOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Order", width: 118, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/sales/orders/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 158, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={salesOrderTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 216, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    // Operators search by the customer's number far more than by ours.
    { key: "customerPoNo", header: "Their PO", width: 148, text: (r) => r.customerPoNo, render: (r) => <span className="font-num text-muted">{r.customerPoNo}</span> },
    {
      key: "firstProject", header: noun.one, width: 200, text: (r) => r.firstProject,
      render: (r) => (
        <span className="text-muted">
          {r.firstProject}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "orderedKg", header: "Ordered", width: 108, align: "right", sortable: true, text: (r) => String(r.orderedKg), render: (r) => kg(r.orderedKg) },
    {
      key: "allocatedKg", header: "Allocated", width: 106, align: "right", sortable: true,
      text: (r) => String(r.allocatedKg),
      render: (r) =>
        r.allocatedKg > 0 ? (
          <span className="text-info-text">{kg(r.allocatedKg)}</span>
        ) : r.status === "CONFIRMED" ? (
          <span className="text-warning" title="Confirmed but no stock reserved yet">none</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "progress", header: "Despatched", width: 130, align: "right", sortable: true,
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
    {
      key: "promisedOn", header: "Promised", width: 106, sortable: true, text: (r) => r.promisedOn ?? "",
      render: (r) => {
        if (!r.promisedOn) return <span className="text-muted">—</span>;
        const overdue =
          new Date(r.promisedOn) < new Date() &&
          !["DISPATCHED", "INVOICED", "CLOSED", "CANCELLED"].includes(r.status);
        return <span className={overdue ? "font-medium text-danger" : "text-muted"}>{date(r.promisedOn)}</span>;
      },
    },
    { key: "totalValue", header: "Order value", width: 128, align: "right", sortable: true, text: (r) => String(r.totalValue), render: (r) => <span className="font-medium">{money(r.totalValue)}</span> },
    {
      key: "returnCount", header: "Returns", width: 74, align: "right", text: (r) => String(r.returnCount),
      render: (r) => (r.returnCount ? <span className="text-danger-text">{r.returnCount}</span> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <ListShell
      title="Sales orders"
      count={filtered.length}
      newHref={canWrite ? "/sales/orders/new" : undefined}
      newLabel="New order"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder={`Search order, customer, their PO, ${noun.one.toLowerCase()}`}
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setLateOnly(false); setSearch(""); setPage(0); }}
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
              checked={lateOnly}
              onChange={(e) => { setLateOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Past promised
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Open <span className="font-num font-semibold tabular-nums text-ink">{money(openValue)}</span>
            {late > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-danger-text">{late}</span> late
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
        hrefFor={(r) => `/sales/orders/${r.id}`}
        emptyTitle="No sales orders match"
        emptyBody="Clear the filters, or accept a quotation to raise an order from it."
      />
    </ListShell>
  );
}
