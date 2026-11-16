"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, inquiryStatusTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  requisitionId: string | null; requisitionCode: string | null;
  issuedOn: string; dueOn: string | null;
  lineCount: number; firstMaterial: string; quantityKg: number;
  invited: number; responded: number; quoteCount: number;
  lowest: number; highest: number; selectedValue: number;
  raisedBy: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "SENT", "QUOTES_IN", "COMPARED", "CLOSED", "CANCELLED"];

export function InquiriesGrid({
  rows,
  canWrite,
  isVendorView,
}: {
  rows: Row[];
  canWrite: boolean;
  isVendorView: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "issuedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Quotes are in and nobody has run the comparison — the decision the
    // business is actually waiting on.
    if (awaitingOnly) out = out.filter((r) => r.quoteCount > 0 && r.status !== "COMPARED" && r.status !== "CLOSED");

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, awaitingOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const undecided = rows.filter((r) => r.quoteCount > 0 && r.status !== "COMPARED" && r.status !== "CLOSED").length;

  const crumbs: Crumb[] = [{ label: isVendorView ? "Inquiries to you" : "All inquiries" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (awaitingOnly) crumbs.push({ label: "Quotes in,", value: "not compared", onRemove: () => setAwaitingOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Inquiry", width: 118, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/procurement/inquiries/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 130, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={inquiryStatusTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "requisitionCode", header: "Against", width: 118, text: (r) => r.requisitionCode ?? "",
      render: (r) =>
        r.requisitionId ? (
          <RefLink href={`/procurement/requisitions/${r.requisitionId}`}>{r.requisitionCode}</RefLink>
        ) : (
          <span className="text-muted">direct</span>
        ),
    },
    {
      key: "firstMaterial", header: "Material", width: 210, text: (r) => r.firstMaterial,
      render: (r) => (
        <span className="text-muted">
          {r.firstMaterial}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "quantityKg", header: "Quantity", width: 108, align: "right", sortable: true, text: (r) => String(r.quantityKg), render: (r) => kg(r.quantityKg) },
    {
      key: "responded", header: "Responses", width: 116, align: "right", sortable: true,
      text: (r) => String(r.responded),
      render: (r) => (
        <span className="tnum">
          <span className={r.responded === 0 ? "text-muted" : "font-medium"}>{r.responded}</span>
          <span className="text-muted"> / {r.invited}</span>
        </span>
      ),
    },
    {
      key: "lowest", header: "Quote range", width: 190, align: "right", sortable: true,
      text: (r) => String(r.lowest),
      render: (r) => {
        if (r.quoteCount === 0) return <span className="text-muted">awaiting</span>;
        if (r.lowest === r.highest) return <span className="font-num tabular-nums">{money(r.lowest)}</span>;
        // The spread is the reason the inquiry exists — show it, not just a total.
        const spread = ((r.highest - r.lowest) / r.lowest) * 100;
        return (
          <span className="font-num text-[11.5px] tabular-nums">
            {money(r.lowest)} <span className="text-muted">–</span> {money(r.highest)}
            <span className="ml-1 text-warning">+{spread.toFixed(0)}%</span>
          </span>
        );
      },
    },
    {
      key: "dueOn", header: "Due", width: 100, sortable: true, text: (r) => r.dueOn ?? "",
      render: (r) => {
        if (!r.dueOn) return <span className="text-muted">—</span>;
        const overdue = new Date(r.dueOn) < new Date() && r.responded < r.invited && r.status !== "COMPARED";
        return <span className={overdue ? "font-medium text-danger" : "text-muted"}>{date(r.dueOn)}</span>;
      },
    },
    { key: "issuedOn", header: "Issued", width: 100, sortable: true, text: (r) => r.issuedOn, render: (r) => <span className="text-muted">{date(r.issuedOn)}</span> },
    { key: "raisedBy", header: "Raised by", width: 150, text: (r) => r.raisedBy, render: (r) => <span className="text-muted">{r.raisedBy}</span> },
  ];

  return (
    <ListShell
      title={isVendorView ? "Inquiries to you" : "Purchase inquiries"}
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search inquiry, requisition, material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setAwaitingOnly(false); setSearch(""); setPage(0); }}
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
          {!isVendorView && (
            <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
              <input
                type="checkbox"
                checked={awaitingOnly}
                onChange={(e) => { setAwaitingOnly(e.target.checked); setPage(0); }}
                className="h-[13px] w-[13px] accent-primary"
              />
              Awaiting comparison
            </label>
          )}
          {!isVendorView && undecided > 0 && (
            <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
              <span className="font-semibold text-ink">{undecided}</span> with quotes in
            </span>
          )}
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/procurement/inquiries/${r.id}`}
        emptyTitle={isVendorView ? "No inquiries have come to you" : "No inquiries match"}
        emptyBody={
          isVendorView
            ? "When an inquiry is issued to you it appears here with the quantities requested."
            : "Clear the filters, or approve a requisition and raise an inquiry from it."
        }
      />
    </ListShell>
  );
}
