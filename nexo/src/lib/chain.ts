import type { Permission } from "@/lib/rbac";

/**
 * The document chains, as data.
 *
 * The modules were previously siblings in the rail — a list of orders, a list of
 * receipts — with the relationship between them living only in the operator's
 * head. This is that relationship written down: which document precedes which,
 * who signs each one, and what a stage is actually waiting on.
 *
 * Every flow map and every spine on every record page reads from here, so a stage
 * cannot appear in one and not the other.
 */

export type ProcurementStageKey =
  | "requisition"
  | "inquiry"
  | "quotation"
  | "comparison"
  | "order"
  | "receipt"
  | "qc"
  | "store"
  | "rejection";

export type SalesStageKey =
  | "sinquiry"
  | "costsheet"
  | "squotation"
  | "sorder"
  | "allocation"
  | "dispatch"
  | "packinglist"
  | "invoice"
  | "sreturn";

export type StageKey = ProcurementStageKey | SalesStageKey;

export type ChainId = "procurement" | "sales";

export type Stage = {
  key: StageKey;
  /** Short label for the spine, where horizontal room is scarce. */
  label: string;
  /** Full document name, used on the flow map and in headings. */
  document: string;
  /** Document code prefix, so an operator can map a code back to a stage. */
  prefix: string;
  href: string;
  permission: Permission;
  /** What has to be true for the next stage to be reachable. */
  gate?: string;
  /** Who signs it off, where a signature is required to advance. */
  approver?: string;
  /**
   * Set on stages that are alternative outcomes of the stage above rather than
   * steps after it. `accept` and `reject` render as a fork on the flow map.
   */
  branch?: "accept" | "reject";
  blurb: string;
};

export const PROCUREMENT_CHAIN: Stage[] = [
  {
    key: "requisition",
    label: "Requisition",
    document: "Purchase Requisition",
    prefix: "PR",
    href: "/procurement/requisitions",
    permission: "req:read",
    gate: "Approved by Purchase Head",
    approver: "Purchase Head",
    blurb: "Demand, with the stock position that justified it frozen onto the line.",
  },
  {
    key: "inquiry",
    label: "Inquiry",
    document: "Purchase Inquiry",
    prefix: "PI",
    href: "/procurement/inquiries",
    permission: "inquiry:read",
    gate: "Issued to two or more vendors",
    blurb: "The same specification and quantity put to every vendor at once.",
  },
  {
    key: "quotation",
    label: "Quotation",
    document: "Purchase Quotation",
    prefix: "PQ",
    href: "/procurement/inquiries",
    permission: "quote:read",
    gate: "At least one quotation received",
    blurb: "What each vendor came back with. Silence is recorded too.",
  },
  {
    key: "comparison",
    label: "Comparison",
    document: "Quotation Comparison",
    prefix: "PQ",
    href: "/procurement/inquiries",
    permission: "quote:read",
    gate: "One quotation selected, with a reason",
    approver: "Purchase Head",
    blurb: "Side by side on landed cost and lead time. The loser's reason is kept.",
  },
  {
    key: "order",
    label: "Order",
    document: "Purchase Order",
    prefix: "PO",
    href: "/procurement/orders",
    permission: "po:read",
    gate: "Approved within the signer's value ceiling",
    approver: "Purchase Head up to ₹25 lakh, Management above",
    blurb: "The commitment. Inherits the selected quotation's rates unchanged.",
  },
  {
    key: "receipt",
    label: "Receipt",
    document: "Material Receipt (GRN)",
    prefix: "GRN",
    href: "/procurement/grn",
    permission: "grn:read",
    gate: "Weighed in against the order",
    blurb: "What the challan claimed against what the weighbridge said.",
  },
  {
    key: "qc",
    label: "QC",
    document: "Purchase QC",
    prefix: "GRN",
    href: "/procurement/grn",
    permission: "grn:read",
    gate: "Every line inspected",
    approver: "Stores",
    blurb: "The inspection that splits the consignment in two.",
  },
  {
    key: "store",
    label: "Store",
    document: "Store Warehouse",
    prefix: "B",
    href: "/procurement/inventory",
    permission: "inventory:read",
    branch: "accept",
    blurb: "Accepted quantity becomes a traceable batch and a ledger receipt.",
  },
  {
    key: "rejection",
    label: "Rejection",
    document: "Vendor Rejection Note",
    prefix: "VRN",
    href: "/procurement/rejections",
    permission: "vrn:read",
    approver: "Purchase Head",
    branch: "reject",
    blurb: "Rejected quantity sits in the Rejection warehouse until this sends it back.",
  },
];

