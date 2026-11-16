"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, salesQuotationTone, marginTone } from "@/components/ui/chip";
import { money, kg, date, titleise } from "@/lib/format";

type Row = {
  id: string; code: string; status: string;
  customerId: string; customerName: string;
  inquiryId: string | null; inquiryCode: string | null;
  costSheetId: string | null; costSheetCode: string | null; costSheetApproved: boolean;
  sheetMargin: number | null; realisedMargin: number | null;
  issuedOn: string; validUntil: string | null;
  lineCount: number; firstProject: string; quantityKg: number; totalValue: number;
  orderId: string | null; orderCode: string | null;
  owner: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "SENT", "UNDER_NEGOTIATION", "ACCEPTED", "REJECTED", "EXPIRED"];

export function QuotationsGrid({
  rows,
  canSeeMargin,
  canOrder,
}: {
  rows: Row[];
  canSeeMargin: boolean;
  canOrder: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [unsignedOnly, setUnsignedOnly] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "issuedOn", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    // Live quotations resting on a margin Finance has not signed.
    if (unsignedOnly) {
      out = out.filter(
        (r) => r.costSheetId && !r.costSheetApproved && !["REJECTED", "EXPIRED"].includes(r.status),
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof Row];
      const y = b[sort.key as keyof Row];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, unsignedOnly, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const live = filtered.filter((r) => ["SENT", "UNDER_NEGOTIATION"].includes(r.status));
  const liveValue = live.reduce((a, r) => a + r.totalValue, 0);
  const unsigned = rows.filter((r) => r.costSheetId && !r.costSheetApproved && !["REJECTED", "EXPIRED"].includes(r.status)).length;

  const crumbs: Crumb[] = [{ label: "All quotations" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (unsignedOnly) crumbs.push({ label: "Margin", value: "not signed", onRemove: () => setUnsignedOnly(false) });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "code", header: "Quotation", width: 118, sortable: true, text: (r) => r.code,
      render: (r) => <RefLink href={`/sales/quotations/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status", header: "Status", width: 158, sortable: true, text: (r) => r.status,
      render: (r) => <Chip tone={salesQuotationTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "customerName", header: "Customer", width: 210, sortable: true, text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    {
      key: "firstProject", header: "Compound", width: 196, text: (r) => r.firstProject,
      render: (r) => (
        <span className="text-muted">
          {r.firstProject}
          {r.lineCount > 1 && <span className="ml-1 text-[11px]">+{r.lineCount - 1}</span>}
        </span>
      ),
    },
    { key: "quantityKg", header: "Quantity", width: 104, align: "right", sortable: true, text: (r) => String(r.quantityKg), render: (r) => kg(r.quantityKg) },
    { key: "totalValue", header: "Value", width: 124, align: "right", sortable: true, text: (r) => String(r.totalValue), render: (r) => <span className="font-medium">{money(r.totalValue)}</span> },
    ...(canSeeMargin
      ? [
          {
            key: "realisedMargin", header: "Margin quoted", width: 118, align: "right" as const, sortable: true,
            text: (r: Row) => String(r.realisedMargin ?? ""),
            render: (r: Row) =>
              r.realisedMargin === null ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="flex items-center justify-end gap-1.5">
                  <Chip tone={marginTone(r.realisedMargin)}>{r.realisedMargin.toFixed(1)}%</Chip>
                  {r.sheetMargin !== null && Math.abs(r.realisedMargin - r.sheetMargin) > 0.5 && (
                    <span
                      className="text-[10.5px] text-muted"
                      title={`Cost sheet said ${r.sheetMargin.toFixed(1)}%`}
                    >
                      vs {r.sheetMargin.toFixed(0)}%
                    </span>
                  )}
                </span>
              ),
          },
          {
            key: "costSheetCode", header: "Cost sheet", width: 122,
            text: (r: Row) => r.costSheetCode ?? "",
            render: (r: Row) =>
              r.costSheetId ? (
                <span className="flex items-center gap-1.5">
                  <RefLink href={`/sales/cost-sheets/${r.costSheetId}`}>{r.costSheetCode}</RefLink>
                  {!r.costSheetApproved && (
                    <span className="text-[10.5px] text-warning" title="Margin not signed by Finance">
                      unsigned
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted">none</span>
              ),
          },
        ]
      : []),
    {
      key: "validUntil", header: "Valid to", width: 100, sortable: true, text: (r) => r.validUntil ?? "",
      render: (r) => {
        if (!r.validUntil) return <span className="text-muted">—</span>;
        const expired = new Date(r.validUntil) < new Date() && ["SENT", "UNDER_NEGOTIATION"].includes(r.status);
        return <span className={expired ? "font-medium text-danger" : "text-muted"}>{date(r.validUntil)}</span>;
      },
    },
    {
      key: "orderCode", header: "Order", width: 112, text: (r) => r.orderCode ?? "",
      render: (r) =>
        r.orderId ? <RefLink href={`/sales/orders/${r.orderId}`}>{r.orderCode}</RefLink> : <span className="text-muted">—</span>,
    },
    { key: "owner", header: "Owner", width: 150, text: (r) => r.owner, render: (r) => <span className="text-muted">{r.owner}</span> },
  ];

  return (
    <ListShell
      title="Sales quotations"
      count={filtered.length}
      newHref="/sales/quotations/new"
      newLabel="New quotation"
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search quotation, customer, compound"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setUnsignedOnly(false); setSearch(""); setPage(0); }}
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
          {canSeeMargin && (
            <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-ink">
              <input
                type="checkbox"
                checked={unsignedOnly}
                onChange={(e) => { setUnsignedOnly(e.target.checked); setPage(0); }}
                className="h-[13px] w-[13px] accent-primary"
              />
              Margin unsigned
            </label>
          )}
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Live <span className="font-num font-semibold tabular-nums text-ink">{money(liveValue)}</span>
            {canSeeMargin && unsigned > 0 && (
              <>
                {" · "}
                <span className="font-semibold text-warning-text">{unsigned}</span> unsigned
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
        hrefFor={(r) => `/sales/quotations/${r.id}`}
        emptyTitle="No quotations match"
        emptyBody="A quotation is built from a cost sheet against a customer inquiry."
      />
    </ListShell>
  );
}
