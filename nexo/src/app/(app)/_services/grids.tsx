"use client";

import { useMemo, useState, useTransition } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, type Tone } from "@/components/ui/chip";
import { money, date, titleise, initials } from "@/lib/format";
import { decideLeave } from "./actions";

/* ── A list scaffold shared by every services screen ─────────────────────── */

type Filter<T> = { key: keyof T & string; label: string; options: string[]; format?: (v: string) => string };

function ListGrid<T extends { id: string }>({
  title,
  rows,
  columns,
  filters = [],
  defaultSort,
  searchPlaceholder,
  hrefFor,
  summary,
  emptyTitle,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  filters?: Filter<T>[];
  defaultSort: { key: keyof T & string; dir: "asc" | "desc" };
  searchPlaceholder: string;
  hrefFor?: (r: T) => string;
  summary?: (rows: T[]) => React.ReactNode;
  emptyTitle?: string;
}) {
  const PAGE = 60;
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>(defaultSort);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => filters.every((f) => !values[f.key] || String(r[f.key]) === values[f.key]));
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const x = (a as Record<string, unknown>)[sort.key];
      const y = (b as Record<string, unknown>)[sort.key];
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
    return out;
  }, [rows, filters, values, sort]);

  const paged = useMemo(() => filtered.slice(page * PAGE, (page + 1) * PAGE), [filtered, page]);
  const crumbs: Crumb[] = [{ label: `All ${title.toLowerCase()}` }];
  for (const f of filters) {
    if (values[f.key]) {
      crumbs.push({
        label: `${f.label} =`,
        value: (f.format ?? titleise)(values[f.key]!),
        onRemove: () => setValues((v) => ({ ...v, [f.key]: "" })),
      });
    }
  }
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  return (
    <ListShell
      title={title}
      count={filtered.length}
      search={search}
      onSearchChange={(v) => {
        setSearch(v);
        setPage(0);
      }}
      searchPlaceholder={searchPlaceholder}
      crumbs={crumbs}
      onClearFilters={() => {
        setValues({});
        setSearch("");
        setPage(0);
      }}
      page={page}
      pageSize={PAGE}
      total={filtered.length}
      onPageChange={setPage}
      toolbarExtra={
        <>
          {filters.map((f) => (
            <FilterSelect
              key={f.key}
              label={f.label}
              value={values[f.key] ?? ""}
              onChange={(v) => {
                setValues((s) => ({ ...s, [f.key]: v }));
                setPage(0);
              }}
              options={f.options.map((o) => ({ value: o, label: (f.format ?? titleise)(o) }))}
            />
          ))}
          {summary && <span className="ml-1 hidden shrink-0 whitespace-nowrap text-[11.5px] text-muted xl:inline">{summary(filtered)}</span>}
        </>
      }
    >
      <DataGrid
        rows={paged}
        columns={columns}
        quickFilter={search}
        sort={sort}
        onSortChange={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}
        hrefFor={hrefFor}
        selectable={false}
        emptyTitle={emptyTitle ?? `No ${title.toLowerCase()} yet`}
      />
    </ListShell>
  );
}

const Num = ({ children }: { children: React.ReactNode }) => <span className="font-num tabular-nums">{children}</span>;

