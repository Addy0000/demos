"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, packingListTone } from "@/components/ui/chip";
import { date, titleise } from "@/lib/format";

export type PackingListRow = {
  id: string;
  code: string;
  status: string;
  challanId: string;
  challanCode: string;
  customerId: string;
  customerName: string;
  packageCount: number;
  date: string | null;
  finalizedAt: string | null;
  remark: string | null;
};

const PAGE_SIZE = 50;
const STATUSES = ["DRAFT", "FINAL"];

export function PackingListsGrid({ rows }: { rows: PackingListRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows;
    if (status) out = out.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      out = out.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.challanCode.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q),
      );
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const x = a[sort.key as keyof PackingListRow];
      const y = b[sort.key as keyof PackingListRow];
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, status, search, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);
  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const crumbs: Crumb[] = [{ label: "All packing lists" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<PackingListRow>[] = [
    {
      key: "code",
      header: "Packing list",
      width: 140,
      sortable: true,
      text: (r) => r.code,
      render: (r) => <RefLink href={`/sales/packing-lists/${r.id}`}>{r.code}</RefLink>,
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      sortable: true,
      text: (r) => r.status,
      render: (r) => <Chip tone={packingListTone(r.status)}>{titleise(r.status)}</Chip>,
    },
    {
      key: "challanCode",
      header: "Challan",
      width: 140,
      sortable: true,
      text: (r) => r.challanCode,
      render: (r) => <RefLink href={`/sales/dispatch/${r.challanId}`}>{r.challanCode}</RefLink>,
    },
    {
      key: "customerName",
      header: "Customer",
      width: 220,
      sortable: true,
      text: (r) => r.customerName,
      render: (r) => <RefLink href={`/customers/${r.customerId}`}>{r.customerName}</RefLink>,
    },
    {
      key: "packageCount",
      header: "Packages",
      width: 100,
      align: "right",
      sortable: true,
      text: (r) => String(r.packageCount),
      render: (r) => <span className="font-num">{r.packageCount}</span>,
    },
    {
      key: "date",
      header: "Date",
      width: 120,
      sortable: true,
      text: (r) => r.date ?? "",
      render: (r) => <span className="text-muted">{r.date ? date(r.date) : "—"}</span>,
    },
  ];

  return (
    <ListShell
      title="Packing lists"
      count={filtered.length}
      crumbs={crumbs}
      search={search}
      onSearchChange={(v) => { setSearch(v); setPage(0); }}
      searchPlaceholder="Search packing list, challan, customer"
      onClearFilters={() => { setStatus(""); setSearch(""); setPage(0); }}
      page={page}
      pageSize={PAGE_SIZE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(0); }}
          options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
        />
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={toggleSort}
        hrefFor={(r) => `/sales/packing-lists/${r.id}`}
        emptyTitle="No packing lists match"
        emptyBody="Packing lists break down dispatched delivery challans into packages."
      />
    </ListShell>
  );
}
