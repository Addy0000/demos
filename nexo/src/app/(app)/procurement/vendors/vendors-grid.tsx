"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, vendorStatusTone } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; status: string; city: string; state: string;
  contactName: string; contactPhone: string; contactEmail: string; gstin: string;
  rating: number; creditDays: number; paymentTerms: string;
  materials: number; orders: number; receipts: number; portalUsers: number;
  pendingPrices: number; totalSpend: number; outstanding?: number; lastOrder: string | null;
};

const PAGE_SIZE = 50;
const STATUSES = ["ACTIVE", "ON_HOLD", "BLACKLISTED", "PENDING_APPROVAL"];

export function VendorsGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const out = status ? rows.filter((r) => r.status === status) : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const totalSpend = filtered.reduce((a, r) => a + r.totalSpend, 0);

  const crumbs: Crumb[] = [{ label: "All vendors" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 86, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/vendors/${r.id}`}>{r.code}</RefLink> },
    { key: "name", header: "Vendor", width: 250, sortable: true, text: (r) => r.name, render: (r) => <RefLink href={`/procurement/vendors/${r.id}`}>{r.name}</RefLink> },
    { key: "status", header: "Status", width: 140, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={vendorStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    {
      // The number is the content. A bar beside it restates the same value in a
      // less precise form and costs 40px of a column that has none to spare.
      key: "rating", header: "Rating", width: 76, align: "right", sortable: true,
      text: (r) => String(r.rating),
      render: (r) => (
        <span className={r.rating < 70 ? "font-medium text-danger-text" : ""}>{r.rating.toFixed(1)}</span>
      ),
    },
    { key: "city", header: "City", width: 130, sortable: true, text: (r) => r.city, render: (r) => r.city },
    { key: "state", header: "State", width: 140, text: (r) => r.state, render: (r) => <span className="text-muted">{r.state}</span> },
    { key: "contactName", header: "Contact", width: 150, text: (r) => r.contactName, render: (r) => r.contactName },
    { key: "contactPhone", header: "Phone", width: 148, text: (r) => r.contactPhone, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.contactPhone}</span> },
    { key: "materials", header: "Materials", width: 88, align: "right", sortable: true, text: (r) => String(r.materials), render: (r) => (r.materials ? r.materials : <span className="text-muted">0</span>) },
    {
      key: "pendingPrices", header: "Pending", width: 82, align: "right", sortable: true,
      text: (r) => String(r.pendingPrices),
      render: (r) => (r.pendingPrices ? <Chip tone="warning">{r.pendingPrices}</Chip> : <span className="text-muted">—</span>),
    },
    { key: "orders", header: "Orders", width: 74, align: "right", sortable: true, text: (r) => String(r.orders), render: (r) => (r.orders ? r.orders : <span className="text-muted">0</span>) },
    { key: "receipts", header: "GRNs", width: 66, align: "right", sortable: true, text: (r) => String(r.receipts), render: (r) => (r.receipts ? r.receipts : <span className="text-muted">0</span>) },
    { key: "totalSpend", header: "Total spend", width: 132, align: "right", sortable: true, text: (r) => String(r.totalSpend), render: (r) => (r.totalSpend ? <span className="font-medium">{money(r.totalSpend)}</span> : <span className="text-muted">—</span>) },
    {
      key: "outstanding",
      header: "Outstanding",
      width: 120,
      align: "right",
      sortable: true,
      text: (r) => String(r.outstanding ?? 0),
      render: (r) =>
        (r.outstanding ?? 0) > 0 ? (
          <span className="font-medium text-danger-text font-num">{money(r.outstanding!)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: "lastOrder", header: "Last order", width: 100, sortable: true, text: (r) => r.lastOrder ?? "", render: (r) => <span className="text-muted">{date(r.lastOrder)}</span> },
    {
      key: "portalUsers", header: "Portal", width: 76, align: "right",
      text: (r) => String(r.portalUsers),
      render: (r) => (r.portalUsers ? <Chip tone="info">{r.portalUsers}</Chip> : <span className="text-muted">—</span>),
    },
    { key: "paymentTerms", header: "Payment terms", width: 170, text: (r) => r.paymentTerms, render: (r) => <span className="text-muted">{r.paymentTerms}</span> },
  ];

  return (
    <ListShell
      title="Vendors"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search vendor, city, contact"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
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
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Spend <span className="font-num font-semibold tabular-nums text-ink">{money(totalSpend)}</span>
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
        hrefFor={(r) => `/procurement/vendors/${r.id}`}
        emptyTitle="No vendors match"
        emptyBody="Clear the status filter or search to see every supplier on record."
      />
    </ListShell>
  );
}
