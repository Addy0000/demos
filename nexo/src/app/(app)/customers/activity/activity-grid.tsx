"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { dateTime, relative, titleise } from "@/lib/format";

type Row = {
  id: string; kind: string; subject: string; occurredAt: string;
  customerId: string; customerCode: string; customerName: string; user: string;
};

const PAGE_SIZE = 100;
const KINDS = ["CALL", "EMAIL", "MEETING", "SAMPLE_SENT", "QUOTE_SENT", "COMPLAINT", "NOTE"];

const kindTone = (k: string) =>
  k === "COMPLAINT" ? "danger" : k === "SAMPLE_SENT" ? "special" : k === "QUOTE_SENT" ? "warning" : "info";

export function ActivityGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => (kind ? rows.filter((r) => r.kind === kind) : rows), [rows, kind]);
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const crumbs: Crumb[] = [{ label: "All activity" }];
  if (kind) crumbs.push({ label: "Type =", value: titleise(kind), onRemove: () => setKind("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "occurredAt", header: "When", width: 140,
      text: (r) => r.occurredAt,
      render: (r) => <span className="font-num text-[11.5px] text-muted">{dateTime(r.occurredAt)}</span>,
    },
    {
      key: "age", header: "Age", width: 100,
      text: (r) => r.occurredAt,
      render: (r) => <span className="text-muted">{relative(r.occurredAt)}</span>,
    },
    {
      key: "kind", header: "Type", width: 130,
      text: (r) => r.kind,
      render: (r) => <Chip tone={kindTone(r.kind)}>{titleise(r.kind)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 210,
      text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    { key: "subject", header: "Subject", width: 380, text: (r) => r.subject, render: (r) => r.subject },
    { key: "user", header: "Logged by", width: 150, text: (r) => r.user, render: (r) => <span className="text-muted">{r.user}</span> },
  ];

  return (
    <ListShell
      title="Customer activity"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search subject or customer"
      crumbs={crumbs}
      onClearFilters={() => { setKind(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <FilterSelect
          label="Type" value={kind}
          onChange={(v) => { setKind(v); setPage(0); }}
          options={KINDS.map((k) => ({ value: k, label: titleise(k) }))}
        />
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        hrefFor={(r) => `/customers/${r.customerId}`}
        emptyTitle="No activity matches"
        emptyBody="Clear the type filter or search to see the full activity trail."
      />
    </ListShell>
  );
}
