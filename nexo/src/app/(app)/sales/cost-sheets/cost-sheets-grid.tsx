"use client";

import { useTenant } from "@/components/appearance";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, costSheetTone, marginTone } from "@/components/ui/chip";
import { date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  projectId: string; projectName: string; projectCode: string; application: string;
  customerName: string;
  materialCost: number; conversion: number; overheadPct: number;
  marginPct: number; sellingRate: number; contribution: number;
  materialLines: number; quotationCount: number;
  preparedBy: string; approvedBy: string; preparedOn: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUPERSEDED"];

export function CostSheetsGrid({ rows, canApprove }: { rows: Row[]; canApprove: boolean }) {
  const noun = useTenant().noun;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [thinOnly, setThinOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "preparedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Under 8% is where a compound stops paying for the plant that made it.
    if (thinOnly) out = out.filter((r) => r.marginPct < 8);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, thinOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const awaiting = rows.filter((r) => r.status === "PENDING_APPROVAL").length;
  const thin = rows.filter((r) => r.marginPct < 8).length;

  const crumbs: Crumb[] = [{ label: "All cost sheets" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (thinOnly) crumbs.push({ label: "Margin", value: "under 8%", onRemove: () => setThinOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Cost sheet", width: 118, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/sales/cost-sheets/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 150, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={costSheetTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "projectName", header: noun.one, width: 210, sortable: true, text: (r) => r.projectName,
      render: (r) => (
        <>
          <RefLink href={`/projects/${r.projectId}`}>{r.projectName}</RefLink>
          <span className="block text-[11px] text-muted">{r.application}</span>
        </>
      ),
    },
    { key: "customerName", header: "Customer", width: 190, sortable: true, text: (r) => r.customerName, render: (r) => <span className="text-muted">{r.customerName}</span> },
    {
      key: "materialCost", header: "Material", width: 100, align: "right", sortable: true,
      text: (r) => String(r.materialCost),
      render: (r) => <span className="text-muted">₹{r.materialCost.toFixed(2)}</span>,
    },
    {
      key: "conversion", header: "Conversion", width: 100, align: "right", sortable: true,
      text: (r) => String(r.conversion),
      render: (r) => <span className="text-muted">₹{r.conversion.toFixed(2)}</span>,
    },
    {
      key: "sellingRate", header: "Selling rate", width: 112, align: "right", sortable: true,
      text: (r) => String(r.sellingRate),
      render: (r) => <span className="font-medium">₹{r.sellingRate.toFixed(2)}</span>,
    },
    {
      key: "contribution", header: "Earns/kg", width: 100, align: "right", sortable: true,
      text: (r) => String(r.contribution),
      render: (r) => (
        <span className={r.contribution > 0 ? "text-success-text" : "text-danger-text"}>
          ₹{r.contribution.toFixed(2)}
        </span>
      ),
    },
    {
      key: "marginPct", header: "Margin", width: 92, align: "right", sortable: true,
      text: (r) => String(r.marginPct),
      render: (r) => <Chip tone={marginTone(r.marginPct)}>{r.marginPct.toFixed(1)}%</Chip>,
    },
    {
      key: "quotationCount", header: "Quoted on", width: 88, align: "right", text: (r) => String(r.quotationCount),
      render: (r) => (r.quotationCount ? r.quotationCount : <span className="text-muted">—</span>),
    },
    { key: "preparedBy", header: "Prepared by", width: 150, text: (r) => r.preparedBy, render: (r) => <span className="text-muted">{r.preparedBy}</span> },
    { key: "preparedOn", header: "Prepared", width: 100, sortable: true, text: (r) => r.preparedOn, render: (r) => <span className="text-muted">{date(r.preparedOn)}</span> },
  ];

  return (
    <ListShell
      title="Cost sheets"
      count={filtered.length}
      newHref="/sales/cost-sheets/new"
      newLabel="New cost sheet"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder={`Search sheet, ${noun.one.toLowerCase()}, customer`}
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setThinOnly(false); setSearch(""); setPage(0); }}
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
              checked={thinOnly}
              onChange={(e) => { setThinOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Thin margin
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            {canApprove && awaiting > 0 && (
              <>
                <span className="font-semibold text-ink">{awaiting}</span> awaiting you
                {thin > 0 && " · "}
              </>
            )}
            {thin > 0 && (
              <>
                <span className="font-semibold text-danger-text">{thin}</span> under 8%
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
        hrefFor={(r) => `/sales/cost-sheets/${r.id}`}
        emptyTitle="No cost sheets match"
        emptyBody="A sheet is built from a project's formulation against the current approved rates."
      />
    </ListShell>
  );
}
