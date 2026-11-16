"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, type Crumb } from "@/components/grid/list-shell";
import { Chip, customerStatusTone } from "@/components/ui/chip";
import { titleise } from "@/lib/format";

type Row = {
  id: string; name: string; role: string; email: string; phone: string; isPrimary: boolean;
  customerId: string; customerCode: string; customerName: string; customerStatus: string; city: string;
};

const PAGE_SIZE = 100;

export function ContactsGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => (primaryOnly ? rows.filter((r) => r.isPrimary) : rows),
    [rows, primaryOnly],
  );

  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  const crumbs: Crumb[] = [{ label: "All contacts" }];
  if (primaryOnly) crumbs.push({ label: "Primary =", value: "true", onRemove: () => setPrimaryOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "name", header: "Contact", width: 180,
      text: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <span className="truncate">{r.name}</span>
          {r.isPrimary && <Chip tone="info">Primary</Chip>}
        </span>
      ),
    },
    { key: "role", header: "Role", width: 140, text: (r) => r.role, render: (r) => <span className="text-muted">{r.role}</span> },
    {
      key: "customerName", header: "Customer", width: 220,
      text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    {
      key: "customerStatus", header: "Account status", width: 120,
      text: (r) => r.customerStatus,
      render: (r) => <Chip tone={customerStatusTone(r.customerStatus)}>{titleise(r.customerStatus)}</Chip>,
    },
    { key: "city", header: "City", width: 120, text: (r) => r.city, render: (r) => r.city },
    {
      key: "email", header: "Email", width: 240,
      text: (r) => r.email,
      render: (r) =>
        r.email === "—" ? <span className="text-muted">—</span> : (
          <a href={`mailto:${r.email}`} className="ref-link font-num text-[11.5px]" onClick={(e) => e.stopPropagation()}>
            {r.email}
          </a>
        ),
    },
    {
      key: "phone", header: "Phone", width: 150,
      text: (r) => r.phone,
      render: (r) => <span className="font-num text-[11.5px] text-muted">{r.phone}</span>,
    },
  ];

  return (
    <ListShell
      title="Contacts"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search contact, customer, email"
      crumbs={crumbs}
      onClearFilters={() => { setPrimaryOnly(false); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <label className="flex shrink-0 items-center gap-1.5 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={primaryOnly}
            onChange={(e) => { setPrimaryOnly(e.target.checked); setPage(0); }}
            className="h-[13px] w-[13px] accent-primary"
          />
          Primary only
        </label>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        hrefFor={(r) => `/customers/${r.customerId}`}
        emptyTitle="No contacts match"
        emptyBody="Clear the filter or search to see every contact on file."
      />
    </ListShell>
  );
}
