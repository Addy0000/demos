"use client";

import { useTenant } from "@/components/appearance";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, challanTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string; city: string;
  orderId: string; orderCode: string; customerPoNo: string;
  dispatchedOn: string | null; deliveredOn: string | null;
  vehicleNo: string; lrNo: string; packageCnt: number | null;
  lineCount: number; firstProject: string; batches: string;
  quantityKg: number; value: number;
  invoiceId: string | null; invoiceCode: string | null;
  raisedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"];

export function DispatchGrid({ rows, canInvoice }: { rows: Row[]; canInvoice: boolean }) {
  const noun = useTenant().noun;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [uninvoicedOnly, setUninvoicedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "dispatchedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Goods gone, money not asked for. The most expensive queue in the business.
    if (uninvoicedOnly) {
      out = out.filter((r) => !r.invoiceId && ["DISPATCHED", "DELIVERED"].includes(r.status));
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
  }, [rows, status, uninvoicedOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const uninvoiced = rows.filter((r) => !r.invoiceId && ["DISPATCHED", "DELIVERED"].includes(r.status));
  const uninvoicedValue = uninvoiced.reduce((a, r) => a + r.value, 0);

  const crumbs: Crumb[] = [{ label: "All despatches" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (uninvoicedOnly) crumbs.push({ label: "Gone,", value: "not invoiced", onRemove: () => setUninvoicedOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Challan", width: 116, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/sales/dispatch/${r.id}`}>{r.code}</RefLink> },
    {
      key: "status", header: "Status", width: 128, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={challanTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 200, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    { key: "orderCode", header: "Against order", width: 118, text: (r) => r.orderCode, render: (r) => <RefLink href={`/sales/orders/${r.orderId}`}>{r.orderCode}</RefLink> },
    {
      key: "firstProject", header: noun.one, width: 190, text: (r) => r.firstProject,
      render: (r) => (
        <span className="text-muted">
          {r.firstProject}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    // Batch on the challan is the traceability link a customer complaint starts from.
    { key: "batches", header: "Batches", width: 168, text: (r) => r.batches, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.batches}</span> },
    { key: "quantityKg", header: "Quantity", width: 104, align: "right", sortable: true, text: (r) => String(r.quantityKg), render: (r) => kg(r.quantityKg) },
    { key: "value", header: "Value", width: 122, align: "right", sortable: true, text: (r) => String(r.value), render: (r) => <span className="font-medium">{money(r.value)}</span> },
    { key: "vehicleNo", header: "Vehicle", width: 118, text: (r) => r.vehicleNo, render: (r) => <span className="font-num text-muted">{r.vehicleNo}</span> },
    { key: "dispatchedOn", header: "Despatched", width: 108, sortable: true, text: (r) => r.dispatchedOn ?? "", render: (r) => <span className="text-muted">{r.dispatchedOn ? date(r.dispatchedOn) : "—"}</span> },
    {
      key: "invoiceCode", header: "Invoice", width: 122, text: (r) => r.invoiceCode ?? "",
      render: (r) =>
        r.invoiceId ? (
          <span className="font-num text-[11.5px]">{r.invoiceCode}</span>
        ) : ["DISPATCHED", "DELIVERED"].includes(r.status) ? (
          <span className="text-warning">not invoiced</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <ListShell
      title="Despatch"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search challan, customer, order, batch, vehicle"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setUninvoicedOnly(false); setSearch(""); setPage(0); }}
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
              checked={uninvoicedOnly}
              onChange={(e) => { setUninvoicedOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Not invoiced
          </label>
          {uninvoiced.length > 0 && (
            <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              <span className="font-semibold text-warning-text">{uninvoiced.length}</span> gone but unbilled ·{" "}
              <span className="font-num font-semibold tabular-nums text-ink">{money(uninvoicedValue)}</span>
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
        hrefFor={(r) => `/sales/dispatch/${r.id}`}
        emptyTitle="No despatches match"
        emptyBody="A challan is created by despatching reserved stock from a confirmed sales order."
      />
    </ListShell>
  );
}
