"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, invoiceTone } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";
import { isInvoiceOverdue } from "@/lib/invoice-overdue";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string;
  orderId: string; orderCode: string; customerPoNo: string;
  challanId: string | null; challanCode: string | null;
  invoiceDate: string; dueOn: string | null;
  total: number; paid: number; due: number; daysOverdue: number;
  raisedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "RAISED", "PART_PAID", "PAID", "OVERDUE", "CANCELLED"];

/** Standard receivables buckets. */
const BUCKETS = [
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "Over 90 days", min: 91, max: Infinity },
];

export function InvoicesGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [bucket, setBucket] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "invoiceDate", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) {
      out = out.filter((r) => {
        const overdue = isInvoiceOverdue(r);
        const effStatus = overdue ? "OVERDUE" : r.status;
        return effStatus === status;
      });
    }
    if (bucket) {
      const b = BUCKETS.find((x) => x.label === bucket);
      if (b) out = out.filter((r) => r.daysOverdue >= b.min && r.daysOverdue <= b.max);
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
  }, [rows, status, bucket, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const outstanding = filtered.reduce((a, r) => a + r.due, 0);
  const overdueValue = rows.filter((r) => isInvoiceOverdue(r)).reduce((a, r) => a + r.due, 0);

  const crumbs: Crumb[] = [{ label: "All invoices" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (bucket) crumbs.push({ label: "Overdue", value: bucket, onRemove: () => setBucket("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Invoice", width: 122, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/sales/invoices/${r.id}`}>{r.code}</RefLink> },
    {
      key: "status", header: "Status", width: 128, sortable: true,
      text: (r) => (isInvoiceOverdue(r) ? "OVERDUE" : r.status),
      render: (r) => {
        const effStatus = isInvoiceOverdue(r) ? "OVERDUE" : r.status;
        return <Chip tone={invoiceTone(effStatus)}>{titleise(effStatus)}</Chip>;
      },
    },
    {
      key: "customerName", header: "Customer", width: 210, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    { key: "orderCode", header: "Order", width: 112, text: (r) => r.orderCode, render: (r) => <RefLink href={`/sales/orders/${r.orderId}`}>{r.orderCode}</RefLink> },
    {
      key: "challanCode", header: "Challan", width: 112, text: (r) => r.challanCode ?? "",
      render: (r) => (r.challanId ? <RefLink href={`/sales/dispatch/${r.challanId}`}>{r.challanCode}</RefLink> : <span className="text-muted">—</span>),
    },
    { key: "invoiceDate", header: "Date", width: 100, sortable: true, text: (r) => r.invoiceDate, render: (r) => <span className="text-muted">{date(r.invoiceDate)}</span> },
    {
      key: "dueOn", header: "Due", width: 100, sortable: true, text: (r) => r.dueOn ?? "",
      render: (r) => (r.dueOn ? <span className={r.daysOverdue > 0 ? "font-medium text-danger" : "text-muted"}>{date(r.dueOn)}</span> : <span className="text-muted">—</span>),
    },
    { key: "total", header: "Invoiced", width: 122, align: "right", sortable: true, text: (r) => String(r.total), render: (r) => money(r.total) },
    {
      key: "paid", header: "Received", width: 122, align: "right", sortable: true, text: (r) => String(r.paid),
      render: (r) => (r.paid > 0 ? <span className="text-success-text">{money(r.paid)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: "due", header: "Outstanding", width: 128, align: "right", sortable: true, text: (r) => String(r.due),
      render: (r) =>
        r.due <= 0.01 ? (
          <span className="text-success-text">settled</span>
        ) : (
          <span className="font-medium text-danger-text">{money(r.due)}</span>
        ),
    },
    {
      key: "daysOverdue", header: "Overdue by", width: 110, align: "right", sortable: true,
      text: (r) => String(r.daysOverdue),
      render: (r) =>
        r.daysOverdue > 0 ? (
          <span className={r.daysOverdue > 90 ? "font-semibold text-danger-text" : "text-warning-text"}>
            {r.daysOverdue} d
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <ListShell
      title="Sales invoices"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search invoice, customer, order, challan"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setBucket(""); setSearch(""); setPage(0); }}
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
          <FilterSelect
            label="Ageing" value={bucket}
            onChange={(v) => { setBucket(v); setPage(0); }}
            options={BUCKETS.map((b) => ({ value: b.label, label: b.label }))}
          />
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Outstanding <span className="font-num font-semibold tabular-nums text-ink">{money(outstanding)}</span>
            {overdueValue > 0 && (
              <>
                {" · "}
                <span className="font-num font-semibold tabular-nums text-danger-text">{money(overdueValue)}</span> overdue
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
        emptyTitle="No invoices match"
        emptyBody="An invoice is raised against a despatched challan."
      />
    </ListShell>
  );
}
