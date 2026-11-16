"use client";

import { presentOptions } from "@/lib/enums";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { ratePerKg, date, titleise, percent } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; category: string; grade: string; uom: string;
  currentPrice: number | null; currentFrom: string | null;
  bestPrice: number | null; bestVendor: string; bestVendorId: string | null;
  quotes: number; suppliers: number; pendingCount: number; pendingPrice: number | null;
  usedIn: number; leadTimeDays: number;
};

const PAGE_SIZE = 100;

export function PricesGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (category) out = out.filter((r) => r.category === category);
    if (pendingOnly) out = out.filter((r) => r.pendingCount > 0);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, category, pendingOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "Active materials" }];
  if (category) crumbs.push({ label: "Category =", value: titleise(category), onRemove: () => setCategory("") });
  if (pendingOnly) crumbs.push({ label: "Has", value: "pending revision", onRemove: () => setPendingOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 84, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/materials/${r.id}`}>{r.code}</RefLink> },
    { key: "name", header: "Material", width: 270, sortable: true, text: (r) => r.name, render: (r) => <RefLink href={`/procurement/materials/${r.id}`}>{r.name}</RefLink> },
    { key: "category", header: "Category", width: 150, sortable: true, text: (r) => r.category, render: (r) => <span className="text-muted">{titleise(r.category)}</span> },
    { key: "grade", header: "Grade", width: 110, text: (r) => r.grade, render: (r) => <span className="font-num text-[11.5px]">{r.grade}</span> },
    {
      key: "currentPrice", header: "Current ₹/kg", width: 112, align: "right", sortable: true,
      text: (r) => String(r.currentPrice ?? ""),
      render: (r) => (r.currentPrice ? <span className="font-medium">{ratePerKg(r.currentPrice)}</span> : <span className="text-muted">No rate</span>),
    },
    {
      key: "currentFrom", header: "Effective", width: 100, sortable: true,
      text: (r) => r.currentFrom ?? "",
      render: (r) => <span className="text-muted">{date(r.currentFrom)}</span>,
    },
    {
      key: "pendingPrice", header: "Pending", width: 132, align: "right",
      text: (r) => String(r.pendingPrice ?? ""),
      render: (r) => {
        if (!r.pendingPrice) return <span className="text-muted">—</span>;
        const delta = r.currentPrice ? ((r.pendingPrice - r.currentPrice) / r.currentPrice) * 100 : 0;
        return (
          <span className="flex items-center justify-end gap-1.5">
            <span className="font-num tabular-nums">{ratePerKg(r.pendingPrice)}</span>
            <Chip tone={delta > 8 ? "danger" : delta > 0 ? "warning" : "success"}>{percent(delta, 0)}</Chip>
          </span>
        );
      },
    },
    {
      key: "bestPrice", header: "Best quote", width: 108, align: "right", sortable: true,
      text: (r) => String(r.bestPrice ?? ""),
      render: (r) => {
        if (!r.bestPrice) return <span className="text-muted">—</span>;
        const cheaper = r.currentPrice !== null && r.bestPrice < r.currentPrice - 0.005;
        return <span className={cheaper ? "font-medium text-success" : ""}>{ratePerKg(r.bestPrice)}</span>;
      },
    },
    {
      key: "bestVendor", header: "Best vendor", width: 190,
      text: (r) => r.bestVendor,
      render: (r) => (r.bestVendorId ? <RefLink href={`/procurement/vendors/${r.bestVendorId}`}>{r.bestVendor}</RefLink> : <span className="text-muted">—</span>),
    },
    {
      key: "quotes", header: "Live quotes", width: 96, align: "right", sortable: true,
      text: (r) => String(r.quotes),
      render: (r) => (r.quotes ? r.quotes : <span className="text-muted">0</span>),
    },
    {
      key: "suppliers", header: "Suppliers", width: 88, align: "right", sortable: true,
      text: (r) => String(r.suppliers),
      render: (r) =>
        r.suppliers <= 1 ? (
          <span className="text-warning" title="Single-sourced">{r.suppliers}</span>
        ) : (
          r.suppliers
        ),
    },
    {
      key: "usedIn", header: "Used in", width: 84, align: "right", sortable: true,
      text: (r) => String(r.usedIn),
      render: (r) => (r.usedIn ? r.usedIn : <span className="text-muted">0</span>),
    },
    { key: "leadTimeDays", header: "Lead", width: 68, align: "right", sortable: true, text: (r) => String(r.leadTimeDays), render: (r) => <span className="text-muted">{r.leadTimeDays} d</span> },
  ];

  return (
    <ListShell
      title="Material prices"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search material, grade, vendor"
      crumbs={crumbs}
      onClearFilters={() => { setCategory(""); setPendingOnly(false); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Category" value={category}
            onChange={(v) => { setCategory(v); setPage(0); }}
            options={presentOptions(rows, (r) => r.category)}
          />
          <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
            <input
              type="checkbox"
              checked={pendingOnly}
              onChange={(e) => { setPendingOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Pending revision
          </label>
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/materials/${r.id}`}
        emptyTitle="No materials match"
        emptyBody="Clear the category filter or search to see the whole rate base."
      />
    </ListShell>
  );
}
