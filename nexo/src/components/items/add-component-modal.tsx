"use client";

import { useState, useMemo, useTransition } from "react";
import { Chip, Tone } from "@/components/ui/chip";
import { Button, Input, Select, Field } from "@/components/ui/form";
import { MaterialCategory, Uom, ItemType } from "@prisma/client";
import { createItem } from "@/app/(app)/items/actions";
import { formatUomDisplay } from "@/lib/uom";

export type ComponentItemOption = {
  id: string;
  code: string;
  name: string;
  itemType: ItemType;
  category: MaterialCategory;
  grade?: string;
  casNumber?: string;
  hsnCode?: string;
  uom: Uom;
  onHandKg?: number;
};

const CATEGORIES: { value: MaterialCategory; label: string }[] = [
  { value: "PVC_RESIN", label: "PVC Resin" },
  { value: "PLASTICISER", label: "Plasticiser" },
  { value: "STABILISER", label: "Stabiliser" },
  { value: "FILLER", label: "Filler" },
  { value: "LUBRICANT", label: "Lubricant" },
  { value: "PROCESSING_AID", label: "Processing Aid" },
  { value: "IMPACT_MODIFIER", label: "Impact Modifier" },
  { value: "FLAME_RETARDANT", label: "Flame Retardant" },
  { value: "PIGMENT", label: "Pigment" },
  { value: "BLOWING_AGENT", label: "Blowing Agent" },
  { value: "OTHER", label: "Other Component" },
];

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "RAW_MATERIAL", label: "Raw Material" },
  { value: "SEMI_FINISHED", label: "Semi-Finished Compound" },
  { value: "FINISHED_GOOD", label: "Finished Good" },
];

const UOMS: { value: Uom; label: string }[] = [
  { value: "KG", label: "Kilograms (KG)" },
  { value: "MT", label: "Metric Tonnes (MT)" },
  { value: "LTR", label: "Litres (LTR)" },
  { value: "NOS", label: "Numbers / Units (NOS)" },
];

