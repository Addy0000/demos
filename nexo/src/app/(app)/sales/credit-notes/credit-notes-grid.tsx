"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

type Row = {
  id: string;
  number: string;
  date: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceCode: string;
  returnId: string;
  returnCode: string;
  total: number;
  status: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["ISSUED", "CANCELLED"];

export function CreditNotesGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) {
      out = out.filter((r) => r.status === status);
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const totalCredited = filtered.reduce((sum, r) => sum + r.total, 0);

  const crumbs: Crumb[] = [{ label: "All credit notes" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "number",
      header: "Number",
      width: 140,
      sortable: true,
      text: (r) => r.number,
      render: (r) => <RefLink href={`/sales/credit-notes/${r.id}`}>{r.number}</RefLink>,
    },
    {
      key: "date",
      header: "Date",
      width: 110,
      sortable: true,
      text: (r) => r.date,
      render: (r) => <span className="text-muted">{date(r.date)}</span>,
    },
    {
      key: "customerName",
      header: "Customer",
      width: 220,
      sortable: true,
      text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    {
      key: "invoiceCode",
      header: "Invoice",
      width: 130,
      sortable: true,
      text: (r) => r.invoiceCode,
      render: (r) => <RefLink href={`/sales/invoices/${r.invoiceId}`}>{r.invoiceCode}</RefLink>,
    },
    {
      key: "returnCode",
      header: "Return",
      width: 130,
      sortable: true,
      text: (r) => r.returnCode,
      render: (r) => <RefLink href={`/sales/returns/${r.returnId}`}>{r.returnCode}</RefLink>,
    },
    {
      key: "total",
      header: "Total",
      width: 130,
      align: "right",
      sortable: true,
      text: (r) => String(r.total),
      render: (r) => money(r.total),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      sortable: true,
      text: (r) => r.status,
      render: (r) => <Chip tone={r.status === "ISSUED" ? "success" : "danger"}>{titleise(r.status)}</Chip>,
    },
  ];

  return (
    <ListShell
      title="Credit notes"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search number, customer, invoice, return"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(0); }}
            options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
          />
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Total credited <span className="font-num font-semibold tabular-nums text-ink">{money(totalCredited)}</span>
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
        emptyTitle="No credit notes match"
        emptyBody="A credit note is issued when an inspected return applies credit against an invoice."
      />
    </ListShell>
  );
}
