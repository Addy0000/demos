"use client";

import { presentOptions } from "@/lib/enums";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, DotLabel, customerStatusTone } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; industry: string; status: string;
  city: string; state: string; owner: string; creditLimit: number; outstanding: number;
  creditDays: number; projects: number; primaryContact: string; gstin: string; updatedAt: string;
};

const PAGE_SIZE = 50;

const STATUSES = ["ACTIVE", "PROSPECT", "ON_HOLD", "DORMANT"];

export function CustomerGrid({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [industry, setIndustry] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    if (industry) out = out.filter((r) => r.industry === industry);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, industry, sort]);

  const paged = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  const toggleSort = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All customers" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (industry) crumbs.push({ label: "Industry =", value: titleise(industry), onRemove: () => setIndustry("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Code", width: 96, sortable: true,
      text: (r) => r.code,
      render: (r) => <RefLink href={`/customers/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "name", header: "Customer", width: 230, sortable: true,
      text: (r) => r.name,
      render: (r) => <RefLink href={`/customers/${r.id}`}>{r.name}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 108, sortable: true,
      text: (r) => r.status,
      render: (r) => <Chip tone={customerStatusTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "industry", header: "Industry", width: 150, sortable: true,
      text: (r) => r.industry,
      render: (r) => <span className="text-muted">{titleise(r.industry)}</span>,
    },
    {
      key: "city", header: "City", width: 120, sortable: true,
      text: (r) => r.city,
      render: (r) => r.city,
    },
    {
      key: "state", header: "State", width: 130, sortable: true,
      text: (r) => r.state,
      render: (r) => <span className="text-muted">{r.state}</span>,
    },
    {
      key: "primaryContact", header: "Primary contact", width: 150,
      text: (r) => r.primaryContact,
      render: (r) => r.primaryContact,
    },
    {
      key: "creditLimit", header: "Credit limit", width: 120, align: "right", sortable: true,
      text: (r) => String(r.creditLimit),
      render: (r) => (r.creditLimit ? money(r.creditLimit) : <span className="text-muted">—</span>),
    },
    {
      key: "outstanding", header: "Outstanding", width: 120, align: "right", sortable: true,
      text: (r) => String(r.outstanding),
      render: (r) => {
        const over = r.creditLimit > 0 && r.outstanding > r.creditLimit * 0.8;
        return r.outstanding ? (
          <span className={over ? "font-medium text-danger" : ""}>{money(r.outstanding)}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      key: "creditDays", header: "Terms", width: 78, align: "right", sortable: true,
      text: (r) => String(r.creditDays),
      render: (r) => (r.creditDays ? `${r.creditDays} d` : <span className="text-muted">—</span>),
    },
    {
      key: "projects", header: "Projects", width: 82, align: "right", sortable: true,
      text: (r) => String(r.projects),
      render: (r) =>
        r.projects ? r.projects : <span className="text-muted">0</span>,
    },
    {
      key: "owner", header: "Account owner", width: 150,
      text: (r) => r.owner,
      render: (r) => <span className="text-muted">{r.owner}</span>,
    },
    {
      key: "updatedAt", header: "Updated", width: 100, sortable: true,
      text: (r) => r.updatedAt,
      render: (r) => <span className="text-muted">{date(r.updatedAt)}</span>,
    },
  ];

  return (
    <ListShell
      title="Customers"
      count={filtered.length}
      newHref={canWrite ? "/customers/new" : undefined}
      newLabel="New customer"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search name, code, city"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setIndustry(""); setSearch(""); setPage(0); }}
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
            label="Industry" value={industry}
            onChange={(v) => { setIndustry(v); setPage(0); }}
            options={presentOptions(rows, (r) => r.industry)}
          />
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/customers/${r.id}`}
        emptyTitle="No customers match"
        emptyBody="Adjust the status or industry filter, or clear the search to see the full list."
      />
    </ListShell>
  );
}
