"use client";

import { CATEGORY_OPTIONS } from "@/lib/enums";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { Chip, Tone } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import { MaterialCategory, Uom, ItemType } from "@prisma/client";
import { createItem, updateItem, toggleItemActive } from "./actions";

type ItemRow = {
  id: string;
  code: string;
  name: string;
  itemType: ItemType;
  category: MaterialCategory;
  grade: string;
  casNumber: string;
  hsnCode: string;
  uom: Uom;
  specNote: string;
  isHazardous: boolean;
  isActive: boolean;
  reorderLevelKg: number;
  reorderQtyKg: number;
  leadTimeDays: number;
  currentPricePerKg: number | null;
  onHandKg: number;
  usedInBoms: number;
  suppliersCount: number;
  createdAt: string;
};

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "RAW_MATERIAL", label: "Raw Material / Component" },
  { value: "FINISHED_GOOD", label: "Finished / Manufactured Product" },
  { value: "SEMI_FINISHED", label: "Semi-Finished Compound" },
];

const CATEGORIES: { value: MaterialCategory; label: string }[] = CATEGORY_OPTIONS;

const UOMS: { value: Uom; label: string }[] = [
  { value: "KG", label: "Kilograms (KG)" },
  { value: "MT", label: "Metric Tonnes (MT)" },
  { value: "LTR", label: "Litres (LTR)" },
  { value: "NOS", label: "Numbers / Units (NOS)" },
];

