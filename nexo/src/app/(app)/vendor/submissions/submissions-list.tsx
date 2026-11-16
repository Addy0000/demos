"use client";

import { useMemo, useState, useTransition } from "react";
import { withdrawSubmission } from "../../finance/actions";
import { DataGrid, type Column } from "@/components/grid/data-grid";
import { ListShell, FilterSelect, type Crumb } from "@/components/grid/list-shell";
import { Chip, priceStatusTone } from "@/components/ui/chip";
import { Button } from "@/components/ui/form";
import { ratePerKg, kg, date, titleise, percent } from "@/lib/format";
import { IconCheck, IconAlert, IconClose } from "@/components/icons";

type Row = {
  id: string; materialCode: string; materialName: string; category: string;
  pricePerKg: number; changePct: number | null; status: string;
  effectiveFrom: string; effectiveTo: string | null; submittedAt: string;
  decidedAt: string | null; decidedBy: string | null;
  rejectionReason: string | null; remark: string; moqKg: number | null;
};

const STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUPERSEDED"];

export function SubmissionsList({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [withdrawn, setWithdrawn] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let out = rows.filter((r) => !withdrawn.has(r.id));
    if (status) out = out.filter((r) => r.status === status);
    return out;
  }, [rows, status, withdrawn]);

  const crumbs: Crumb[] = [{ label: "My submissions" }];
  if (status) crumbs.push({ label: "Status =", value: titleise(status), onRemove: () => setStatus("") });
  if (search) crumbs.push({ label: "Matching", value: `“${search}”`, onRemove: () => setSearch("") });

  function withdraw(id: string) {
    startTransition(async () => {
      setWithdrawn((s) => new Set(s).add(id));
      const res = await withdrawSubmission(id);
      setNotice(res.error ? { tone: "err", text: res.error } : { tone: "ok", text: res.success! });
    });
  }

  const columns: Column<Row>[] = [
    { key: "materialCode", header: "Code", width: 84, text: (r) => r.materialCode, render: (r) => <span className="font-num text-muted">{r.materialCode}</span> },
    { key: "materialName", header: "Material", width: 260, text: (r) => r.materialName, render: (r) => r.materialName },
    { key: "status", header: "Status", width: 150, text: (r) => r.status, render: (r) => <Chip tone={priceStatusTone(r.status)}>{titleise(r.status)}</Chip> },
    { key: "pricePerKg", header: "Rate ₹/kg", width: 106, align: "right", text: (r) => String(r.pricePerKg), render: (r) => <span className="font-medium">{ratePerKg(r.pricePerKg)}</span> },
    {
      key: "changePct", header: "Change", width: 92, align: "right",
      text: (r) => String(r.changePct ?? ""),
      render: (r) =>
        r.changePct === null ? <span className="text-muted">first rate</span> : (
          <Chip tone={r.changePct > 8 ? "danger" : r.changePct > 0 ? "warning" : "success"}>{percent(r.changePct, 1)}</Chip>
        ),
    },
    { key: "moqKg", header: "MOQ", width: 96, align: "right", text: (r) => String(r.moqKg ?? ""), render: (r) => (r.moqKg ? kg(r.moqKg) : <span className="text-muted">—</span>) },
    { key: "effectiveFrom", header: "Effective from", width: 112, text: (r) => r.effectiveFrom, render: (r) => <span className="text-muted">{date(r.effectiveFrom)}</span> },
    { key: "effectiveTo", header: "Until", width: 100, text: (r) => r.effectiveTo ?? "", render: (r) => <span className="text-muted">{r.effectiveTo ? date(r.effectiveTo) : "—"}</span> },
    { key: "submittedAt", header: "Submitted", width: 104, text: (r) => r.submittedAt, render: (r) => <span className="text-muted">{date(r.submittedAt)}</span> },
    { key: "decidedAt", header: "Decided", width: 104, text: (r) => r.decidedAt ?? "", render: (r) => <span className="text-muted">{r.decidedAt ? date(r.decidedAt) : "—"}</span> },
    {
      key: "outcome", header: "Outcome", width: 400,
      text: (r) => r.rejectionReason ?? r.remark,
      render: (r) =>
        r.rejectionReason ? <span className="text-danger">{r.rejectionReason}</span>
          : r.status === "APPROVED" ? <span className="text-success">Approved{r.decidedBy ? ` by ${r.decidedBy}` : ""}</span>
          : r.remark ? <span className="text-muted">{r.remark}</span>
          : <span className="text-muted">—</span>,
    },
    {
      key: "action", header: "", width: 110,
      text: () => "",
      render: (r) =>
        r.status === "PENDING_APPROVAL" ? (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={(e) => { e.stopPropagation(); withdraw(r.id); }}
            className="h-[22px] text-[11.5px]"
          >
            Withdraw
          </Button>
        ) : null,
    },
  ];

  return (
    <ListShell
      title="My submissions"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search material"
      crumbs={crumbs}
      onClearFilters={() => { setStatus(""); setSearch(""); }}
      toolbarExtra={
        <FilterSelect
          label="Status" value={status} onChange={setStatus}
          options={STATUSES.map((s) => ({ value: s, label: titleise(s) }))}
        />
      }
    >
      {notice && (
        <div
          role="status"
          className={`flex shrink-0 items-center gap-2 border-b px-3 py-2 text-[12px] ${
            notice.tone === "ok" ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg"
          }`}
        >
          {notice.tone === "ok" ? <IconCheck size={14} className="text-success" /> : <IconAlert size={14} className="text-danger" />}
          <span className="flex-1 text-ink">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            <IconClose size={12} />
          </button>
        </div>
      )}

      <DataGrid
        rows={filtered}
        columns={columns}
        quickFilter={search}
        selectable={false}
        emptyTitle="No submissions yet"
        emptyBody="Propose a rate from your price list and it will appear here while Finance reviews it."
      />
    </ListShell>
  );
}
