"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, salesReturnTone } from "@/components/ui/chip";
import { kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string;
  orderId: string; orderCode: string;
  returnedOn: string; reason: string; customerDcNo: string;
  lineCount: number; firstProject: string;
  returnedKg: number; restockedKg: number; scrappedKg: number; recovery: number;
  inspectedBy: string | null; receivedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PENDING_QC", "RESTOCKED", "PARTIALLY_RESTOCKED", "SCRAPPED", "CLOSED", "CANCELLED"];

export function ReturnsGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [benchOnly, setBenchOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "returnedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Sitting on the bench, uninspected, counting as neither stock nor scrap.
    if (benchOnly) out = out.filter((r) => r.status === "PENDING_QC" || r.status === "DRAFT");

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, benchOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const onBench = rows.filter((r) => ["PENDING_QC", "DRAFT"].includes(r.status));
  const benchKg = onBench.reduce((a, r) => a + r.returnedKg, 0);
  const totalBack = rows.reduce((a, r) => a + r.returnedKg, 0);
  const totalRestocked = rows.reduce((a, r) => a + r.restockedKg, 0);
  const recovery = totalBack > 0 ? (totalRestocked / totalBack) * 100 : null;

  const crumbs: Crumb[] = [{ label: "All returns" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (benchOnly) crumbs.push({ label: "On the", value: "inspection bench", onRemove: () => setBenchOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Return", width: 122, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/sales/returns/${r.id}`}>{r.code}</RefLink> },
    {
      key: "status", header: "Status", width: 168, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={salesReturnTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 200, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    { key: "orderCode", header: "Against order", width: 118, text: (r) => r.orderCode, render: (r) => <RefLink href={`/sales/orders/${r.orderId}`}>{r.orderCode}</RefLink> },
    {
      key: "firstProject", header: "Compound", width: 186, text: (r) => r.firstProject,
      render: (r) => (
        <span className="text-muted">
          {r.firstProject}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "reason", header: "Why it came back", width: 250, text: (r) => r.reason, render: (r) => <span className="text-muted">{r.reason}</span> },
    { key: "returnedKg", header: "Returned", width: 104, align: "right", sortable: true, text: (r) => String(r.returnedKg), render: (r) => kg(r.returnedKg) },
    {
      key: "restockedKg", header: "Back to stock", width: 116, align: "right", sortable: true,
      text: (r) => String(r.restockedKg),
      render: (r) => (r.restockedKg > 0 ? <span className="text-success-text">{kg(r.restockedKg)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: "scrappedKg", header: "Scrapped", width: 104, align: "right", sortable: true,
      text: (r) => String(r.scrappedKg),
      render: (r) => (r.scrappedKg > 0 ? <span className="text-danger-text">{kg(r.scrappedKg)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: "recovery", header: "Recovered", width: 108, align: "right", sortable: true,
      text: (r) => String(r.recovery),
      render: (r) =>
        ["PENDING_QC", "DRAFT"].includes(r.status) ? (
          <span className="text-warning">not inspected</span>
        ) : (
          <span className={`tnum ${r.recovery >= 50 ? "text-success-text" : "text-danger-text"}`}>
            {r.recovery.toFixed(0)}%
          </span>
        ),
    },
    { key: "returnedOn", header: "Returned", width: 100, sortable: true, text: (r) => r.returnedOn, render: (r) => <span className="text-muted">{date(r.returnedOn)}</span> },
  ];

  return (
    <ListShell
      title="Sales returns"
      count={filtered.length}
      newHref="/sales/returns/new"
      newLabel="Log return"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search return, customer, order, reason"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setBenchOnly(false); setSearch(""); setPage(0); }}
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
              checked={benchOnly}
              onChange={(e) => { setBenchOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            On the bench
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            {onBench.length > 0 && (
              <>
                <span className="font-semibold text-warning-text">{onBench.length}</span> uninspected ·{" "}
                <span className="font-num tabular-nums text-ink">{kg(benchKg)}</span>
              </>
            )}
            {recovery !== null && onBench.length === 0 && (
              <>
                Recovered <span className="font-num font-semibold tabular-nums text-ink">{recovery.toFixed(0)}%</span> of
                everything returned
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
        hrefFor={(r) => `/sales/returns/${r.id}`}
        emptyTitle="No returns match"
        emptyBody="Material coming back from a customer is logged here and inspected before it counts as stock."
      />
    </ListShell>
  );
}
