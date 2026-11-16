"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Chip, Tone } from "@/components/ui/chip";
import { Input, Select } from "@/components/ui/form";
import { formatUomDisplay } from "@/lib/uom";

type BomItem = {
  id: string;
  code: string;
  type: "STANDARD" | "ORDER";
  status: string;
  targetProductName: string;
  targetProductCode: string;
  source?: string;
  componentUsageKg?: number;
  componentUom?: string;
  componentLinesCount: number;
  requestedByName?: string;
  approvedByName?: string | null;
  createdAt: string;
};

type FilteredItemInfo = {
  code: string;
  name: string;
  category: string;
  itemType: string;
  uom: string;
} | null;

export function BomsClient({
  boms,
  filterByItem,
  filteredItemInfo,
}: {
  boms: BomItem[];
  filterByItem?: string;
  filteredItemInfo?: FilteredItemInfo;
}) {
  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState<"ALL" | "STANDARD" | "ORDER">("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredBoms = useMemo(() => {
    return boms.filter((b) => {
      const matchesSearch =
        search === "" ||
        b.code.toLowerCase().includes(search.toLowerCase()) ||
        b.targetProductName.toLowerCase().includes(search.toLowerCase()) ||
        b.targetProductCode.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeTab === "ALL" || b.type === typeTab;

      const matchesStatus =
        statusFilter === "ALL" || b.status === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [boms, search, typeTab, statusFilter]);

  const bomStatusTone = (status: string): Tone => {
    switch (status) {
      case "APPROVED":
        return "success";
      case "PENDING_APPROVAL":
        return "warning";
      case "REJECTED":
        return "danger";
      case "DRAFT":
      default:
        return "neutral";
    }
  };

  const standardCount = boms.filter((b) => b.type === "STANDARD").length;
  const orderCount = boms.filter((b) => b.type === "ORDER").length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top Header bar */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">
          Bills of Materials (BOM) Explorer
        </h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {boms.length} BOM{boms.length === 1 ? "" : "s"}
        </span>
        <span className="text-[11.5px] text-muted">
          Unified index of Standard manufacturing formulas and Order recipe BOMs
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/items"
            className="text-[11px] font-semibold text-muted hover:text-ink px-2 py-1 rounded border border-edge hover:bg-surface transition-colors"
          >
            &larr; Item Master
          </Link>
          <Link
            href="/items/standard"
            className="text-[11px] font-semibold text-primary hover:text-primary-hover px-2.5 py-1 rounded bg-pastel hover:bg-pastel/80 transition-colors"
          >
            Manage Standard BOMs
          </Link>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex h-[34px] shrink-0 items-center gap-6 border-b border-edge bg-surface px-4 text-xs font-semibold">
        <Link
          href="/items"
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Item Master
        </Link>
        <Link
          href="/items/standard"
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Standard BOMs
        </Link>
        <Link
          href="/items/order"
          className="text-muted hover:text-ink py-2 cursor-pointer transition-colors"
        >
          Order BOMs
        </Link>
        <span className="border-b-2 border-primary text-primary py-2 cursor-pointer">
          BOM Explorer (Unified)
        </span>
      </div>

      {/* Filter by Item Notification Banner */}
      {filterByItem && (
        <div className="flex items-center justify-between border-b border-primary/30 bg-pastel/40 px-4 py-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-primary-hover">Filtering by component item:</span>
            <span className="font-num font-bold text-ink bg-surface px-2 py-0.5 rounded border border-edge">
              {filterByItem}
            </span>
            {filteredItemInfo && (
              <>
                <span className="font-medium text-slate-800">{filteredItemInfo.name}</span>
                <Chip tone="neutral">{filteredItemInfo.category.replace(/_/g, " ")}</Chip>
              </>
            )}
            <span className="text-muted text-[11px]">
              ({boms.length} BOM{boms.length === 1 ? "" : "s"} reference this item as an ingredient)
            </span>
          </div>
          <Link
            href="/boms"
            className="font-semibold text-xs text-primary hover:underline flex items-center gap-1"
          >
            &times; Clear Filter (View All BOMs)
          </Link>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-h-0 flex-1 flex-col bg-canvas p-4 gap-3 overflow-hidden">
        {/* Toolbar & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 rounded-sm border border-edge">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="w-72">
              <Input
                type="text"
                placeholder="Search BOM code, product name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Type selector tabs */}
            <div className="flex rounded border border-edge bg-faint p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTypeTab("ALL")}
                className={`px-3 py-1 rounded-sm transition-colors cursor-pointer ${
                  typeTab === "ALL" ? "bg-surface text-primary shadow-xs font-bold" : "text-muted hover:text-ink"
                }`}
              >
                All ({boms.length})
              </button>
              <button
                type="button"
                onClick={() => setTypeTab("STANDARD")}
                className={`px-3 py-1 rounded-sm transition-colors cursor-pointer ${
                  typeTab === "STANDARD" ? "bg-surface text-primary shadow-xs font-bold" : "text-muted hover:text-ink"
                }`}
              >
                Standard BOMs ({standardCount})
              </button>
              <button
                type="button"
                onClick={() => setTypeTab("ORDER")}
                className={`px-3 py-1 rounded-sm transition-colors cursor-pointer ${
                  typeTab === "ORDER" ? "bg-surface text-primary shadow-xs font-bold" : "text-muted hover:text-ink"
                }`}
              >
                Order BOMs ({orderCount})
              </button>
            </div>

            <div className="w-40">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="DRAFT">Draft</option>
                <option value="REJECTED">Rejected</option>
              </Select>
            </div>
          </div>

          <div className="text-[11px] text-muted">
            Showing <strong>{filteredBoms.length}</strong> of {boms.length} BOMs
          </div>
        </div>

        {/* Master BOMs Grid Table */}
        <div className="flex-1 overflow-auto border border-edge rounded-sm bg-surface scroll-thin">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-faint/80 text-slate-700 font-semibold border-b border-edge sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">BOM Code</th>
                <th className="px-3 py-2">BOM Type</th>
                <th className="px-3 py-2">Target Product / Compound</th>
                {filterByItem ? (
                  <th className="px-3 py-2 text-right">Component Consumption</th>
                ) : (
                  <th className="px-3 py-2 text-right">Components</th>
                )}
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Source / Requester</th>
                <th className="px-3 py-2">Created Date</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {filteredBoms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted italic">
                    {filterByItem
                      ? `No BOMs found referencing component "${filterByItem}".`
                      : "No BOMs match the selected filter criteria."}
                  </td>
                </tr>
              ) : (
                filteredBoms.map((bom) => (
                  <tr key={bom.id} className="hover:bg-pastel/20 text-slate-700">
                    <td className="px-3 py-2 font-semibold font-num text-primary">
                      <Link
                        href={bom.type === "STANDARD" ? "/items/standard" : "/items/order"}
                        className="hover:underline"
                      >
                        {bom.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={bom.type === "STANDARD" ? "special" : "info"}>
                        {bom.type === "STANDARD" ? "STANDARD BOM" : "ORDER BOM"}
                      </Chip>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-900">{bom.targetProductName}</div>
                      <div className="text-[10px] text-muted font-num">{bom.targetProductCode}</div>
                    </td>
                    {filterByItem ? (
                      <td className="px-3 py-2 text-right font-num font-bold text-slate-900">
                        {bom.componentUsageKg != null
                          ? `${bom.componentUsageKg.toLocaleString()} ${formatUomDisplay(bom.componentUom)}`
                          : "—"}
                      </td>
                    ) : (
                      <td className="px-3 py-2 text-right font-num text-muted">
                        {bom.componentLinesCount} component{bom.componentLinesCount === 1 ? "" : "s"}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Chip tone={bomStatusTone(bom.status)}>
                        {bom.status}
                      </Chip>
                    </td>
                    <td className="px-3 py-2 text-muted text-xs">
                      {bom.type === "ORDER" && bom.source ? (
                        <span className="font-medium text-slate-700">{bom.source.replace(/_/g, " ")}</span>
                      ) : (
                        bom.requestedByName ?? "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-num text-muted">
                      {new Date(bom.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={bom.type === "STANDARD" ? "/items/standard" : "/items/order"}
                        className="font-semibold text-[11px] text-primary hover:underline"
                      >
                        {bom.type === "STANDARD" ? "Open Standard BOM" : "Open Order BOM"} &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
