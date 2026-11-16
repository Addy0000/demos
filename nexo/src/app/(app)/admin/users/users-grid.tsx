"use client";

import { useMemo, useState } from "react";
import { DataGrid, RefLink, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip } from "@/components/ui/chip";
import { date, relative, titleise, initials } from "@/lib/format";
import { IconCheck, IconClose } from "@/components/icons";

type Row = {
  id: string; name: string; email: string; role: string; roleLabel: string;
  jobTitle: string; phone: string; isActive: boolean;
  vendorId: string | null; vendorName: string | null;
  lastLoginAt: string | null; createdAt: string; permissionCount: number;
};

type MatrixRow = { role: string; label: string; permissions: string[] };

const ROLES = ["ADMIN", "SALES", "PROJECT_MANAGER", "FINANCE", "PROCUREMENT", "STORE", "VENDOR"];

const roleTone = (r: string) =>
  r === "ADMIN" ? "danger" : r === "VENDOR" ? "special" : r === "FINANCE" ? "warning" : "info";

export function UsersGrid({ rows, matrix }: { rows: Row[]; matrix: MatrixRow[] }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [showMatrix, setShowMatrix] = useState(false);

  const filtered = useMemo(() => (role ? rows.filter((r) => r.role === role) : rows), [rows, role]);

  const allPermissions = useMemo(
    () => Array.from(new Set(matrix.flatMap((m) => m.permissions))).sort(),
    [matrix],
  );

  const crumbs: Crumb[] = [{ label: "All users" }];
  if (role) crumbs.push({ label: "Role =", value: titleise(role), onRemove: () => setRole("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  const columns: Column<Row>[] = [
    {
      key: "name", header: "User", width: 220,
      text: (r) => r.name,
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full bg-pastel font-num text-[9.5px] font-semibold text-primary">
            {initials(r.name)}
          </span>
          <span className="truncate">{r.name}</span>
        </span>
      ),
    },
    { key: "email", header: "Email", width: 230, text: (r) => r.email, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.email}</span> },
    { key: "roleLabel", header: "Role", width: 150, text: (r) => r.roleLabel, render: (r) => <Chip tone={roleTone(r.role)}>{r.roleLabel}</Chip> },
    { key: "jobTitle", header: "Job title", width: 200, text: (r) => r.jobTitle, render: (r) => <span className="text-muted">{r.jobTitle}</span> },
    {
      key: "vendorName", header: "Scoped to vendor", width: 210,
      text: (r) => r.vendorName ?? "",
      render: (r) =>
        r.vendorId ? <RefLink href={`/procurement/vendors/${r.vendorId}`}>{r.vendorName}</RefLink> : <span className="text-muted">— internal —</span>,
    },
    { key: "permissionCount", header: "Permissions", width: 104, align: "right", text: (r) => String(r.permissionCount), render: (r) => <span className="tnum">{r.permissionCount}</span> },
    {
      key: "isActive", header: "Active", width: 84,
      text: (r) => String(r.isActive),
      render: (r) => (r.isActive ? <Chip tone="success">Active</Chip> : <Chip tone="neutral">Disabled</Chip>),
    },
    { key: "phone", header: "Phone", width: 150, text: (r) => r.phone, render: (r) => <span className="font-num text-[11.5px] text-muted">{r.phone}</span> },
    {
      key: "lastLoginAt", header: "Last seen", width: 130,
      text: (r) => r.lastLoginAt ?? "",
      render: (r) => <span className="text-muted">{r.lastLoginAt ? relative(r.lastLoginAt) : "never"}</span>,
    },
    { key: "createdAt", header: "Created", width: 100, text: (r) => r.createdAt, render: (r) => <span className="text-muted">{date(r.createdAt)}</span> },
  ];

  return (
    <ListShell
      title="Users & roles"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search name or email"
      crumbs={crumbs}
      onClearFilters={() => { setRole(""); setSearch(""); }}
      toolbarExtra={
        <>
          <FilterSelect
            label="Role" value={role} onChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: titleise(r) }))}
          />
          <button
            type="button"
            onClick={() => setShowMatrix((s) => !s)}
            className={`h-[26px] shrink-0 whitespace-nowrap rounded border px-2.5 text-[12px] font-medium transition-colors duration-150 ${
              showMatrix ? "border-primary bg-pastel text-primary" : "border-edge bg-surface text-ink hover:bg-faint"
            }`}
          >
            {showMatrix ? "Hide" : "Show"} permission matrix
          </button>
        </>
      }
    >
      {showMatrix && (
        <div className="max-h-[45vh] shrink-0 overflow-auto scroll-thin border-b border-edge bg-surface">
          <table className="w-full">
            <thead>
              <tr className="grid-head">
                <th className="sticky left-0 z-10 bg-faint px-2.5 py-1.5 text-left">Permission</th>
                {matrix.map((m) => (
                  <th key={m.role} className="px-2 py-1.5 text-center">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPermissions.map((perm) => (
                <tr key={perm} className="border-b border-edge/60 hover:bg-faint">
                  <td className="sticky left-0 z-10 bg-surface px-2.5 py-1 font-num text-[11.5px] text-ink">{perm}</td>
                  {matrix.map((m) => (
                    <td key={m.role} className="px-2 py-1 text-center">
                      {m.permissions.includes(perm) ? (
                        <IconCheck size={13} className="mx-auto text-success" />
                      ) : (
                        <IconClose size={11} className="mx-auto text-edge" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-edge bg-faint px-3 py-2 text-[11px] leading-relaxed text-muted">
            Permissions are granted by role, not per user. The Vendor role additionally passes through a
            data-layer scope so a vendor account can only ever read its own records — the permission
            above is necessary but not sufficient.
          </p>
        </div>
      )}

      <DataGrid
        rows={filtered}
        columns={columns}
        quickFilter={search}
        selectable={false}
        emptyTitle="No users match"
        emptyBody="Clear the role filter or search to see every account."
      />
    </ListShell>
  );
}
