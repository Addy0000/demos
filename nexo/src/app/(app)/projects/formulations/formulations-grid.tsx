"use client";

import { useTenant } from "@/components/appearance";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, projectStageTone } from "@/components/ui/chip";
import { ratePerKg, date, titleise } from "@/lib/format";

type Row = {
  id: string; projectId: string; code: string; name: string; application: string; stage: string;
  customer: string; version: number; components: number; totalPhr: number;
  resinPhr: number; plastPhr: number; fillerPhr: number;
  costPerKg: number | null; target: number | null; margin: number | null; updatedAt: string;
};

const PAGE_SIZE = 50;
const STAGES = ["ENQUIRY", "FORMULATION", "LAB_TRIAL", "SAMPLE_WITH_CUSTOMER", "PLANT_TRIAL", "APPROVED", "IN_PRODUCTION", "ON_HOLD", "DROPPED"];

export function FormulationsGrid({ rows, seesPrices }: { rows: Row[]; seesPrices: boolean }) {
  const noun = useTenant().noun;
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const out = stage ? rows.filter((r) => r.stage === stage) : rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, stage, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All formulations" }];
  if (stage) crumbs.push({ label: "Stage =", value: titleise(stage), onRemove: () => setStage("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Project", width: 88, sortable: true,
      text: (r) => r.code,
      render: (r) => <RefLink href={`/projects/${r.projectId}`}>{r.code}</RefLink>,
    },
    {
      key: "name", header: noun.one, width: 270, sortable: true,
      text: (r) => r.name,
      render: (r) => <RefLink href={`/projects/${r.projectId}`}>{r.name}</RefLink>,
    },
    {
      key: "stage", header: "Stage", width: 148, sortable: true,
      text: (r) => r.stage,
      render: (r) => <Chip tone={projectStageTone(r.stage)}>{titleise(r.stage)}</Chip>,
    },
    { key: "customer", header: "Customer", width: 170, text: (r) => r.customer, render: (r) => <span className="text-muted">{r.customer}</span> },
    {
      key: "version", header: "Ver.", width: 56, align: "right", sortable: true,
      text: (r) => String(r.version),
      render: (r) => <span className="text-muted">v{r.version}</span>,
    },
    {
      key: "components", header: "Components", width: 96, align: "right", sortable: true,
      text: (r) => String(r.components),
      render: (r) => r.components || <span className="text-muted">0</span>,
    },
    {
      key: "totalPhr", header: "Total phr", width: 92, align: "right", sortable: true,
      text: (r) => String(r.totalPhr),
      render: (r) => r.totalPhr.toFixed(2),
    },
    {
      key: "resinPhr", header: "Resin", width: 74, align: "right",
      text: (r) => String(r.resinPhr),
      render: (r) => (r.resinPhr ? r.resinPhr.toFixed(0) : <span className="text-muted">—</span>),
    },
    {
      key: "plastPhr", header: "Plast.", width: 74, align: "right",
      text: (r) => String(r.plastPhr),
      render: (r) => (r.plastPhr ? r.plastPhr.toFixed(1) : <span className="text-muted">—</span>),
    },
    {
      key: "fillerPhr", header: "Filler", width: 74, align: "right",
      text: (r) => String(r.fillerPhr),
      render: (r) => (r.fillerPhr ? r.fillerPhr.toFixed(1) : <span className="text-muted">—</span>),
    },
    ...(seesPrices
      ? ([
          {
            key: "costPerKg", header: "Cost ₹/kg", width: 100, align: "right", sortable: true,
            text: (r: Row) => String(r.costPerKg ?? ""),
            render: (r: Row) => (r.costPerKg ? <span className="font-medium">{ratePerKg(r.costPerKg)}</span> : <span className="text-muted">—</span>),
          },
          {
            key: "target", header: "Target ₹/kg", width: 100, align: "right", sortable: true,
            text: (r: Row) => String(r.target ?? ""),
            render: (r: Row) => (r.target ? ratePerKg(r.target) : <span className="text-muted">—</span>),
          },
          {
            key: "margin", header: "Margin", width: 94, align: "right", sortable: true,
            text: (r: Row) => String(r.margin ?? ""),
            render: (r: Row) =>
              r.margin === null ? (
                <span className="text-muted">—</span>
              ) : (
                <Chip tone={r.margin < 5 ? "danger" : r.margin < 15 ? "warning" : "success"}>
                  {r.margin.toFixed(1)}%
                </Chip>
              ),
          },
        ] as Column<Row>[])
      : []),
    {
      key: "updatedAt", header: "Updated", width: 100, sortable: true,
      text: (r) => r.updatedAt,
      render: (r) => <span className="text-muted">{date(r.updatedAt)}</span>,
    },
  ];

  return (
    <ListShell
      title="Formulations"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder={`Search ${noun.one.toLowerCase()} or customer`}
      crumbs={crumbs}
      onClearFilters={() => { setStage(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <FilterSelect
          label="Stage" value={stage}
          onChange={(v) => { setStage(v); setPage(0); }}
          options={STAGES.map((s) => ({ value: s, label: titleise(s) }))}
        />
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/projects/${r.projectId}`}
        emptyTitle="No formulations match"
        emptyBody="Formulations appear here once a project has components recorded against it."
      />
    </ListShell>
  );
}
