"use client";

import { CATEGORY_OPTIONS } from "@/lib/enums";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Chip, Tone } from "@/components/ui/chip";
import { Button, Input, Select, Field, FormError } from "@/components/ui/form";
import { RecordHeader, Section, FieldGrid, MiniTable, Td, Tr } from "@/components/detail/record";
import { RecordTabs, TabColumns } from "@/components/detail/tabs";
import { MaterialCategory, Uom, ItemType } from "@prisma/client";
import { updateItem, toggleItemActive } from "../actions";
import { formatUomDisplay } from "@/lib/uom";

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

export type ItemDetailProps = {
  item: {
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
    kValue: number | null;
    isHazardous: boolean;
    isActive: boolean;
    reorderLevelKg: number;
    reorderQtyKg: number;
    leadTimeDays: number;
    currentPricePerKg: number | null;
    onHandKg: number;
    createdAt: string;
    updatedAt: string;
  };
  batches: {
    id: string;
    batchNo: string;
    status: string;
    receivedQtyKg: number;
    availableQtyKg: number;
    ratePerKg: number | null;
    warehouseName: string;
    binLocation: string | null;
    receivedOn: string;
    expiresOn: string | null;
  }[];
  standardBomUsages: {
    id: string;
    bomCode: string;
    status: string;
    targetMaterialName: string;
    targetMaterialCode: string;
    quantityKg: number;
    requestedByName: string;
    approvedByName: string | null;
    createdAt: string;
  }[];
  orderBomUsages: {
    id: string;
    bomCode: string;
    status: string;
    source: string;
    targetMaterialName: string;
    targetMaterialCode: string;
    quantityKg: number;
    createdAt: string;
  }[];
  productStandardBoms: {
    id: string;
    bomCode: string;
    status: string;
    linesCount: number;
    requestedByName: string;
    approvedByName: string | null;
    createdAt: string;
  }[];
  auditEvents: {
    id: string;
    action: string;
    summary: string;
    actorName: string;
    createdAt: string;
    metadata: any;
  }[];
};

