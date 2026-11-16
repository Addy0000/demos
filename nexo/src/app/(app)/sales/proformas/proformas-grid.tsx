"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, type Crumb } from "@/components/grid/list-shell";
import { Chip, salesQuotationTone } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

type Row = {
  id: string;
  code: string;
  status: string;
  customerId: string;
  customerName: string;
  issuedOn: string;
  validUntil: string | null;
  totalValue: number;
};

const PAGE_SIZE = 50;

export function ProformasGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "issuedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "Proforma invoices" }];
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code",
      header: "Quotation code",
      width: 140,
      sortable: true,
      text: (r) => r.code,
      render: (r) => <RefLink href={`/sales/quotations/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "customerName",
      header: "Customer",
      width: 240,
      sortable: true,
      text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    {
      key: "issuedOn",
      header: "Issued date",
      width: 120,
      sortable: true,
      text: (r) => r.issuedOn,
      render: (r) => date(r.issuedOn),
    },
    {
      key: "validUntil",
      header: "Valid until",
      width: 120,
      sortable: true,
      text: (r) => r.validUntil ?? "",
      render: (r) => (r.validUntil ? date(r.validUntil) : <span className="text-muted">—</span>),
    },
    {
      key: "totalValue",
      header: "Total value",
      width: 140,
      align: "right",
      sortable: true,
      text: (r) => String(r.totalValue),
      render: (r) => <span className="font-medium">{money(r.totalValue)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: 130,
      sortable: true,
      text: (r) => r.status,
      render: (r) => <Chip tone={salesQuotationTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "proformaLink",
      header: "Proforma",
      width: 130,
      text: () => "View proforma",
      render: (r) => (
        <Link
          href={`/sales/quotations/${r.id}/proforma`}
          className="rounded border border-edge bg-surface px-2 py-1 text-[11.5px] font-medium text-ink transition-colors hover:bg-faint hover:text-primary"
        >
          View proforma
        </Link>
      ),
    },
  ];

  return (
    <ListShell
      title="Proforma invoices"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => {
        setSearch(v);
        setPage(0);
      }}
      searchPlaceholder="Search quotation or customer"
      crumbs={crumbs}
      onClearFilters={() => {
        setSearch("");
        setPage(0);
      }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/sales/quotations/${r.id}/proforma`}
        emptyTitle="No proformas found"
        emptyBody="Proforma invoices are generated from live or accepted quotations."
      />
    </ListShell>
  );
}
