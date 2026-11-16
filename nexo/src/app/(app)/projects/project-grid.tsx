"use client";

import { useTenant } from "@/components/appearance";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, DotLabel, projectStageTone, priorityTone } from "@/components/ui/chip";
import { ratePerKg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; name: string; application: string; stage: string; priority: string;
  customerId: string | null; customer: string; manager: string; standard: string;
  shoreA: number | null; tempRating: string; targetPrice: number | null; volumeMt: number | null;
  lines: number; version: number; documents: number; demos: number;
  targetDate: string | null; startedAt: string;
};

const PAGE_SIZE = 50;
const STAGES = [
  "ENQUIRY", "FORMULATION", "LAB_TRIAL", "SAMPLE_WITH_CUSTOMER",
  "PLANT_TRIAL", "APPROVED", "IN_PRODUCTION", "ON_HOLD", "DROPPED",
];
const PRIORITIES = ["CRITICAL", "HIGH", "MODERATE", "LOW", "PLANNING"];
const PRIORITY_ORDER = Object.fromEntries(PRIORITIES.map((p, i) => [p, i]));

export function ProjectGrid({ rows, canWrite }: { rows: Row[]; canWrite: boolean }) {
  const noun = useTenant().noun;
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "priority", dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (stage) out = out.filter((r) => r.stage === stage);
    if (priority) out = out.filter((r) => r.priority === priority);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sort.key === "priority") {
        return ((PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)) * dir;
      }
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, stage, priority, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All projects" }];
  if (stage) crumbs.push({ label: "Stage =", value: titleise(stage), onRemove: () => setStage("") });
  if (priority) crumbs.push({ label: "Priority =", value: titleise(priority), onRemove: () => setPriority("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Code", width: 88, sortable: true,
      text: (r) => r.code,
      render: (r) => <RefLink href={`/projects/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "name", header: noun.one, width: 280, sortable: true,
      text: (r) => r.name,
      render: (r) => <RefLink href={`/projects/${r.id}`}>{r.name}</RefLink>,
    },
    {
      key: "priority", header: "Priority", width: 108, sortable: true,
      text: (r) => r.priority,
      render: (r) => <DotLabel tone={priorityTone(r.priority)}>{titleise(r.priority)}</DotLabel>,
    },
    {
      key: "stage", header: "Stage", width: 148, sortable: true,
      text: (r) => r.stage,
      render: (r) => <Chip tone={projectStageTone(r.stage)}>{titleise(r.stage)}</Chip>,
    },
    {
      key: "customer", header: "Customer", width: 180, sortable: true,
      text: (r) => r.customer,
      render: (r) =>
        r.customerId ? <RefLink href={`/customers/${r.customerId}`}>{r.customer}</RefLink> : <span className="text-muted">—</span>,
    },
    { key: "application", header: "Application", width: 200, text: (r) => r.application, render: (r) => <span className="text-muted">{r.application}</span> },
    { key: "standard", header: "Standard", width: 145, text: (r) => r.standard, render: (r) => <span className="font-num text-[11.5px]">{r.standard}</span> },
    {
      key: "shoreA", header: "Shore A", width: 78, align: "right", sortable: true,
      text: (r) => String(r.shoreA ?? ""),
      render: (r) => (r.shoreA ? r.shoreA : <span className="text-muted">—</span>),
    },
    { key: "tempRating", header: "Temp", width: 68, align: "right", text: (r) => r.tempRating, render: (r) => <span className="text-muted">{r.tempRating}</span> },
    {
      key: "targetPrice", header: "Target ₹/kg", width: 100, align: "right", sortable: true,
      text: (r) => String(r.targetPrice ?? ""),
      render: (r) => (r.targetPrice ? ratePerKg(r.targetPrice) : <span className="text-muted">—</span>),
    },
    {
      key: "volumeMt", header: "Est. MT/yr", width: 92, align: "right", sortable: true,
      text: (r) => String(r.volumeMt ?? ""),
      render: (r) => (r.volumeMt ? r.volumeMt.toFixed(1) : <span className="text-muted">—</span>),
    },
    {
      key: "lines", header: "Formulation", width: 100, align: "right",
      text: (r) => String(r.lines),
      render: (r) =>
        r.lines ? (
          <span title={`Version ${r.version}`}>
            {r.lines} <span className="text-muted">lines</span>
          </span>
        ) : (
          <span className="text-muted">none</span>
        ),
    },
    {
      key: "documents", header: "Docs", width: 64, align: "right",
      text: (r) => String(r.documents),
      render: (r) => (r.documents ? r.documents : <span className="text-muted">0</span>),
    },
    {
      key: "demos", header: "Samples", width: 74, align: "right",
      text: (r) => String(r.demos),
      render: (r) => (r.demos ? r.demos : <span className="text-muted">0</span>),
    },
    { key: "manager", header: "Manager", width: 160, text: (r) => r.manager, render: (r) => <span className="text-muted">{r.manager}</span> },
    {
      key: "targetDate", header: "Target", width: 100, sortable: true,
      text: (r) => r.targetDate ?? "",
      render: (r) => {
        if (!r.targetDate) return <span className="text-muted">—</span>;
        const overdue =
          new Date(r.targetDate) < new Date() && !["APPROVED", "IN_PRODUCTION", "DROPPED"].includes(r.stage);
        return <span className={overdue ? "font-medium text-danger" : "text-muted"}>{date(r.targetDate)}</span>;
      },
    },
  ];

  return (
    <ListShell
      title="Projects"
      count={filtered.length}
      newHref={canWrite ? "/projects/new" : undefined}
      newLabel="New project"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder={`Search ${noun.one.toLowerCase()}, application, standard`}
      crumbs={crumbs}
      onClearFilters={() => { setStage(""); setPriority(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Stage" value={stage}
            onChange={(v) => { setStage(v); setPage(0); }}
            options={STAGES.map((s) => ({ value: s, label: titleise(s) }))}
          />
          <FilterSelect
            label="Priority" value={priority}
            onChange={(v) => { setPriority(v); setPage(0); }}
            options={PRIORITIES.map((s) => ({ value: s, label: titleise(s) }))}
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
        hrefFor={(r) => `/projects/${r.id}`}
        emptyTitle="No projects match"
        emptyBody="Adjust the stage or priority filter, or clear the search."
      />
    </ListShell>
  );
}