export function ItemDetailClient({
  item,
  batches,
  standardBomUsages,
  orderBomUsages,
  productStandardBoms,
  auditEvents,
}: ItemDetailProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit drawer state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editItemType, setEditItemType] = useState<ItemType>(item.itemType);
  const [editCategory, setEditCategory] = useState<MaterialCategory>(item.category);
  const [editUom, setEditUom] = useState<Uom>(item.uom);
  const [editGrade, setEditGrade] = useState(item.grade);
  const [editHsnCode, setEditHsnCode] = useState(item.hsnCode);
  const [editCasNumber, setEditCasNumber] = useState(item.casNumber);
  const [editReorderLevel, setEditReorderLevel] = useState(item.reorderLevelKg.toString());
  const [editReorderQty, setEditReorderQty] = useState(item.reorderQtyKg.toString());
  const [editLeadTime, setEditLeadTime] = useState(item.leadTimeDays.toString());
  const [editHazardous, setEditHazardous] = useState(item.isHazardous);
  const [editSpecNote, setEditSpecNote] = useState(item.specNote);

  const handleOpenEdit = () => {
    setError(null);
    setSuccessMessage(null);
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
    setIsEditOpen(true);
  };

  const handleEditSubmit = () => {
    setError(null);
    if (!editName.trim()) {
      setError("Item Name is required.");
      return;
    }

    startTransition(async () => {
      try {
        await updateItem(item.id, {
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
        setSuccessMessage(`Item ${item.code} successfully updated!`);
        setIsEditOpen(false);
      } catch (err: any) {
        setError(err.message ?? "Failed to update item.");
      }
    });
  };

  const handleToggleActive = () => {
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

  const classificationTone = (type: ItemType): Tone => {
    switch (type) {
      case "FINISHED_GOOD":
        return "special";
      case "SEMI_FINISHED":
        return "info";
      case "RAW_MATERIAL":
      default:
        return "neutral";
    }
  };

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

  const totalBomsCount = standardBomUsages.length + orderBomUsages.length + productStandardBoms.length;
  const isStockLow = item.onHandKg < item.reorderLevelKg;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Record Header */}
      <RecordHeader
        backHref="/items"
        backLabel="Item Master"
        code={item.code}
        title={item.name}
        status={
          <span className="flex items-center gap-1.5">
            <Chip tone={classificationTone(item.itemType)}>
              {item.itemType.replace(/_/g, " ")}
            </Chip>
            <Chip tone={categoryTone(item.category)}>
              {item.category.replace(/_/g, " ")}
            </Chip>
            {item.isHazardous && <Chip tone="warning">Hazardous</Chip>}
            <Chip tone={item.isActive ? "success" : "neutral"}>
              {item.isActive ? "Active" : "Inactive"}
            </Chip>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleOpenEdit}
              className="text-[11px] h-[26px] px-2.5 bg-primary text-white hover:bg-primary-hover"
            >
              Edit Item
            </Button>
            <button
              disabled={isPending}
              onClick={handleToggleActive}
              className={`rounded border text-[11px] font-semibold px-2.5 py-1 transition-colors cursor-pointer ${
                item.isActive
                  ? "border-danger text-danger hover:bg-danger-bg"
                  : "border-success text-success-text hover:bg-success-bg/30"
              }`}
            >
              {item.isActive ? "Deactivate" : "Activate"}
            </button>
          </div>
        }
        meta={[
          { label: "Classification", value: item.itemType.replace(/_/g, " ") },
          { label: "Category", value: item.category.replace(/_/g, " ") },
          { label: "Grade", value: item.grade || "—" },
          { label: "Unit (UOM)", value: item.uom },
          {
            label: "On hand",
            value: (
              <span className={`font-num font-bold ${isStockLow ? "text-danger" : "text-ink"}`}>
                {item.onHandKg.toLocaleString()} {item.uom}
              </span>
            ),
          },
          {
            label: "Reorder level",
            value: (
              <span className="font-num text-muted">
                {item.reorderLevelKg.toLocaleString()} {item.uom}
              </span>
            ),
          },
          { label: "Lead time", value: `${item.leadTimeDays} days` },
          {
            label: "BOM usage",
            value: (
              <Link
                href={`/boms?filterByItem=${encodeURIComponent(item.code)}`}
                className="font-num font-semibold text-primary hover:underline"
              >
                {totalBomsCount} BOM{totalBomsCount === 1 ? "" : "s"}
              </Link>
            ),
          },
        ]}
      />

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

      {/* Detail Tabs */}
      <RecordTabs
        storageKey="item-detail"
        tabs={[
          {
            id: "specifications",
            label: "Specifications & Details",
            content: (
              <TabColumns
                main={
                  <div className="space-y-4">
                    <Section title="Item Master Specifications">
                      <FieldGrid
                        columns={2}
                        fields={[
                          { label: "Item Code", value: <span className="font-num font-semibold text-primary">{item.code}</span> },
                          { label: "Item Classification", value: item.itemType.replace(/_/g, " ") },
                          { label: "Item Name", value: <span className="font-semibold text-slate-900">{item.name}</span> },
                          { label: "Category", value: item.category.replace(/_/g, " ") },
                          { label: "Unit of Measurement", value: item.uom },
                          { label: "Grade", value: item.grade || "—" },
                          { label: "CAS Number", value: item.casNumber ? <span className="font-num">{item.casNumber}</span> : "—" },
                          { label: "HSN Code", value: item.hsnCode ? <span className="font-num">{item.hsnCode}</span> : "—" },
                          ...(item.kValue ? [{ label: "K-Value (Resin)", value: `K${item.kValue}` }] : []),
                          {
                            label: "Hazardous Classification",
                            value: item.isHazardous ? (
                              <span className="text-danger font-bold uppercase">Hazardous Material (Handle per SDS)</span>
                            ) : (
                              "Non-Hazardous"
                            ),
                          },
                          {
                            label: "Technical Specification Note",
                            value: item.specNote || "—",
                            span: true,
                          },
                        ]}
                      />
                    </Section>

                    {item.specNote && (
                      <Section title="Specification Summary">
                        <div className="rounded bg-faint/60 border border-edge p-3 text-xs text-slate-700 whitespace-pre-wrap font-sans">
                          {item.specNote}
                        </div>
                      </Section>
                    )}
                  </div>
                }
                aside={
                  <div className="space-y-4">
                    <Section title="Stock & Replenishment Parameters">
                      <FieldGrid
                        columns={1}
                        fields={[
                          {
                            label: "Current On-Hand Stock",
                            value: (
                              <span className={`font-num font-bold text-sm ${isStockLow ? "text-danger" : "text-slate-900"}`}>
                                {item.onHandKg.toLocaleString()} {item.uom}
                                {isStockLow && (
                                  <span className="ml-2 text-[10.5px] font-normal text-danger">
                                    (Below Reorder Level!)
                                  </span>
                                )}
                              </span>
                            ),
                          },
                          {
                            label: "Reorder Threshold Level",
                            value: (
                              <span className="font-num font-semibold">
                                {item.reorderLevelKg.toLocaleString()} {item.uom}
                              </span>
                            ),
                          },
                          {
                            label: "Standard Reorder Quantity",
                            value: (
                              <span className="font-num">
                                {item.reorderQtyKg.toLocaleString()} {item.uom}
                              </span>
                            ),
                          },
                          {
                            label: "Supplier Lead Time",
                            value: (
                              <span className="font-num font-semibold">
                                {item.leadTimeDays} calendar days
                              </span>
                            ),
                          },
                          ...(item.currentPricePerKg != null
                            ? [
                                {
                                  label: "Approved Price / Kg",
                                  value: <span className="font-num font-semibold">₹{item.currentPricePerKg.toFixed(2)}</span>,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </Section>

                    <Section title="Catalog Metadata">
                      <FieldGrid
                        columns={1}
                        fields={[
                          { label: "Catalog Registered", value: new Date(item.createdAt).toLocaleString() },
                          { label: "Last Profile Modification", value: new Date(item.updatedAt).toLocaleString() },
                          {
                            label: "Active In Catalog",
                            value: item.isActive ? "Yes (Available for BOMs)" : "No (Archived / Inactive)",
                          },
                        ]}
                      />
                    </Section>
                  </div>
                }
              />
            ),
          },
          {
            id: "inventory",
            label: "Stock & Batches",
            count: batches.length || undefined,
            content: (
              <Section
                title="Current Warehouse Inventory Batches"
                hint={`Total on-hand: ${item.onHandKg.toLocaleString()} ${item.uom} across ${batches.length} batch(es)`}
                padded={false}
              >
                <MiniTable
                  head={[
                    { label: "Batch Number", width: "140px" },
                    { label: "Warehouse & Bin", width: "180px" },
                    { label: "Status", width: "120px" },
                    { label: "Available Qty", width: "120px", align: "right" },
                    { label: "Received Qty", width: "120px", align: "right" },
                    { label: "Received Date", width: "120px" },
                    { label: "Expiry Date", width: "120px" },
                  ]}
                  empty="No physical inventory batches recorded in store for this item."
                >
                  {batches.map((b) => (
                    <Tr key={b.id}>
                      <Td>
                        <span className="font-num font-semibold text-primary">{b.batchNo}</span>
                      </Td>
                      <Td muted>
                        {b.warehouseName}
                        {b.binLocation ? ` · Bin ${b.binLocation}` : ""}
                      </Td>
                      <Td>
                        <Chip
                          tone={
                            b.status === "AVAILABLE"
                              ? "success"
                              : b.status === "QUARANTINE"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {b.status}
                        </Chip>
                      </Td>
                      <Td align="right" num className={b.availableQtyKg > 0 ? "font-bold text-slate-900" : "text-muted"}>
                        {b.availableQtyKg.toLocaleString()} {item.uom}
                      </Td>
                      <Td align="right" num muted>
                        {b.receivedQtyKg.toLocaleString()} {item.uom}
                      </Td>
                      <Td num muted>{new Date(b.receivedOn).toLocaleDateString()}</Td>
                      <Td num muted>{b.expiresOn ? new Date(b.expiresOn).toLocaleDateString() : "—"}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            ),
          },
          {
            id: "bom-usage",
            label: "BOM Usage",
            count: totalBomsCount || undefined,
            content: (
              <div className="space-y-6">
                {/* Standard BOMs where this item is used as a component */}
                <Section
                  title="Standard BOMs (Component Usage)"
                  hint={`${standardBomUsages.length} Standard BOM(s) consume this item`}
                  actions={
                    <Link
                      href={`/boms?filterByItem=${encodeURIComponent(item.code)}`}
                      className="text-xs text-primary font-semibold hover:underline"
                    >
                      View in Unified BOM Explorer &rarr;
                    </Link>
                  }
                  padded={false}
                >
                  <MiniTable
                    head={[
                      { label: "BOM Code", width: "160px" },
                      { label: "Target Finished Good", width: "240px" },
                      { label: "Component Qty", width: "130px", align: "right" },
                      { label: "Status", width: "130px" },
                      { label: "Requested By", width: "150px" },
                      { label: "Authorized By", width: "150px" },
                      { label: "Date", width: "110px" },
                      { label: "Action", width: "90px", align: "right" },
                    ]}
                    empty="This item is not consumed as a component in any Standard BOM."
                  >
                    {standardBomUsages.map((bom) => (
                      <Tr key={bom.id}>
                        <Td>
                          <Link href="/items/standard" className="font-num font-semibold text-primary hover:underline">
                            {bom.bomCode}
                          </Link>
                        </Td>
                        <Td>
                          <div className="font-semibold text-slate-800">{bom.targetMaterialName}</div>
                          <div className="text-[10px] text-muted font-num">{bom.targetMaterialCode}</div>
                        </Td>
                        <Td align="right" num className="font-bold text-slate-900">
                          {bom.quantityKg.toLocaleString()} {formatUomDisplay(item.uom)}
                        </Td>
                        <Td>
                          <Chip tone={bomStatusTone(bom.status)}>{bom.status}</Chip>
                        </Td>
                        <Td muted>{bom.requestedByName}</Td>
                        <Td muted>{bom.approvedByName ?? "—"}</Td>
                        <Td num muted>{new Date(bom.createdAt).toLocaleDateString()}</Td>
                        <Td align="right">
                          <Link
                            href="/items/standard"
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Open BOM
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </MiniTable>
                </Section>

                {/* Order BOMs where this item is used */}
                <Section
                  title="Order BOMs (Active Production Recipes)"
                  hint={`${orderBomUsages.length} Order BOM(s) consume this item`}
                  padded={false}
                >
                  <MiniTable
                    head={[
                      { label: "Order BOM Code", width: "160px" },
                      { label: "Source", width: "120px" },
                      { label: "Target Product", width: "240px" },
                      { label: "Component Qty", width: "130px", align: "right" },
                      { label: "Status", width: "130px" },
                      { label: "Created Date", width: "110px" },
                      { label: "Action", width: "90px", align: "right" },
                    ]}
                    empty="This item is not consumed as a component in any Order BOM."
                  >
                    {orderBomUsages.map((bom) => (
                      <Tr key={bom.id}>
                        <Td>
                          <Link href="/items/order" className="font-num font-semibold text-primary hover:underline">
                            {bom.bomCode}
                          </Link>
                        </Td>
                        <Td>
                          <Chip tone="neutral">{bom.source.replace(/_/g, " ")}</Chip>
                        </Td>
                        <Td>
                          <div className="font-semibold text-slate-800">{bom.targetMaterialName}</div>
                          <div className="text-[10px] text-muted font-num">{bom.targetMaterialCode}</div>
                        </Td>
                        <Td align="right" num className="font-bold text-slate-900">
                          {bom.quantityKg.toLocaleString()} {formatUomDisplay(item.uom)}
                        </Td>
                        <Td>
                          <Chip tone={bomStatusTone(bom.status)}>{bom.status}</Chip>
                        </Td>
                        <Td num muted>{new Date(bom.createdAt).toLocaleDateString()}</Td>
                        <Td align="right">
                          <Link
                            href="/items/order"
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Open BOM
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </MiniTable>
                </Section>

                {/* If Finished Good: Standard BOMs defined for this item */}
                {item.itemType === "FINISHED_GOOD" || productStandardBoms.length > 0 ? (
                  <Section
                    title="Defined Manufacturing Recipes (As Target Product)"
                    hint={`${productStandardBoms.length} BOM recipe(s) defined to produce this product`}
                    padded={false}
                  >
                    <MiniTable
                      head={[
                        { label: "BOM Code", width: "180px" },
                        { label: "Recipe Lines", width: "120px", align: "right" },
                        { label: "Status", width: "130px" },
                        { label: "Requested By", width: "160px" },
                        { label: "Authorized By", width: "160px" },
                        { label: "Created Date", width: "120px" },
                        { label: "Action", width: "90px", align: "right" },
                      ]}
                      empty="No Standard BOM recipe has been created for this product yet."
                    >
                      {productStandardBoms.map((bom) => (
                        <Tr key={bom.id}>
                          <Td>
                            <Link href="/items/standard" className="font-num font-semibold text-primary hover:underline">
                              {bom.bomCode}
                            </Link>
                          </Td>
                          <Td align="right" num className="font-bold">
                            {bom.linesCount} components
                          </Td>
                          <Td>
                            <Chip tone={bomStatusTone(bom.status)}>{bom.status}</Chip>
                          </Td>
                          <Td muted>{bom.requestedByName}</Td>
                          <Td muted>{bom.approvedByName ?? "—"}</Td>
                          <Td num muted>{new Date(bom.createdAt).toLocaleDateString()}</Td>
                          <Td align="right">
                            <Link
                              href="/items/standard"
                              className="text-[11px] font-semibold text-primary hover:underline"
                            >
                              Open Recipe
                            </Link>
                          </Td>
                        </Tr>
                      ))}
                    </MiniTable>
                  </Section>
                ) : null}
              </div>
            ),
          },
          {
            id: "history",
            label: "Edit History & Audit",
            count: auditEvents.length || undefined,
            content: (
              <Section
                title="Modification Audit Trail"
                hint={`${auditEvents.length} recorded audit events`}
                padded={false}
              >
                <MiniTable
                  head={[
                    { label: "Action Event", width: "180px" },
                    { label: "Summary Description" },
                    { label: "Modified By", width: "160px" },
                    { label: "Timestamp", width: "180px" },
                  ]}
                  empty="No past audit events recorded for this item yet."
                >
                  {auditEvents.map((evt) => (
                    <Tr key={evt.id}>
                      <Td>
                        <Chip
                          tone={
                            evt.action.includes("CREATE")
                              ? "success"
                              : evt.action.includes("UPDATE")
                              ? "info"
                              : "neutral"
                          }
                        >
                          {evt.action.replace(/_/g, " ")}
                        </Chip>
                      </Td>
                      <Td>
                        <div className="font-medium text-slate-900">{evt.summary}</div>
                        {evt.metadata && typeof evt.metadata === "object" && (
                          <div className="text-[10.5px] text-muted font-mono mt-0.5">
                            {Object.entries(evt.metadata)
                              .filter(([_, v]) => v != null)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </div>
                        )}
                      </Td>
                      <Td muted>{evt.actorName || "System"}</Td>
                      <Td num muted>{new Date(evt.createdAt).toLocaleString()}</Td>
                    </Tr>
                  ))}
                </MiniTable>
              </Section>
            ),
          },
        ]}
      />

      {/* EDIT ITEM DRAWER */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="h-full w-full max-w-md bg-surface border-l border-edge shadow-xl flex flex-col p-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between border-b border-edge pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink">Edit Item Specifications</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Update master data record for {item.code}.
                </p>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3.5 text-xs text-slate-700 scroll-thin">
              <Field label="Item Code">
                <Input type="text" value={item.code} disabled />
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

                <Field label="UOM" required>
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
                <Field label="Grade / Sub-brand">
                  <Input
                    type="text"
                    placeholder="e.g. K67 or Ca-Zn 402"
                    value={editGrade}
                    onChange={(e) => setEditGrade(e.target.value)}
                  />
                </Field>

                <Field label="HSN Code">
                  <Input
                    type="text"
                    placeholder="e.g. 3904"
                    value={editHsnCode}
                    onChange={(e) => setEditHsnCode(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="CAS Number">
                <Input
                  type="text"
                  placeholder="e.g. 9002-86-2"
                  value={editCasNumber}
                  onChange={(e) => setEditCasNumber(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Reorder Level (KG)">
                  <Input
                    type="number"
                    value={editReorderLevel}
                    onChange={(e) => setEditReorderLevel(e.target.value)}
                  />
                </Field>

                <Field label="Reorder Qty (KG)">
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

              <Field label="Technical Specification Notes">
                <textarea
                  rows={3}
                  className="w-full rounded border border-edge bg-surface px-2.5 py-1.5 focus:outline-none focus:border-primary text-xs"
                  placeholder="e.g. Specific Gravity: 1.40, Melting Point: 180°C..."
                  value={editSpecNote}
                  onChange={(e) => setEditSpecNote(e.target.value)}
                />
              </Field>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editHazardous}
                    onChange={(e) => setEditHazardous(e.target.checked)}
                    className="accent-danger"
                  />
                  <span className="font-semibold text-danger">Hazardous Material (Requires special handling / SDS)</span>
                </label>
              </div>
            </div>

            <div className="border-t border-edge pt-4 flex gap-2">
              <Button
                disabled={isPending}
                onClick={handleEditSubmit}
                className="flex-1 bg-primary text-white hover:bg-primary-hover"
              >
                {isPending ? "Saving Changes..." : "Save Changes"}
              </Button>
              <button
                disabled={isPending}
                onClick={() => setIsEditOpen(false)}
                className="flex-1 rounded border border-edge text-[11.5px] font-semibold py-1.5 hover:bg-faint transition-colors cursor-pointer"
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