function Person({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-pastel font-num text-[9px] font-semibold text-link">
        {initials(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

/** A bar of burn against the planned envelope, with the time-elapsed tick. */
export function Burn({ used, of, elapsed }: { used: number; of: number; elapsed?: number }) {
  const pct = of > 0 ? used / of : 0;
  const over = elapsed !== undefined && pct > elapsed + 0.1;
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-[6px] w-[72px] overflow-hidden rounded-full bg-faint">
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${pct > 1 ? "bg-danger" : over ? "bg-warning" : "bg-primary"}`}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
        {elapsed !== undefined && (
          <span className="absolute inset-y-[-2px] w-px bg-ink/60" style={{ left: `${Math.min(100, elapsed * 100)}%` }} />
        )}
      </span>
      <Num>{Math.round(pct * 100)}%</Num>
    </span>
  );
}

/* ── Engagements ─────────────────────────────────────────────────────────── */

export type EngagementRow = {
  id: string;
  code: string;
  name: string;
  clientId: string;
  client: string;
  serviceLine: string;
  status: string;
  startOn: string;
  endOn: string;
  elapsed: number;
  hours: number;
  budgetHours: number;
  contractValue: number;
  billed: number;
  manager: string | null;
  progress: number;
};

const ENG_TONE: Record<string, Tone> = { ACTIVE: "success", PROPOSED: "info", ON_HOLD: "warning", COMPLETED: "neutral" };

export function EngagementsGrid({ rows, lines }: { rows: EngagementRow[]; lines: string[] }) {
  const columns: Column<EngagementRow>[] = [
    { key: "code", header: "Engagement", width: 118, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/engagements/${r.id}`}>{r.code}</RefLink> },
    { key: "name", header: "Scope", width: 280, sortable: true, text: (r) => r.name, render: (r) => r.name },
    { key: "client", header: "Client", width: 200, sortable: true, text: (r) => r.client, render: (r) => <RefLink href={`/customers/${r.clientId}`}>{r.client}</RefLink> },
    { key: "serviceLine", header: "Service line", width: 170, sortable: true, text: (r) => r.serviceLine, render: (r) => r.serviceLine },
    { key: "status", header: "Status", width: 110, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={ENG_TONE[r.status] ?? "neutral"}>{titleise(r.status)}</Chip> },
    { key: "progress", header: "Progress", width: 120, sortable: true, render: (r) => <Burn used={r.progress} of={100} elapsed={r.elapsed} /> },
    { key: "hours", header: "Hours vs budget", width: 160, sortable: true, render: (r) => <span className="flex items-center gap-2"><Burn used={r.hours} of={r.budgetHours} /><span className="text-muted"><Num>{r.hours}/{r.budgetHours}</Num></span></span> },
    { key: "contractValue", header: "Contract", width: 120, align: "right", sortable: true, render: (r) => money(r.contractValue) },
    { key: "billed", header: "Billed", width: 120, align: "right", sortable: true, render: (r) => money(r.billed) },
    { key: "endOn", header: "Ends", width: 104, sortable: true, render: (r) => <span className="text-muted">{date(r.endOn)}</span> },
    { key: "manager", header: "Manager", width: 160, sortable: true, text: (r) => r.manager ?? "", render: (r) => <Person name={r.manager} /> },
  ];
  return (
    <ListGrid
      title="Engagements"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "status", dir: "asc" }}
      searchPlaceholder="Search engagement, client, scope"
      hrefFor={(r) => `/engagements/${r.id}`}
      filters={[
        { key: "status", label: "Status", options: ["ACTIVE", "PROPOSED", "ON_HOLD", "COMPLETED"] },
        { key: "serviceLine", label: "Service line", options: lines, format: (v) => v },
      ]}
      summary={(rs) => (
        <>
          Contracted <span className="font-num font-semibold text-ink">{money(rs.reduce((s, r) => s + r.contractValue, 0))}</span>
        </>
      )}
    />
  );
}

/* ── Timesheets ──────────────────────────────────────────────────────────── */

export type TimesheetRow = {
  id: string;
  date: string;
  employee: string;
  employeeId: string;
  engagementId: string;
  engagement: string;
  task: string | null;
  hours: number;
  billable: "Billable" | "Non-billable";
  approved: "Approved" | "Pending";
};