export function AddComponentModal({
  isOpen,
  onClose,
  availableItems,
  onAddComponent,
  onItemCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  availableItems: ComponentItemOption[];
  onAddComponent: (
    item: { id: string; code: string; name: string; category?: string; uom?: string },
    quantityKg: number
  ) => void;
  onItemCreated?: (newItem: ComponentItemOption) => void;
}) {
  const [activeTab, setActiveTab] = useState<"SELECT" | "CREATE">("SELECT");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Tab 1: Select Existing Item state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    availableItems[0]?.id ?? null
  );
  const [selectQuantity, setSelectQuantity] = useState("10");

  // Tab 2: Create New Item state
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [createItemType, setCreateItemType] = useState<ItemType>("RAW_MATERIAL");
  const [createCategory, setCreateCategory] = useState<MaterialCategory>("FILLER");
  const [createUom, setCreateUom] = useState<Uom>("KG");
  const [createGrade, setCreateGrade] = useState("");
  const [createCasNumber, setCreateCasNumber] = useState("");
  const [createHsnCode, setCreateHsnCode] = useState("");
  const [createReorderLevel, setCreateReorderLevel] = useState("0");
  const [createLeadTime, setCreateLeadTime] = useState("7");
  const [createSpecNote, setCreateSpecNote] = useState("");
  const [createHazardous, setCreateHazardous] = useState(false);
  const [createQuantity, setCreateQuantity] = useState("10");

  // Filtered available components (reuses search logic from Item Master page)
  const filteredItems = useMemo(() => {
    return availableItems.filter((item) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        q === "" ||
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.grade && item.grade.toLowerCase().includes(q)) ||
        (item.casNumber && item.casNumber.toLowerCase().includes(q));

      const matchesCategory =
        categoryFilter === "ALL" || item.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [availableItems, search, categoryFilter]);

  const selectedItem = availableItems.find((i) => i.id === selectedItemId);

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

  const handleSelectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedItem) {
      setError("Please select a component item from the list.");
      return;
    }
    const qty = parseFloat(selectQuantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid positive quantity.");
      return;
    }

    onAddComponent(
      {
        id: selectedItem.id,
        code: selectedItem.code,
        name: selectedItem.name,
        category: selectedItem.category,
        uom: selectedItem.uom,
      },
      qty
    );
    onClose();
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!createName.trim()) {
      setError("Item Name is required.");
      return;
    }
    const qty = parseFloat(createQuantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid component quantity for the BOM.");
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
          casNumber: createCasNumber.trim() || undefined,
          hsnCode: createHsnCode.trim() || undefined,
          reorderLevelKg: parseFloat(createReorderLevel) || 0,
          leadTimeDays: parseInt(createLeadTime, 10) || 7,
          specNote: createSpecNote.trim() || undefined,
          isHazardous: createHazardous,
        });

        const newItem: ComponentItemOption = {
          id: result.id,
          code: result.code,
          name: createName.trim(),
          itemType: createItemType,
          category: createCategory,
          grade: createGrade.trim(),
          casNumber: createCasNumber.trim(),
          uom: createUom,
          onHandKg: 0,
        };

        if (onItemCreated) {
          onItemCreated(newItem);
        }

        // Add as component to current BOM in one unified action
        onAddComponent(
          {
            id: result.id,
            code: result.code,
            name: createName.trim(),
            category: createCategory,
            uom: createUom,
          },
          qty
        );

        onClose();
      } catch (err: any) {
        setError(err.message ?? "Failed to create item.");
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-2xl bg-surface rounded-sm border border-edge shadow-2xl max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-edge bg-faint px-4 py-3">
          <div>
            <h2 className="text-[13.5px] font-bold text-ink">Add Component Line Item</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Select an existing material or register and add a new item in one step.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-edge bg-surface px-4 text-xs font-semibold gap-6">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setActiveTab("SELECT");
            }}
            className={`py-2.5 transition-colors cursor-pointer ${
              activeTab === "SELECT"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted hover:text-ink"
            }`}
          >
            1. Select Existing Item
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setActiveTab("CREATE");
            }}
            className={`py-2.5 transition-colors cursor-pointer ${
              activeTab === "CREATE"
                ? "border-b-2 border-primary text-primary font-bold"
                : "text-muted hover:text-ink"
            }`}
          >
            2. Create New Item & Add to BOM
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="border-b border-danger bg-danger-bg px-4 py-2 text-xs font-semibold text-danger-text">
            {error}
          </div>
        )}

        {/* Tab 1: SELECT EXISTING ITEM */}
        {activeTab === "SELECT" && (
          <form onSubmit={handleSelectSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="p-4 flex flex-col flex-1 min-h-0 space-y-3">
              {/* Search & Filter Controls */}
              <div className="flex gap-2.5">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder="Search by code, name, grade, CAS..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="w-44">
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
              </div>

              {/* Items Catalog List */}
              <div className="flex-1 overflow-y-auto border border-edge rounded-sm bg-surface scroll-thin min-h-[220px]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-faint/80 text-slate-700 font-semibold border-b border-edge sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-1.5 w-8"></th>
                      <th className="px-2.5 py-1.5">Item Code</th>
                      <th className="px-2.5 py-1.5">Material Name & Spec</th>
                      <th className="px-2.5 py-1.5">Category</th>
                      <th className="px-2.5 py-1.5">UOM</th>
                      <th className="px-2.5 py-1.5 text-right">On-Hand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted italic">
                          No components match your search. Switch to the &quot;Create New Item&quot; tab to register it.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const isSelected = selectedItemId === item.id;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedItemId(item.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-pastel/80 text-primary-hover font-semibold"
                                : "hover:bg-pastel/30 text-slate-700"
                            }`}
                          >
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="radio"
                                name="selectedComponentItem"
                                checked={isSelected}
                                onChange={() => setSelectedItemId(item.id)}
                                className="accent-primary"
                              />
                            </td>
                            <td className="px-2.5 py-1.5 font-num font-semibold text-primary">
                              {item.code}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <div className="font-semibold text-slate-900">{item.name}</div>
                              <div className="text-[10px] text-muted flex gap-2">
                                {item.grade && <span>Grade: {item.grade}</span>}
                                {item.casNumber && <span>CAS: {item.casNumber}</span>}
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5">
                              <Chip tone={categoryTone(item.category)}>
                                {item.category.replace(/_/g, " ")}
                              </Chip>
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-muted text-xs">
                              {formatUomDisplay(item.uom)}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-num">
                              {item.onHandKg != null ? `${item.onHandKg.toLocaleString()} ${formatUomDisplay(item.uom)}` : "—"}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Selected Item Indicator & Quantity Input */}
              <div className="flex items-center justify-between border border-edge rounded-sm p-2.5 bg-faint/40">
                <div className="text-xs">
                  <span className="text-muted">Selected Component: </span>
                  {selectedItem ? (
                    <strong className="text-ink">
                      {selectedItem.name} ({selectedItem.code})
                    </strong>
                  ) : (
                    <span className="text-danger italic">None selected</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700">Quantity:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={selectQuantity}
                      onChange={(e) => setSelectQuantity(e.target.value)}
                      className="w-24 rounded border border-edge bg-surface px-2.5 py-1 text-right text-xs font-num focus:outline-none focus:border-primary font-bold text-slate-900"
                      required
                    />
                    <span className="text-xs text-muted font-num font-semibold">
                      {formatUomDisplay(selectedItem?.uom)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-edge bg-faint px-4 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-edge px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={!selectedItem}
                className="text-xs h-[30px] px-4 bg-primary text-white hover:bg-primary-hover"
              >
                Add Component to BOM
              </Button>
            </div>
          </form>
        )}

        {/* Tab 2: CREATE NEW ITEM & ADD */}
        {activeTab === "CREATE" && (
          <form onSubmit={handleCreateSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="p-4 flex-1 overflow-y-auto space-y-3 scroll-thin text-xs text-slate-700">
              <div className="rounded bg-pastel/40 border border-primary/20 p-2.5 text-[11px] text-primary-hover">
                <strong>Unified Master Catalog:</strong> This item will be permanently added to the Item & Material Master and simultaneously appended as a component to the current BOM recipe.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Item Code (Leave blank to auto-generate)">
                  <Input
                    type="text"
                    placeholder="e.g. RM-FL-002"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                  />
                </Field>

                <Field label="Classification" required>
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
              </div>

              <Field label="Item / Material Name" required>
                <Input
                  type="text"
                  placeholder="e.g. Precipitated Calcium Carbonate"
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

                <Field label="UOM" required>
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
                <Field label="Grade / Spec Sub-brand">
                  <Input
                    type="text"
                    placeholder="e.g. Calfort 200"
                    value={createGrade}
                    onChange={(e) => setCreateGrade(e.target.value)}
                  />
                </Field>

                <Field label="CAS Number">
                  <Input
                    type="text"
                    placeholder="e.g. 471-34-1"
                    value={createCasNumber}
                    onChange={(e) => setCreateCasNumber(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label={`Reorder Level (${formatUomDisplay(createUom)})`}>
                  <Input
                    type="number"
                    value={createReorderLevel}
                    onChange={(e) => setCreateReorderLevel(e.target.value)}
                  />
                </Field>

                <Field label="Lead Time (Days)">
                  <Input
                    type="number"
                    value={createLeadTime}
                    onChange={(e) => setCreateLeadTime(e.target.value)}
                  />
                </Field>

                <Field label={`BOM Component Qty (${formatUomDisplay(createUom)})`} required>
                  <Input
                    type="number"
                    step="any"
                    min="0.001"
                    placeholder={`Qty in ${formatUomDisplay(createUom)}`}
                    value={createQuantity}
                    onChange={(e) => setCreateQuantity(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field label="Technical Specification Note">
                <textarea
                  rows={2}
                  className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs"
                  placeholder="e.g. Particle size 1.2 microns, stearic acid coated"
                  value={createSpecNote}
                  onChange={(e) => setCreateSpecNote(e.target.value)}
                />
              </Field>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={createHazardous}
                  onChange={(e) => setCreateHazardous(e.target.checked)}
                  className="accent-danger"
                />
                <span className="font-semibold text-danger text-xs">
                  Hazardous Material (Requires special handling / SDS)
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="border-t border-edge bg-faint px-4 py-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded border border-edge px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-surface transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <Button
                type="submit"
                disabled={isPending}
                className="text-xs h-[30px] px-4 bg-primary text-white hover:bg-primary-hover"
              >
                {isPending ? "Creating Item..." : "Create Item & Add to BOM"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
