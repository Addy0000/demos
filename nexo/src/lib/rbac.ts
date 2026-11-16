import { Role } from "@prisma/client";

/**
 * Permission matrix.
 *
 * Two rules govern this file:
 *  1. UI visibility is derived from permissions — never hand-maintained alongside them.
 *  2. A permission is necessary but not sufficient for the VENDOR role. Vendor requests
 *     must ALSO pass through `vendorScope()` at the query level, because "can read prices"
 *     must never mean "can read every vendor's prices".
 */
export const PERMISSIONS = [
  "customer:read", "customer:write", "customer:delete",
  "project:read", "project:write",
  "document:read", "document:write",
  "demo:read", "demo:write",
  "material:read", "material:write",
  "price:read", "price:submit", "price:approve",
  "sales:read", "sales:write",
  "squote:read", "squote:write",
  "costsheet:read", "costsheet:write", "costsheet:approve",
  "so:read", "so:write", "so:approve",
  "allocate:write",
  "dispatch:read", "dispatch:write",
  "invoice:read", "invoice:write",
  "payment:receive",
  "sreturn:read", "sreturn:write", "sreturn:qc",
  "vendor:read", "vendor:write",
  "req:read", "req:write", "req:approve",
  "inquiry:read", "inquiry:write",
  "quote:read", "quote:write", "quote:select",
  "po:read", "po:write", "po:approve",
  "grn:read", "grn:write", "grn:qc",
  "vrn:read", "vrn:write", "vrn:approve",
  "inventory:read", "inventory:adjust",
  "journal:read", "journal:write", "journal:reverse",
  "cash:read", "cash:write", "cash:reverse",
  "report:read",
  "admin:users", "admin:settings",
  "hr:read", "hr:write", "payroll:read",
  "engagement:read", "engagement:write",
  "billing:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,

  /**
   * Director / CEO. Reads everything including margin and costing, approves what
   * escalates past the Purchase Head, and enters nothing — leadership sitting in
   * the data-entry path muddies the audit trail rather than strengthening it.
   */
  MANAGEMENT: [
    "hr:read", "payroll:read", "engagement:read", "billing:read",
    "customer:read",
    "project:read",
    "document:read",
    "demo:read",
    "material:read",
    "price:read", "price:approve",
    "vendor:read",
    "req:read", "req:approve",
    "inquiry:read",
    "quote:read",
    "po:read", "po:approve",
    "grn:read",
    "vrn:read", "vrn:approve",
    "sales:read",
    "squote:read",
    "costsheet:read", "costsheet:approve",
    "so:read", "so:approve",
    "dispatch:read",
    "invoice:read",
    "sreturn:read",
    "inventory:read",
    "journal:read",
    "cash:read",
    "report:read",
  ],

  /**
   * Sales owns the pipeline from inquiry to order, and raises despatch paperwork.
   *
   * Two things it deliberately does not hold: `costsheet:approve`, because the
   * person selling should not sign off the margin they are selling at, and
   * `so:approve`, because confirming an order commits stock and credit.
   */
  SALES: [
    "engagement:read", "billing:read",
    "customer:read", "customer:write",
    "project:read",
    "document:read",
    "demo:read",
    "material:read",
    "sales:read", "sales:write",
    "squote:read", "squote:write",
    "costsheet:read", "costsheet:write",
    "so:read", "so:write",
    "dispatch:read",
    "invoice:read",
    "sreturn:read", "sreturn:write",
    "inventory:read",
    "report:read",
  ],

  PROJECT_MANAGER: [
    "engagement:read", "engagement:write", "hr:read",
    "customer:read",
    "project:read", "project:write",
    "document:read", "document:write",
    "demo:read", "demo:write",
    "material:read",
    "price:read",
    // Its compound is what is being quoted and sold, so it reads the cost sheet
    // and the demand against it. It does not price or confirm.
    "sales:read",
    "squote:read",
    "costsheet:read",
    "so:read",
    "sreturn:read",
    "inventory:read",
    "report:read",
  ],

  /**
   * Finance owns the rate base and payables. It does NOT approve purchase orders —
   * that authority moved to the purchase hierarchy so the person who commits the
   * spend is not the person who validates the cost.
   */
  FINANCE: [
    "hr:read", "payroll:read", "engagement:read", "billing:read",
    "customer:read",
    "project:read",
    "material:read", "material:write",
    "price:read", "price:approve",
    "vendor:read",
    "req:read",
    "inquiry:read",
    "quote:read",
    "po:read",
    "grn:read",
    "vrn:read",
    // Finance owns the margin: it approves the cost sheet a quotation is built on,
    // and it raises and tracks the invoice. It does not sell and does not despatch.
    "sales:read",
    "squote:read",
    "costsheet:read", "costsheet:approve",
    "so:read", "so:approve",
    "dispatch:read",
    "invoice:read", "invoice:write",
    "payment:receive",
    "sreturn:read",
    "inventory:read",
    "journal:read", "journal:write", "journal:reverse",
    "cash:read", "cash:write", "cash:reverse",
    "document:read",
    "report:read",
  ],

  /** Raises orders and chases delivery. Cannot approve its own work. */
  PURCHASE_EXECUTIVE: [
    "material:read",
    "price:read",
    "vendor:read",
    "req:read", "req:write",
    "inquiry:read", "inquiry:write",
    "quote:read", "quote:write",
    "po:read", "po:write",
    "grn:read", "grn:write",
    "vrn:read", "vrn:write",
    "inventory:read",
    "project:read",
    "document:read",
    "report:read",
  ],

  /** Approves up to APPROVAL_LIMITS.PURCHASE_HEAD, and owns the vendor master. */
  PURCHASE_HEAD: [
    "material:read", "material:write",
    "price:read",
    "vendor:read", "vendor:write",
    "req:read", "req:write", "req:approve",
    "inquiry:read", "inquiry:write",
    "quote:read", "quote:write", "quote:select",
    "po:read", "po:write", "po:approve",
    "grn:read", "grn:write",
    "vrn:read", "vrn:write", "vrn:approve",
    "inventory:read",
    "project:read",
    "document:read",
    "report:read",
  ],

  /**
   * Stores raises the rejection note — they are the ones holding the material
   * that failed — but cannot approve its despatch. Same separation as the
   * purchase line: the person who finds the problem is not the person who
   * commits the company to a debit against the vendor.
   */
  STORE: [
    "material:read",
    "req:read", "req:write",
    "grn:read", "grn:write", "grn:qc",
    "vrn:read", "vrn:write",
    "inventory:read", "inventory:adjust",
    "po:read",
    "document:read",
    // Stores allocates stock, packs and despatches it, and inspects what comes
    // back from a customer — the same bench that inspects inward material.
    "so:read",
    "allocate:write",
    "dispatch:read", "dispatch:write",
    "sreturn:read", "sreturn:write", "sreturn:qc",
  ],

  // The keyhole. Reads and submits prices — for its own vendor record only,
  // enforced by vendorScope() below, not by this list.
  VENDOR: [
    "price:read", "price:submit",
    "material:read",
    // Its own inquiries and its own quotations — the scoping, not this list, is
    // what stops it seeing a competitor's price on the same inquiry.
    "inquiry:read",
    "quote:read", "quote:write",
    "po:read",
    "document:read",
  ],

  /** People operations: the employee record, attendance, leave and payroll. */
  HR: [
    "customer:read",
    "document:read",
    "hr:read", "hr:write", "payroll:read",
    "engagement:read",
    "report:read",
  ],
};

