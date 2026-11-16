"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, salesInquiryTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string; industry: string;
  projectId: string | null; projectName: string | null;
  receivedOn: string; requiredBy: string | null; source: string;
  description: string; lineCount: number; quantityKg: number; targetRate: number | null;
  quotationId: string | null; quotationCode: string | null; quotedValue: number | null;
  lostReason: string | null; owner: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "OPEN", "QUOTED", "WON", "LOST", "CLOSED"];

export function SalesInquiriesGrid({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [unquotedOnly, setUnquotedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "receivedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Came in and nobody has answered it — the pipeline leak worth watching.
    if (unquotedOnly) out = out.filter((r) => r.status === "OPEN" && !r.quotationId);

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, unquotedOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const won = rows.filter((r) => r.status === "WON").length;
  const decided = rows.filter((r) => ["WON", "LOST"].includes(r.status)).length;
  const winRate = decided > 0 ? (won / decided) * 100 : null;
  const unanswered = rows.filter((r) => r.status === "OPEN" && !r.quotationId).length;

  const crumbs: Crumb[] = [{ label: "All inquiries" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (unquotedOnly) crumbs.push({ label: "Open,", value: "not quoted", onRemove: () => setUnquotedOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    { key: "code", header: "Inquiry", width: 112, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/sales/inquiries/${r.id}`}>{r.code}</RefLink> },
    {
      key: "status", header: "Status", width: 128, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={salesInquiryTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 200, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    { key: "description", header: "What they asked for", width: 260, text: (r) => r.description, render: (r) => <span className="text-muted">{r.description}</span> },
    { key: "quantityKg", header: "Quantity", width: 104, align: "right", sortable: true, text: (r) => String(r.quantityKg), render: (r) => kg(r.quantityKg) },
    {
      key: "targetRate", header: "Their target", width: 108, align: "right", sortable: true,
      text: (r) => String(r.targetRate ?? ""),
      render: (r) => (r.targetRate ? <span className="text-muted">₹{r.targetRate.toFixed(2)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: "quotationCode", header: "Quotation", width: 118, text: (r) => r.quotationCode ?? "",
      render: (r) =>
        r.quotationId ? (
          <RefLink href={`/sales/quotations/${r.quotationId}`}>{r.quotationCode}</RefLink>
        ) : r.status === "OPEN" ? (
          <span className="text-warning">not quoted</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "quotedValue", header: "Quoted", width: 122, align: "right", sortable: true,
      text: (r) => String(r.quotedValue ?? ""),
      render: (r) => (r.quotedValue ? <span className="font-medium">{money(r.quotedValue)}</span> : <span className="text-muted">—</span>),
    },
    {
      key: "requiredBy", header: "Required by", width: 108, sortable: true, text: (r) => r.requiredBy ?? "",
      render: (r) => {
        if (!r.requiredBy) return <span className="text-muted">—</span>;
        const late = new Date(r.requiredBy) < new Date() && ["OPEN", "QUOTED"].includes(r.status);
        return <span className={late ? "font-medium text-danger" : "text-muted"}>{date(r.requiredBy)}</span>;
      },
    },
    { key: "source", header: "Came in via", width: 190, text: (r) => r.source, render: (r) => <span className="text-muted">{r.source}</span> },
    { key: "receivedOn", header: "Received", width: 100, sortable: true, text: (r) => r.receivedOn, render: (r) => <span className="text-muted">{date(r.receivedOn)}</span> },
  ];

  return (
    <ListShell
      title="Sales inquiries"
      count={filtered.length}
      newHref="/sales/inquiries/new"
      newLabel="New inquiry"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search inquiry, customer, requirement"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setUnquotedOnly(false); setSearch(""); setPage(0); }}
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
              checked={unquotedOnly}
              onChange={(e) => { setUnquotedOnly(e.target.checked); setPage(0); }}
              className="h-[13px] w-[13px] accent-primary"
            />
            Unanswered
          </label>
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            {winRate !== null && (
              <>
                Win rate <span className="font-num font-semibold tabular-nums text-ink">{winRate.toFixed(0)}%</span>
                <span className="text-muted"> of {decided} decided</span>
              </>
            )}
            {unanswered > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-warning-text">{unanswered}</span> unanswered
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
        hrefFor={(r) => `/sales/inquiries/${r.id}`}
        emptyTitle="No inquiries match"
        emptyBody="Clear the filters, or log a new customer requirement to start the chain."
      />
    </ListShell>
  );
}