export function ItemsClient({ items }: { items: ItemRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createItemType, setCreateItemType] = useState<ItemType>("RAW_MATERIAL");
  const [createCategory, setCreateCategory] = useState<MaterialCategory>("FILLER");
  const [createUom, setCreateUom] = useState<Uom>("KG");
  const [createGrade, setCreateGrade] = useState("");
  const [createHsnCode, setCreateHsnCode] = useState("");
  const [createCasNumber, setCreateCasNumber] = useState("");
  const [createReorderLevel, setCreateReorderLevel] = useState("0");
  const [createReorderQty, setCreateReorderQty] = useState("0");
  const [createLeadTime, setCreateLeadTime] = useState("7");
  const [createHazardous, setCreateHazardous] = useState(false);
  const [createSpecNote, setCreateSpecNote] = useState("");

  // Edit Modal state
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editItemType, setEditItemType] = useState<ItemType>("RAW_MATERIAL");
  const [editCategory, setEditCategory] = useState<MaterialCategory>("FILLER");
  const [editUom, setEditUom] = useState<Uom>("KG");
  const [editGrade, setEditGrade] = useState("");
  const [editHsnCode, setEditHsnCode] = useState("");
  const [editCasNumber, setEditCasNumber] = useState("");
  const [editReorderLevel, setEditReorderLevel] = useState("0");
  const [editReorderQty, setEditReorderQty] = useState("0");
  const [editLeadTime, setEditLeadTime] = useState("7");
  const [editHazardous, setEditHazardous] = useState(false);
  const [editSpecNote, setEditSpecNote] = useState("");

  // Filtered rows
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        search === "" ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.grade.toLowerCase().includes(search.toLowerCase()) ||
        item.casNumber.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        typeFilter === "ALL" || item.itemType === typeFilter;

      const matchesCategory =
        categoryFilter === "ALL" || item.category === categoryFilter;

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && item.isActive) ||
        (statusFilter === "INACTIVE" && !item.isActive);

      return matchesSearch && matchesType && matchesCategory && matchesStatus;
    });
  }, [items, search, typeFilter, categoryFilter, statusFilter]);

  const handleOpenCreate = () => {
    setError(null);
    setSuccessMessage(null);
    setCreateCode("");
    setCreateName("");
    setCreateItemType("RAW_MATERIAL");
    setCreateCategory("FILLER");
    setCreateUom("KG");
    setCreateGrade("");
    setCreateHsnCode("");
    setCreateCasNumber("");
    setCreateReorderLevel("0");
    setCreateReorderQty("0");
    setCreateLeadTime("7");
    setCreateHazardous(false);
    setCreateSpecNote("");
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = () => {
    setError(null);
    if (!createName.trim()) {
      setError("Item Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createItem({
          code: createCode.trim() || undefined,
          name: createName.trim(),
          itemType: createItemType,
          category: createCategory,
          uom: createUom,
          grade: createGrade.trim() || undefined,
          hsnCode: createHsnCode.trim() || undefined,
          casNumber: createCasNumber.trim() || undefined,
          reorderLevelKg: parseFloat(createReorderLevel) || 0,
          reorderQtyKg: parseFloat(createReorderQty) || 0,
          leadTimeDays: parseInt(createLeadTime, 10) || 7,
          isHazardous: createHazardous,
          specNote: createSpecNote.trim() || undefined,
        });

        setSuccessMessage(`Item ${result.code} (${createName.trim()}) successfully created!`);
        setIsCreateOpen(false);
      } catch (err: any) {
        setError(err.message ?? "Failed to create item.");
      }
    });
  };

  const handleOpenEdit = (item: ItemRow) => {
    setError(null);
    setSuccessMessage(null);
    setEditingItem(item);
    setEditName(item.name);
    setEditItemType(item.itemType);
    setEditCategory(item.category);
    setEditUom(item.uom);
    setEditGrade(item.grade);
    setEditHsnCode(item.hsnCode);
    setEditCasNumber(item.casNumber);
    setEditReorderLevel(item.reorderLevelKg.toString());
    setEditReorderQty(item.reorderQtyKg.toString());
    setEditLeadTime(item.leadTimeDays.toString());
    setEditHazardous(item.isHazardous);
    setEditSpecNote(item.specNote);
  };

  const handleEditSubmit = () => {
    if (!editingItem) return;
    setError(null);
    if (!editName.trim()) {
      setError("Item Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        await updateItem(editingItem.id, {
          name: editName.trim(),
          itemType: editItemType,
          category: editCategory,
          uom: editUom,
          grade: editGrade.trim() || undefined,
          hsnCode: editHsnCode.trim() || undefined,
          casNumber: editCasNumber.trim() || undefined,
          reorderLevelKg: parseFloat(editReorderLevel) || 0,
          reorderQtyKg: parseFloat(editReorderQty) || 0,
          leadTimeDays: parseInt(editLeadTime, 10) || 7,
          isHazardous: editHazardous,
          specNote: editSpecNote.trim() || undefined,
        });

        setSuccessMessage(`Item ${editingItem.code} successfully updated!`);
        setEditingItem(null);
      } catch (err: any) {
        setError(err.message ?? "Failed to update item.");
      }
    });
  };

  const handleToggleActive = (item: ItemRow) => {
    setError(null);
    startTransition(async () => {
      try {
        await toggleItemActive(item.id, !item.isActive);
        setSuccessMessage(
          `Item ${item.code} is now ${!item.isActive ? "ACTIVE" : "INACTIVE"}.`
        );
      } catch (err: any) {
        setError(err.message ?? "Failed to toggle status.");
      }
    });
  };

  const categoryTone = (cat: MaterialCategory): Tone => {
    switch (cat) {
      case "PVC_RESIN":
        return "special";
      case "PLASTICISER":
        return "info";
      case "STABILISER":
        return "warning";
      case "FILLER":
        return "neutral";
      default:
        return "neutral";
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top Header bar */}
      <div className="flex h-[42px] shrink-0 items-center gap-3 border-b border-edge bg-faint px-3">
        <h1 className="shrink-0 text-[14px] font-semibold tracking-tight text-ink">
          Item & Material Master
        </h1>
        <span className="shrink-0 rounded-sm bg-pastel px-1.5 py-px font-num text-[11px] font-medium text-primary">
          {items.length} Items
        </span>
        <span className="text-[11.5px] text-muted">
          Master catalog of raw materials, chemicals, and finished products
        </span>
        <div className="ml-auto">
          <Button
            onClick={handleOpenCreate}
            className="text-[11px] h-[26px] px-3 bg-primary text-white hover:bg-primary-hover"
          >
            + Create New Item
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex h-[34px] shrink-0 items-center gap-6 border-b border-edge bg-surface px-4 text-xs font-semibold">
        <Link
          href="/items"
          className="border-b-2 border-primary text-primary py-2 cursor-pointer"
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
      </div>

      {/* Notifications */}
      {error && (
        <div className="border-b border-danger bg-danger-bg px-4 py-2 text-xs font-semibold text-danger-text">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="border-b border-success bg-success-bg/30 px-4 py-2 text-xs font-semibold text-success-text">
          {successMessage}
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex min-h-0 flex-1 flex-col bg-canvas p-4 gap-3 overflow-hidden">
        {/* Toolbar & Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 rounded-sm border border-edge">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="w-64">
              <Input
                type="text"
                placeholder="Search code, name, grade, CAS..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-48">
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Item Types</option>
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>Showing <strong>{filteredItems.length}</strong> of {items.length}</span>
          </div>
        </div>

        {/* Master Items Grid Table */}
        <div className="flex-1 overflow-auto border border-edge rounded-sm bg-surface scroll-thin">
          <table className="w-full text-left text-[11.5px]">
            <thead className="bg-faint/80 text-slate-700 font-semibold border-b border-edge sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">Item Code</th>
                <th className="px-3 py-2">Classification</th>
                <th className="px-3 py-2">Item Name & Spec</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">UOM</th>
                <th className="px-3 py-2 text-right">On-Hand Stock</th>
                <th className="px-3 py-2 text-right">Reorder Level</th>
                <th className="px-3 py-2 text-right">Lead Time</th>
                <th className="px-3 py-2 text-center">BOM Usage</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted italic">
                    No items match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-pastel/20 text-slate-700">
                    <td className="px-3 py-2 font-semibold font-num text-primary">
                      {item.code}
                    </td>
                    <td className="px-3 py-2">
                      <Chip
                        tone={
                          item.itemType === "FINISHED_GOOD"
                            ? "special"
                            : item.itemType === "SEMI_FINISHED"
                            ? "info"
                            : "neutral"
                        }
                      >
                        {item.itemType === "FINISHED_GOOD"
                          ? "FINISHED GOOD"
                          : item.itemType === "SEMI_FINISHED"
                          ? "SEMI-FINISHED"
                          : "RAW MATERIAL"}
                      </Chip>
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/items/${encodeURIComponent(item.code)}`}
                        className="group inline-block cursor-pointer text-left"
                      >
                        <div className="font-semibold text-slate-900 group-hover:text-primary group-hover:underline transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-muted group-hover:text-slate-600 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {item.grade && <span>Grade: {item.grade}</span>}
                          {item.casNumber && <span>CAS: {item.casNumber}</span>}
                          {item.specNote && <span className="italic truncate max-w-[200px]">Spec: {item.specNote}</span>}
                          {item.isHazardous && (
                            <span className="text-danger font-bold uppercase">Hazardous</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={categoryTone(item.category)}>
                        {item.category.replace(/_/g, " ")}
                      </Chip>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted text-xs">
                      {item.uom}
                    </td>
                    <td className="px-3 py-2 text-right font-num font-bold text-slate-800">
                      {item.onHandKg.toLocaleString()} {item.uom}
                    </td>
                    <td className="px-3 py-2 text-right font-num text-muted">
                      {item.reorderLevelKg.toLocaleString()} {item.uom}
                    </td>
                    <td className="px-3 py-2 text-right font-num text-muted">
                      {item.leadTimeDays}d
                    </td>
                    <td className="px-3 py-2 text-center font-num text-xs">
                      {item.usedInBoms > 0 ? (
                        <Link
                          href={`/boms?filterByItem=${encodeURIComponent(item.code)}`}
                          className="inline-block bg-pastel/60 text-primary-hover hover:bg-pastel hover:underline px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer"
                        >
                          {item.usedInBoms} BOMs
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={item.isActive ? "success" : "neutral"}>
                        {item.isActive ? "ACTIVE" : "INACTIVE"}
                      </Chip>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="text-primary hover:underline font-semibold text-[11px] cursor-pointer"
                        >
                          Edit
                        </button>
                        <span className="text-edge">|</span>
                        <button
                          disabled={isPending}
                          onClick={() => handleToggleActive(item)}
                          className={`text-[11px] font-semibold hover:underline cursor-pointer ${
                            item.isActive ? "text-danger" : "text-success-text"
                          }`}
                        >
                          {item.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE ITEM DRAWER */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-surface border-l border-edge shadow-xl flex flex-col p-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Create New Item / Material</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Register a new item in the Master Material Catalog.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3.5 text-xs text-slate-700 scroll-thin">
              <Field label="Item Code (Leave blank to auto-generate)">
                <Input
                  type="text"
                  placeholder="e.g. FG-CP-001 or RM-FILLER-001"
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value)}
                />
              </Field>

              <Field label="Item Classification (Role)" required>
                <Select
                  value={createItemType}
                  onChange={(e) => setCreateItemType(e.target.value as ItemType)}
                  required
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Item / Material Name" required>
                <Input
                  type="text"
                  placeholder="e.g. Calcium Carbonate"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" required>
                  <Select
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value as MaterialCategory)}
                    required
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Unit of Measure (UOM)" required>
                  <Select
                    value={createUom}
                    onChange={(e) => setCreateUom(e.target.value as Uom)}
                    required
                  >
                    {UOMS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Grade / Sub-specification">
                  <Input
                    type="text"
                    placeholder="e.g. 5 Micron Precipitated"
                    value={createGrade}
                    onChange={(e) => setCreateGrade(e.target.value)}
                  />
                </Field>

                <Field label="HSN Code">
                  <Input
                    type="text"
                    placeholder="e.g. 28365000"
                    value={createHsnCode}
                    onChange={(e) => setCreateHsnCode(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Reorder Level">
                  <Input
                    type="number"
                    value={createReorderLevel}
                    onChange={(e) => setCreateReorderLevel(e.target.value)}
                  />
                </Field>
                <Field label="Reorder Qty">
                  <Input
                    type="number"
                    value={createReorderQty}
                    onChange={(e) => setCreateReorderQty(e.target.value)}
                  />
                </Field>
                <Field label="Lead Time (Days)">
                  <Input
                    type="number"
                    value={createLeadTime}
                    onChange={(e) => setCreateLeadTime(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="CAS Chemical Number">
                <Input
                  type="text"
                  placeholder="e.g. 471-34-1"
                  value={createCasNumber}
                  onChange={(e) => setCreateCasNumber(e.target.value)}
                />
              </Field>

              <Field label="Key Specification Remarks">
                <textarea
                  className="w-full rounded border border-edge p-2 text-xs text-slate-800 min-h-[60px] focus:outline-none focus:border-primary bg-surface"
                  placeholder="e.g. Bulk density 0.85 g/cm3, moisture max 0.2%"
                  value={createSpecNote}
                  onChange={(e) => setCreateSpecNote(e.target.value)}
                />
              </Field>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={createHazardous}
                  onChange={(e) => setCreateHazardous(e.target.checked)}
                  className="h-3.5 w-3.5 accent-danger"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Mark as Hazardous Material (Special Storage & Safety Handling)
                </span>
              </label>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleCreateSubmit}
                className="flex-1 bg-primary text-white hover:bg-primary-hover"
              >
                {isPending ? "Creating..." : "Save Item"}
              </Button>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="flex-1 rounded border border-edge text-xs font-semibold py-1.5 hover:bg-faint text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ITEM DRAWER */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-surface border-l border-edge shadow-xl flex flex-col p-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Edit Item — {editingItem.code}</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Update item specifications and inventory parameters.
                </p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3.5 text-xs text-slate-700 scroll-thin">
              <Field label="Item Code">
                <Input type="text" value={editingItem.code} disabled className="bg-faint text-muted font-num" />
              </Field>

              <Field label="Item Classification (Role)" required>
                <Select
                  value={editItemType}
                  onChange={(e) => setEditItemType(e.target.value as ItemType)}
                  required
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Item / Material Name" required>
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category" required>
                  <Select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as MaterialCategory)}
                    required
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Unit of Measure (UOM)" required>
                  <Select
                    value={editUom}
                    onChange={(e) => setEditUom(e.target.value as Uom)}
                    required
                  >
                    {UOMS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Grade / Sub-specification">
                  <Input
                    type="text"
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                  />
                </Field>

                <Field label="HSN Code">
                  <Input
                    type="text"
                    value={editHsnCode}
                    onChange={(e) => setEditHsnCode(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Reorder Level">
                  <Input
                    type="number"
                    value={editReorderLevel}
                    onChange={(e) => setEditReorderLevel(e.target.value)}
                  />
                </Field>
                <Field label="Reorder Qty">
                  <Input
                    type="number"
                    value={editReorderQty}
                    onChange={(e) => setEditReorderQty(e.target.value)}
                  />
                </Field>
                <Field label="Lead Time (Days)">
                  <Input
                    type="number"
                    value={editLeadTime}
                    onChange={(e) => setEditLeadTime(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="CAS Chemical Number">
                <Input
                  type="text"
                  value={editCasNumber}
                  onChange={(e) => setEditCasNumber(e.target.value)}
                />
              </Field>

              <Field label="Key Specification Remarks">
                <textarea
                  className="w-full rounded border border-edge p-2 text-xs text-slate-800 min-h-[60px] focus:outline-none focus:border-primary bg-surface"
                  value={editSpecNote}
                  onChange={(e) => setEditSpecNote(e.target.value)}
                />
              </Field>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editHazardous}
                  onChange={(e) => setEditHazardous(e.target.checked)}
                  className="h-3.5 w-3.5 accent-danger"
                />
                <span className="text-xs font-semibold text-slate-800">
                  Mark as Hazardous Material
                </span>
              </label>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleEditSubmit}
                className="flex-1 bg-primary text-white hover:bg-primary-hover"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 rounded border border-edge text-xs font-semibold py-1.5 hover:bg-faint text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