export function TimesheetsGrid({ rows, people }: { rows: TimesheetRow[]; people: string[] }) {
  const columns: Column<TimesheetRow>[] = [
    { key: "date", header: "Date", width: 104, sortable: true, text: (r) => r.date, render: (r) => <span className="text-muted">{date(r.date)}</span> },
    { key: "employee", header: "Consultant", width: 190, sortable: true, text: (r) => r.employee, render: (r) => <Person name={r.employee} /> },
    { key: "engagement", header: "Engagement", width: 118, sortable: true, text: (r) => r.engagement, render: (r) => <RefLink href={`/engagements/${r.engagementId}`}>{r.engagement}</RefLink> },
    { key: "task", header: "Task", width: 300, text: (r) => r.task ?? "", render: (r) => r.task ?? <span className="text-muted">General</span> },
    { key: "hours", header: "Hours", width: 80, align: "right", sortable: true, render: (r) => <Num>{r.hours.toFixed(1)}</Num> },
    { key: "billable", header: "Billing", width: 120, sortable: true, render: (r) => <Chip tone={r.billable === "Billable" ? "success" : "neutral"}>{r.billable}</Chip> },
    { key: "approved", header: "Approval", width: 110, sortable: true, render: (r) => <Chip tone={r.approved === "Approved" ? "info" : "warning"}>{r.approved}</Chip> },
  ];
  return (
    <ListGrid
      title="Timesheets"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "date", dir: "desc" }}
      searchPlaceholder="Search consultant, engagement, task"
      filters={[
        { key: "employee", label: "Consultant", options: people, format: (v) => v },
        { key: "billable", label: "Billing", options: ["Billable", "Non-billable"], format: (v) => v },
        { key: "approved", label: "Approval", options: ["Approved", "Pending"], format: (v) => v },
      ]}
      summary={(rs) => {
        const total = rs.reduce((s, r) => s + r.hours, 0);
        const bill = rs.filter((r) => r.billable === "Billable").reduce((s, r) => s + r.hours, 0);
        return (
          <>
            <span className="font-num font-semibold text-ink">{total.toLocaleString("en-IN")}</span> h, of which{" "}
            <span className="font-num font-semibold text-ink">{total ? Math.round((bill / total) * 100) : 0}%</span> billable
          </>
        );
      }}
    />
  );
}

/* ── Employees ───────────────────────────────────────────────────────────── */

export type EmployeeRow = {
  id: string;
  code: string;
  name: string;
  designation: string;
  department: string;
  grade: string | null;
  location: string | null;
  manager: string | null;
  joinedOn: string;
  status: string;
  monthlyCtc: number;
  billRate: number | null;
  utilisation: number;
};

const EMP_TONE: Record<string, Tone> = { ACTIVE: "success", PROBATION: "info", NOTICE: "warning", EXITED: "neutral" };

export function EmployeesGrid({ rows, departments }: { rows: EmployeeRow[]; departments: string[] }) {
  const columns: Column<EmployeeRow>[] = [
    { key: "code", header: "Emp. no", width: 92, sortable: true, text: (r) => r.code, render: (r) => <Num>{r.code}</Num> },
    { key: "name", header: "Name", width: 200, sortable: true, text: (r) => r.name, render: (r) => <Person name={r.name} /> },
    { key: "designation", header: "Designation", width: 200, sortable: true, text: (r) => r.designation, render: (r) => r.designation },
    { key: "department", header: "Department", width: 170, sortable: true, text: (r) => r.department, render: (r) => r.department },
    { key: "grade", header: "Grade", width: 70, sortable: true, render: (r) => <Num>{r.grade ?? "—"}</Num> },
    { key: "location", header: "Based at", width: 150, sortable: true, text: (r) => r.location ?? "", render: (r) => r.location ?? "—" },
    { key: "manager", header: "Reports to", width: 170, sortable: true, text: (r) => r.manager ?? "", render: (r) => <Person name={r.manager} /> },
    { key: "utilisation", header: "Utilisation, 30 d", width: 140, sortable: true, render: (r) => (r.billRate ? <Burn used={r.utilisation} of={1} /> : <span className="text-muted">Overhead</span>) },
    { key: "monthlyCtc", header: "CTC / month", width: 120, align: "right", sortable: true, render: (r) => money(r.monthlyCtc) },
    { key: "joinedOn", header: "Joined", width: 104, sortable: true, render: (r) => <span className="text-muted">{date(r.joinedOn)}</span> },
    { key: "status", header: "Status", width: 110, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={EMP_TONE[r.status] ?? "neutral"}>{titleise(r.status)}</Chip> },
  ];
  return (
    <ListGrid
      title="Employees"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "code", dir: "asc" }}
      searchPlaceholder="Search name, designation, department"
      filters={[
        { key: "department", label: "Department", options: departments, format: (v) => v },
        { key: "status", label: "Status", options: ["ACTIVE", "PROBATION", "NOTICE"] },
      ]}
      summary={(rs) => (
        <>
          Monthly cost <span className="font-num font-semibold text-ink">{money(rs.reduce((s, r) => s + r.monthlyCtc, 0))}</span>
        </>
      )}
    />
  );
}

