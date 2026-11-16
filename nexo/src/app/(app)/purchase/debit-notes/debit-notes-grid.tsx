"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { money, date, titleise } from "@/lib/format";

export type DebitNoteRow = {
  id: string;
  number: string;
  date: string;
  vendorId: string;
  vendorName: string;
  billId: string;
  billCode: string;
  grnId: string;
  grnCode: string;
  total: number;
  status: string;
};

const PAGE_SIZE = 50;
const STATUSES = ["ISSUED", "CANCELLED"];

export function DebitNotesGrid({ rows }: { rows: DebitNoteRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) {
      out = out.filter((r) => r.status === status);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.number.toLowerCase().includes(q) ||
          r.vendorName.toLowerCase().includes(q) ||
          r.billCode.toLowerCase().includes(q) ||
          r.grnCode.toLowerCase().includes(q),
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof DebitNoteRow];
      const y = b[sort.key as keyof DebitNoteRow];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, search, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const totalDebited = filtered.reduce((sum, r) => sum + r.total, 0);

  const crumbs: Crumb[] = [{ label: "All debit notes" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<DebitNoteRow>[] = [
    {
      key: "number",
      header: "Number",
      width: 140,
      sortable: true,
      text: (r) => r.number,
      render: (r) => <RefLink href={`/purchase/debit-notes/${r.id}`}>{r.number}</RefLink>,
    },
    {
      key: "date",
      header: "Date",
      width: 110,
      sortable: true,
      text: (r) => r.date,
      render: (r) => <span className="text-muted">{date(r.date)}</span>,
    },
    {
      key: "vendorName",
      header: "Vendor",
      width: 220,
      sortable: true,
      text: (r) => r.vendorName,
      render: (r) => <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink>,
    },
    {
      key: "billCode",
      header: "Vendor Bill",
      width: 130,
      sortable: true,
      text: (r) => r.billCode,
      render: (r) => <RefLink href={`/finance/payable/${r.billId}`}>{r.billCode}</RefLink>,
    },
    {
      key: "grnCode",
      header: "GRN",
      width: 130,
      sortable: true,
      text: (r) => r.grnCode,
      render: (r) => <RefLink href={`/procurement/grn/${r.grnId}`}>{r.grnCode}</RefLink>,
    },
    {
      key: "total",
      header: "Total",
      width: 130,
      align: "right",
      sortable: true,
      text: (r) => String(r.total),
      render: (r) => money(r.total),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      sortable: true,
      text: (r) => r.status,
      render: (r) => <Chip tone={r.status === "ISSUED" ? "success" : "danger"}>{titleise(r.status)}</Chip>,
    },
  ];

  return (
    <ListShell
      title="Debit notes"
      count={filtered.length}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search number, vendor, bill, GRN"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          <FilterSelect
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setPage(0); }}
            options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
          />
          <span className="ml-1 shrink-0 whitespace-nowrap text-[11.5px] text-muted">
            Total debited <span className="font-num font-semibold tabular-nums text-ink">{money(totalDebited)}</span>
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
        emptyTitle="No debit notes match"
        emptyBody="A debit note is issued against a vendor bill for rejected goods on inward receipts."
      />
    </ListShell>
  );
}