/**
 * Purchase approval authority, in rupees.
 *
 * This is what separates Purchase Executive, Purchase Head and Management — the
 * permission list alone would make Head and Management identical. A role absent
 * from this map cannot approve any order, whatever `po:approve` says.
 *
 * Change these to match your delegation-of-authority policy. The tier is stamped
 * onto each order when it is raised, so revising a limit re-routes future orders
 * without silently re-opening ones already decided.
 */
export const APPROVAL_LIMITS: Partial<Record<Role, number>> = {
  // ₹25 lakh. Calibrated to this business: resin moves by the tonne, so orders run
  // ₹2.5 lakh to ₹2.3 crore against a ₹32 lakh median. A lower ceiling would
  // escalate almost everything and make the Head's authority nominal.
  PURCHASE_HEAD: 25_00_000,
  MANAGEMENT: Number.POSITIVE_INFINITY,
  ADMIN: Number.POSITIVE_INFINITY,
};

export type ApprovalTierName = "HEAD" | "MANAGEMENT";

/** Which level an order of this value must reach. */
export function tierForValue(value: number): ApprovalTierName {
  const headLimit = APPROVAL_LIMITS.PURCHASE_HEAD ?? 0;
  return value <= headLimit ? "HEAD" : "MANAGEMENT";
}

/** Can this role sign off an order of this value? */
export function canApproveValue(role: Role | undefined | null, value: number): boolean {
  if (!role || !can(role, "po:approve")) return false;
  const limit = APPROVAL_LIMITS[role];
  if (limit === undefined) return false;
  return value <= limit;
}

/** The rupee ceiling for this role, or null if it has no approval authority. */
export function approvalLimit(role: Role | undefined | null): number | null {
  if (!role) return null;
  const limit = APPROVAL_LIMITS[role];
  return limit === undefined ? null : limit;
}

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/**
 * The data-layer half of vendor isolation. Every query that a VENDOR user can reach
 * must spread this into its `where`. Returning an impossible filter for a vendor user
 * with no vendorId is deliberate: fail closed, never open.
 */
export function vendorScope(
  session: { role: Role; vendorId?: string | null } | null | undefined,
): { vendorId?: string } {
  if (!session) return { vendorId: "__no_session__" };
  if (session.role !== Role.VENDOR) return {};
  return { vendorId: session.vendorId ?? "__unassigned_vendor__" };
}

export function isVendor(role: Role | undefined | null): boolean {
  return role === Role.VENDOR;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGEMENT: "Management",
  SALES: "Sales",
  PROJECT_MANAGER: "Project Manager",
  FINANCE: "Finance",
  PURCHASE_EXECUTIVE: "Purchase Executive",
  PURCHASE_HEAD: "Purchase Head",
  STORE: "Stores",
  VENDOR: "Vendor",
  HR: "Human Resources",
};