/* ── Leave ───────────────────────────────────────────────────────────────── */

export type LeaveRow = {
  id: string;
  code: string;
  employee: string;
  department: string;
  type: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: string;
  decidedBy: string | null;
};

const LEAVE_TONE: Record<string, Tone> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };

export function LeaveGrid({ rows, canDecide }: { rows: LeaveRow[]; canDecide: boolean }) {
  const columns: Column<LeaveRow>[] = [
    { key: "code", header: "Request", width: 118, sortable: true, text: (r) => r.code, render: (r) => <Num>{r.code}</Num> },
    { key: "employee", header: "Employee", width: 190, sortable: true, text: (r) => r.employee, render: (r) => <Person name={r.employee} /> },
    { key: "department", header: "Department", width: 160, sortable: true, text: (r) => r.department, render: (r) => r.department },
    { key: "type", header: "Type", width: 100, sortable: true, text: (r) => r.type, render: (r) => titleise(r.type) },
    { key: "fromDate", header: "From", width: 100, sortable: true, render: (r) => date(r.fromDate) },
    { key: "toDate", header: "To", width: 100, sortable: true, render: (r) => date(r.toDate) },
    { key: "days", header: "Days", width: 64, align: "right", sortable: true, render: (r) => <Num>{r.days}</Num> },
    { key: "reason", header: "Reason", width: 230, text: (r) => r.reason ?? "", render: (r) => <span className="text-muted">{r.reason ?? "—"}</span> },
    { key: "status", header: "Status", width: 110, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={LEAVE_TONE[r.status] ?? "neutral"}>{titleise(r.status)}</Chip> },
    {
      key: "decide",
      header: canDecide ? "Decision" : "Decided by",
      width: 170,
      render: (r) => (r.status === "PENDING" && canDecide ? <Decide id={r.id} /> : <span className="text-muted">{r.decidedBy ?? "—"}</span>),
    },
  ];
  return (
    <ListGrid
      title="Leave requests"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "fromDate", dir: "desc" }}
      searchPlaceholder="Search employee, reason"
      filters={[
        { key: "status", label: "Status", options: ["PENDING", "APPROVED", "REJECTED"] },
        { key: "type", label: "Type", options: ["CASUAL", "SICK", "EARNED", "COMP_OFF", "UNPAID"] },
      ]}
      summary={(rs) => (
        <>
          <span className="font-num font-semibold text-ink">{rs.filter((r) => r.status === "PENDING").length}</span> waiting for a decision
        </>
      )}
    />
  );
}

function Decide({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  if (done) return <Chip tone={done === "APPROVED" ? "success" : "danger"}>{titleise(done)}</Chip>;
  const go = (d: "APPROVED" | "REJECTED") =>
    start(async () => {
      const r = await decideLeave(id, d);
      if (r.ok) setDone(d);
    });
  return (
    <span className="flex gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          go("APPROVED");
        }}
        className="h-[22px] rounded-[2px] bg-primary px-2 text-[11.5px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          go("REJECTED");
        }}
        className="h-[22px] rounded-[2px] border border-edge bg-surface px-2 text-[11.5px] text-ink transition-colors duration-150 hover:bg-faint disabled:opacity-50"
      >
        Reject
      </button>
    </span>
  );
}

/* ── Payroll runs ────────────────────────────────────────────────────────── */

export type PayrollRow = { id: string; code: string; month: string; status: string; headcount: number; gross: number; deductions: number; net: number; paidAt: string | null };

