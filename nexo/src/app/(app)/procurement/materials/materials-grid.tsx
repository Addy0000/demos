"use client";

import { presentOptions } from "@/lib/enums";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { IconAlert } from "@/components/icons";
import { ratePerKg, kgPlain, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; category: string; grade: string;
  casNumber: string; hsnCode: string; kValue: number | null; uom: string; specNote: string;
  isHazardous: boolean; isActive: boolean; price: number | null;
  onHand: number; reorderLevel: number; belowReorder: boolean; leadTimeDays: number;
  suppliers: number; usedIn: number; documents: number;
};

const PAGE_SIZE = 100;

export function MaterialsGrid({ rows, seesPrices }: { rows: Row[]; seesPrices: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [hazardousOnly, setHazardousOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (category) out = out.filter((r) => r.category === category);
    if (hazardousOnly) out = out.filter((r) => r.isHazardous);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, category, hazardousOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All materials" }];
  if (category) crumbs.push({ label: "Category =", value: titleise(category), onRemove: () => setCategory("") });
  if (hazardousOnly) crumbs.push({ label: "Hazardous =", value: "true", onRemove: () => setHazardousOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 84, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/procurement/materials/${r.id}`}>{r.code}</RefLink> },
    {
      key: "name", header: "Material", width: 265, sortable: true,
      text: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <RefLink href={`/procurement/materials/${r.id}`}>{r.name}</RefLink>
          {r.isHazardous && (
            <IconAlert size={12} className="shrink-0 text-warning-text" aria-label="Hazardous">
              <title>Hazardous — handle per SDS</title>
            </IconAlert>
          )}
        </span>
      ),
    },
    { key: "category", header: "Category", width: 150, sortable: true, text: (r) => r.category, render: (r) => <span className="text-muted">{titleise(r.category)}</span> },
    { key: "grade", header: "Grade", width: 110, sortable: true, text: (r) => r.grade, render: (r) => <span className="font-num text-[11.5px]">{r.grade}</span> },
    { key: "kValue", header: "K-value", width: 74, align: "right", sortable: true, text: (r) => String(r.kValue ?? ""), render: (r) => (r.kValue ? <span className="font-medium">K{r.kValue}</span> : <span className="text-muted">—</span>) },
    { key: "casNumber", header: "CAS no.", width: 116, text: (r) => r.casNumber, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.casNumber}</span> },
    { key: "hsnCode", header: "HSN", width: 90, text: (r) => r.hsnCode, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.hsnCode}</span> },
    ...(seesPrices
      ? ([{
          key: "price", header: "Rate ₹/kg", width: 104, align: "right", sortable: true,
          text: (r: Row) => String(r.price ?? ""),
          render: (r: Row) => (r.price ? <span className="font-medium">{ratePerKg(r.price)}</span> : <span className="text-muted">No rate</span>),
        }] as Column<Row>[])
      : []),
    {
      key: "onHand", header: "On hand kg", width: 118, align: "right", sortable: true,
      text: (r) => String(r.onHand),
      render: (r) => <span className={r.belowReorder ? "font-medium text-danger" : ""}>{kgPlain(r.onHand)}</span>,
    },
    { key: "reorderLevel", header: "Reorder at", width: 104, align: "right", sortable: true, text: (r) => String(r.reorderLevel), render: (r) => <span className="text-muted">{kgPlain(r.reorderLevel)}</span> },
    { key: "leadTimeDays", header: "Lead", width: 64, align: "right", sortable: true, text: (r) => String(r.leadTimeDays), render: (r) => <span className="text-muted">{r.leadTimeDays} d</span> },
    {
      key: "suppliers", header: "Suppliers", width: 86, align: "right", sortable: true,
      text: (r) => String(r.suppliers),
      render: (r) => (r.suppliers <= 1 ? <span className="text-warning" title="Single-sourced">{r.suppliers}</span> : r.suppliers),
    },
    { key: "usedIn", header: "Used in", width: 78, align: "right", sortable: true, text: (r) => String(r.usedIn), render: (r) => (r.usedIn ? r.usedIn : <span className="text-muted">0</span>) },
    { key: "documents", header: "Docs", width: 62, align: "right", text: (r) => String(r.documents), render: (r) => (r.documents ? r.documents : <span className="text-muted">0</span>) },
    { key: "specNote", header: "Key specification", width: 340, text: (r) => r.specNote, render: (r) => <span className="text-muted">{r.specNote || "—"}</span> },
  ];

  return (
    <ListShell
      title="Raw materials"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search name, grade, CAS number"
      crumbs={crumbs}
      onClearFilters={() => { setCategory(""); setHazardousOnly(false); setSearch(""); setPage(0); }}
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
              checked={hazardousOnly}
              onChange={(e) => { setHazardousOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Hazardous only
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
        emptyBody="Clear the category filter or search to see the full material master."
      />
    </ListShell>
  );
}