/**
 * The sales chain.
 *
 * It hangs off the compound the customer wants — Customer → Project →
 * Formulation — which is what lets a quotation be priced from the live approved
 * rate base instead of from a remembered number. The cost sheet is the join.
 */
export const SALES_CHAIN: Stage[] = [
  {
    key: "sinquiry",
    label: "Inquiry",
    document: "Sales Inquiry",
    prefix: "SI",
    href: "/sales/inquiries",
    permission: "sales:read",
    gate: "Matched to a compound",
    blurb: "What the customer asked for, in their words, before it has a project code.",
  },
  {
    key: "costsheet",
    label: "Cost sheet",
    document: "Cost Sheet",
    prefix: "CS",
    href: "/sales/cost-sheets",
    permission: "costsheet:read",
    gate: "Approved by Finance",
    approver: "Finance",
    blurb: "The formulation costed against today's approved rates, then frozen.",
  },
  {
    key: "squotation",
    label: "Quotation",
    document: "Sales Quotation",
    prefix: "SQ",
    href: "/sales/quotations",
    permission: "squote:read",
    gate: "Accepted by the customer",
    blurb: "The offer. Carries its cost so a discount shows what it cost us.",
  },
  {
    key: "sorder",
    label: "Order",
    document: "Sales Order",
    prefix: "SO",
    href: "/sales/orders",
    permission: "so:read",
    gate: "Confirmed within the customer's credit limit",
    approver: "Finance",
    blurb: "The commitment, against the customer's own purchase order number.",
  },
  {
    key: "allocation",
    label: "Allocation",
    document: "Stock Allocation",
    prefix: "B",
    href: "/sales/orders",
    permission: "so:read",
    gate: "Enough available stock reserved",
    approver: "Stores",
    blurb: "Batches reserved for this order and no longer freely available.",
  },
  {
    key: "dispatch",
    label: "Despatch",
    document: "Delivery Challan",
    prefix: "DC",
    href: "/sales/dispatch",
    permission: "dispatch:read",
    gate: "Packed and gone out on a vehicle",
    approver: "Stores",
    blurb: "What physically left, batch by batch, on which lorry.",
  },
  {
    key: "packinglist",
    label: "Packing list",
    document: "Packing List",
    prefix: "PKL",
    href: "/sales/packing-lists",
    permission: "dispatch:read",
    gate: "All challan lines packed into packages",
    approver: "Stores",
    blurb: "Package-by-package breakdown of packages, tare, and gross weights.",
  },
  {
    key: "invoice",
    label: "Invoice",
    document: "Sales Invoice",
    prefix: "INV",
    href: "/sales/invoices",
    permission: "invoice:read",
    approver: "Finance",
    blurb: "Raised against the challan. Carries what is still owed on it.",
  },
  {
    key: "sreturn",
    label: "Return",
    document: "Sales Return",
    prefix: "SRN",
    href: "/sales/returns",
    permission: "sreturn:read",
    approver: "Stores",
    branch: "reject",
    blurb: "Material back from the customer, inspected before it counts as stock again.",
  },
];

export const CHAINS: Record<ChainId, Stage[]> = {
  procurement: PROCUREMENT_CHAIN,
  sales: SALES_CHAIN,
};

export const STAGE_BY_KEY = Object.fromEntries(
  [...PROCUREMENT_CHAIN, ...SALES_CHAIN].map((s) => [s.key, s]),
) as Record<StageKey, Stage>;

/** The linear trunk of a chain — everything that is not an alternative outcome. */
export const trunkOf = (chain: Stage[]) => chain.filter((s) => !s.branch);
export const branchesOf = (chain: Stage[]) => chain.filter((s) => s.branch);