export function PayrollGrid({ rows }: { rows: PayrollRow[] }) {
  const columns: Column<PayrollRow>[] = [
    { key: "code", header: "Run", width: 130, sortable: true, text: (r) => r.code, render: (r) => <RefLink href={`/people/payroll/${r.id}`}>{r.code}</RefLink> },
    { key: "month", header: "Month", width: 130, sortable: true, render: (r) => new Date(r.month).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) },
    { key: "headcount", header: "Employees", width: 100, align: "right", sortable: true, render: (r) => <Num>{r.headcount}</Num> },
    { key: "gross", header: "Gross", width: 140, align: "right", sortable: true, render: (r) => money(r.gross) },
    { key: "deductions", header: "Deductions", width: 140, align: "right", sortable: true, render: (r) => money(r.deductions) },
    { key: "net", header: "Net pay", width: 140, align: "right", sortable: true, render: (r) => <span className="font-medium">{money(r.net)}</span> },
    { key: "status", header: "Status", width: 110, sortable: true, render: (r) => <Chip tone={r.status === "PAID" ? "success" : r.status === "PROCESSED" ? "info" : "warning"}>{titleise(r.status)}</Chip> },
    { key: "paidAt", header: "Paid on", width: 110, sortable: true, render: (r) => <span className="text-muted">{date(r.paidAt)}</span> },
  ];
  return (
    <ListGrid
      title="Payroll runs"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "month", dir: "desc" }}
      searchPlaceholder="Search run"
      hrefFor={(r) => `/people/payroll/${r.id}`}
      summary={(rs) => (
        <>
          Net paid <span className="font-num font-semibold text-ink">{money(rs.reduce((s, r) => s + (r.status === "PAID" ? r.net : 0), 0))}</span>
        </>
      )}
    />
  );
}

/* ── Service billing ─────────────────────────────────────────────────────── */

export type BillingRow = {
  id: string;
  code: string;
  invoiceDate: string;
  dueOn: string;
  clientId: string;
  client: string;
  engagementId: string | null;
  engagement: string | null;
  description: string;
  total: number;
  paid: number;
  status: string;
  daysOverdue: number;
};

const BILL_TONE: Record<string, Tone> = { PAID: "success", RAISED: "info", PART_PAID: "warning", OVERDUE: "danger", DRAFT: "neutral" };

export function BillingGrid({ rows }: { rows: BillingRow[] }) {
  const columns: Column<BillingRow>[] = [
    { key: "code", header: "Invoice", width: 124, sortable: true, text: (r) => r.code, render: (r) => <Num>{r.code}</Num> },
    { key: "invoiceDate", header: "Date", width: 100, sortable: true, render: (r) => <span className="text-muted">{date(r.invoiceDate)}</span> },
    { key: "client", header: "Client", width: 200, sortable: true, text: (r) => r.client, render: (r) => <RefLink href={`/customers/${r.clientId}`}>{r.client}</RefLink> },
    { key: "engagement", header: "Engagement", width: 118, sortable: true, text: (r) => r.engagement ?? "", render: (r) => (r.engagementId ? <RefLink href={`/engagements/${r.engagementId}`}>{r.engagement}</RefLink> : "—") },
    { key: "description", header: "For", width: 280, text: (r) => r.description, render: (r) => r.description },
    { key: "total", header: "Total", width: 120, align: "right", sortable: true, render: (r) => money(r.total) },
    { key: "paid", header: "Received", width: 120, align: "right", sortable: true, render: (r) => money(r.paid) },
    { key: "dueOn", header: "Due", width: 100, sortable: true, render: (r) => <span className={r.daysOverdue > 0 && r.status !== "PAID" ? "text-danger-text" : "text-muted"}>{date(r.dueOn)}</span> },
    { key: "status", header: "Status", width: 120, sortable: true, text: (r) => r.status, render: (r) => <Chip tone={BILL_TONE[r.status] ?? "neutral"}>{r.status === "OVERDUE" ? `Overdue ${r.daysOverdue} d` : titleise(r.status)}</Chip> },
  ];
  return (
    <ListGrid
      title="Service invoices"
      rows={rows}
      columns={columns}
      defaultSort={{ key: "invoiceDate", dir: "desc" }}
      searchPlaceholder="Search invoice, client, engagement"
      filters={[{ key: "status", label: "Status", options: ["RAISED", "PART_PAID", "OVERDUE", "PAID"] }]}
      summary={(rs) => (
        <>
          Outstanding <span className="font-num font-semibold text-ink">{money(rs.reduce((s, r) => s + r.total - r.paid, 0))}</span>
        </>
      )}
    />
  );
}
