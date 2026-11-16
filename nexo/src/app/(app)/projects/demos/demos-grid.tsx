"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, demoStatusTone } from "@/components/ui/chip";
import { date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; title: string; status: string;
  projectId: string; projectCode: string; projectName: string;
  customerId: string | null; customer: string;
  quantityKg: number | null; batchRef: string;
  dispatchedOn: string | null; courierRef: string;
  feedbackOn: string | null; feedback: string;
  measuredShoreA: number | null; targetShoreA: number | null;
  measuredTensile: number | null; measuredElongation: number | null;
};

const PAGE_SIZE = 50;
const STATUSES = ["PLANNED", "IN_LAB", "DISPATCHED", "UNDER_EVALUATION", "APPROVED", "REJECTED"];

export function DemosGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => (status ? rows.filter((r) => r.status === status) : rows), [rows, status]);
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const crumbs: Crumb[] = [{ label: "All samples" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", width: 104, text: (r) => r.code, render: (r) => <span className="font-num text-muted">{r.code}</span> },
    { key: "title", header: "Sample", width: 250, text: (r) => r.title, render: (r) => <RefLink href={`/projects/${r.projectId}`}>{r.title}</RefLink> },
    { key: "status", header: "Status", width: 150, text: (r) => r.status, render: (r) => <Chip tone={demoStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    {
      key: "projectName", header: "Project", width: 230,
      text: (r) => r.projectName,
      render: (r) => <RefLink href={`/projects/${r.projectId}`}>{r.projectName}</RefLink>,
    },
    {
      key: "customer", header: "Customer", width: 170,
      text: (r) => r.customer,
      render: (r) => (r.customerId ? <RefLink href={`/customers/${r.customerId}`}>{r.customer}</RefLink> : <span className="text-muted">—</span>),
    },
    {
      key: "quantityKg", header: "Qty", width: 72, align: "right",
      text: (r) => String(r.quantityKg ?? ""),
      render: (r) => (r.quantityKg ? `${r.quantityKg.toFixed(0)} kg` : <span className="text-muted">—</span>),
    },
    { key: "batchRef", header: "Batch", width: 90, text: (r) => r.batchRef, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.batchRef}</span> },
    {
      key: "dispatchedOn", header: "Dispatched", width: 100,
      text: (r) => r.dispatchedOn ?? "",
      render: (r) => <span className="text-muted">{date(r.dispatchedOn)}</span>,
    },
    { key: "courierRef", header: "Courier ref", width: 120, text: (r) => r.courierRef, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.courierRef}</span> },
    {
      key: "measuredShoreA", header: "Shore A", width: 100, align: "right",
      text: (r) => String(r.measuredShoreA ?? ""),
      render: (r) => {
        if (r.measuredShoreA === null) return <span className="text-muted">—</span>;
        const off = r.targetShoreA !== null && Math.abs(r.measuredShoreA - r.targetShoreA) > 3;
        return (
          <span className={off ? "font-medium text-danger" : ""} title={r.targetShoreA ? `Target ${r.targetShoreA}` : undefined}>
            {r.measuredShoreA}
            {r.targetShoreA !== null && <span className="ml-1 text-[11px] text-muted">/{r.targetShoreA}</span>}
          </span>
        );
      },
    },
    {
      key: "measuredTensile", header: "Tensile", width: 84, align: "right",
      text: (r) => String(r.measuredTensile ?? ""),
      render: (r) => (r.measuredTensile !== null ? `${r.measuredTensile.toFixed(1)}` : <span className="text-muted">—</span>),
    },
    {
      key: "measuredElongation", header: "Elong. %", width: 84, align: "right",
      text: (r) => String(r.measuredElongation ?? ""),
      render: (r) => (r.measuredElongation !== null ? r.measuredElongation : <span className="text-muted">—</span>),
    },
    {
      key: "feedback", header: "Customer feedback", width: 330,
      text: (r) => r.feedback,
      render: (r) => (r.feedback ? <span className="text-muted">{r.feedback}</span> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <ListShell
      title="Samples & demos"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search sample, project, customer"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <FilterSelect
          label="Status" value={status}
          onChange={(v) => { setStatus(v); setPage(0); }}
          options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
        />
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        hrefFor={(r) => `/projects/${r.projectId}`}
        emptyTitle="No samples match"
        emptyBody="Samples appear here once raised against a project."
      />
    </ListShell>
  );
}
