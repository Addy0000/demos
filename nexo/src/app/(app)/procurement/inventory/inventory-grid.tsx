"use client";

import { presentOptions } from "@/lib/enums";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { money, kg, kgPlain, ratePerKg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; category: string; grade: string;
  onHand: number; batches: number; reorderLevel: number; reorderQty: number;
  leadTimeDays: number; rate: number | null; stockValue: number;
  daysCover: number | null; belowReorder: boolean; oldestReceipt: string | null;
};

const PAGE_SIZE = 100;

export function InventoryGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (category) out = out.filter((r) => r.category === category);
    if (lowOnly) out = out.filter((r) => r.belowReorder);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, category, lowOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const totalValue = filtered.reduce((a, r) => a + r.stockValue, 0);
  const lowCount = rows.filter((r) => r.belowReorder).length;

  const crumbs: Crumb[] = [{ label: "Active materials" }];
  if (category) crumbs.push({ label: "Category =", value: titleise(category), onRemove: () => setCategory("") });
  if (lowOnly) crumbs.push({ label: "Stock", value: "below reorder", onRemove: () => setLowOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 84, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/materials/${r.id}`}>{r.code}</RefLink> },
    { key: "name", header: "Material", width: 260, sortable: true, text: (r) => r.name, render: (r) => <RefLink href={`/procurement/materials/${r.id}`}>{r.name}</RefLink> },
    { key: "category", header: "Category", width: 150, sortable: true, text: (r) => r.category, render: (r) => <span className="text-muted">{titleise(r.category)}</span> },
    { key: "grade", header: "Grade", width: 105, text: (r) => r.grade, render: (r) => <span className="font-num text-[11.5px]">{r.grade}</span> },
    {
      key: "onHand", header: "On hand", width: 122, align: "right", sortable: true,
      text: (r) => String(r.onHand),
      render: (r) => (
        <span className={r.belowReorder ? "font-medium text-danger" : r.onHand === 0 ? "text-muted" : ""}>
          {kgPlain(r.onHand)}
        </span>
      ),
    },
    {
      key: "reorderLevel", header: "Reorder at", width: 108, align: "right", sortable: true,
      text: (r) => String(r.reorderLevel),
      render: (r) => <span className="text-muted">{kgPlain(r.reorderLevel)}</span>,
    },
    {
      key: "coverBar", header: "Position", width: 96, align: "right",
      text: (r) => String(r.onHand),
      render: (r) => {
        const pct = r.reorderLevel > 0 ? Math.min(200, (r.onHand / r.reorderLevel) * 100) : 100;
        const tone = pct < 100 ? "bg-danger" : pct < 150 ? "bg-warning" : "bg-success";
        return (
          <span className="flex items-center justify-end">
            <span className="h-[5px] w-[64px] overflow-hidden rounded-sm bg-faint">
              <span className={`block h-full rounded-sm transition-[width] duration-500 ease-out ${tone}`} style={{ width: `${pct / 2}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "daysCover", header: "Days cover", width: 100, align: "right", sortable: true,
      text: (r) => String(r.daysCover ?? ""),
      render: (r) => {
        if (r.daysCover === null) return <span className="text-muted">no usage</span>;
        const tight = r.daysCover < r.leadTimeDays;
        return (
          <span
            className={tight ? "font-medium text-danger" : ""}
            title={tight ? `Below the ${r.leadTimeDays}-day lead time` : undefined}
          >
            {r.daysCover.toFixed(0)} d
          </span>
        );
      },
    },
    { key: "leadTimeDays", header: "Lead", width: 66, align: "right", sortable: true, text: (r) => String(r.leadTimeDays), render: (r) => <span className="text-muted">{r.leadTimeDays} d</span> },
    { key: "batches", header: "Batches", width: 78, align: "right", sortable: true, text: (r) => String(r.batches), render: (r) => (r.batches ? r.batches : <span className="text-muted">0</span>) },
    { key: "rate", header: "Rate ₹/kg", width: 100, align: "right", sortable: true, text: (r) => String(r.rate ?? ""), render: (r) => (r.rate ? ratePerKg(r.rate) : <span className="text-muted">—</span>) },
    { key: "stockValue", header: "Stock value", width: 130, align: "right", sortable: true, text: (r) => String(r.stockValue), render: (r) => (r.stockValue ? <span className="font-medium">{money(r.stockValue)}</span> : <span className="text-muted">—</span>) },
    {
      key: "status", header: "Flag", width: 110,
      text: (r) => (r.belowReorder ? "low" : "ok"),
      render: (r) =>
        r.onHand === 0 ? <Chip tone="danger">Out of stock</Chip>
          : r.belowReorder ? <Chip tone="warning">Below reorder</Chip>
          : <Chip tone="success">Adequate</Chip>,
    },
    { key: "oldestReceipt", header: "Oldest lot", width: 100, text: (r) => r.oldestReceipt ?? "", render: (r) => <span className="text-muted">{date(r.oldestReceipt)}</span> },
  ];

  return (
    <ListShell
      title="Inventory"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search material, grade"
      crumbs={crumbs}
      onClearFilters={() => { setCategory(""); setLowOnly(false); setSearch(""); setPage(0); }}
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
              checked={lowOnly}
              onChange={(e) => { setLowOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Below reorder
            {lowCount > 0 && (
              <span className="rounded-full bg-danger-bg px-1.5 py-px font-num text-[10.5px] font-semibold text-danger">
                {lowCount}
              </span>
            )}
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Stock value <span className="font-num font-semibold tabular-nums text-ink">{money(totalValue)}</span>
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
        hrefFor={(r) => `/procurement/materials/${r.id}`}
        emptyTitle="No materials match"
        emptyBody="Clear the category filter or search to see the whole store position."
      />
    </ListShell>
  );
}
