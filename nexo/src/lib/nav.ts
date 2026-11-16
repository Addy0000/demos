import { Role } from "@prisma/client";
import { can, type Permission } from "@/lib/rbac";
import { TENANTS, isHidden, type TenantKey } from "@/lib/tenants";

export type NavItem = {
  label: string;
  href: string;
  permission: Permission;
  /** Rendered as a count chip on the rail. Resolved server-side. */
  badge?:
    | "pendingPrices"
    | "pendingGrn"
    | "poApproval"
    | "lowStock"
    | "pendingReq"
    | "openInquiries"
    | "heldRejections"
    | "openSalesInquiries"
    | "pendingCostSheets"
    | "soApproval"
    | "overdueInvoices"
    | "returnsPendingQc"
    | "pendingLeave"
    | "overdueBilling"
    | "activeEngagements";
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * The whole navigation surface. Visibility is derived from the permission on each
 * item, so the rail cannot drift out of step with ROLE_PERMISSIONS.
 */
const GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", permission: "report:read" }],
  },
  {
    label: "Customers",
    items: [
      { label: "All customers", href: "/customers", permission: "customer:read" },
      { label: "Contacts", href: "/customers/contacts", permission: "customer:read" },
      { label: "Activity", href: "/customers/activity", permission: "customer:read" },
    ],
  },
  {
    label: "Engagements",
    items: [
      { label: "Engagements", href: "/engagements", permission: "engagement:read", badge: "activeEngagements" },
      { label: "Plan & timeline", href: "/engagements/timeline", permission: "engagement:read" },
      { label: "Timesheets", href: "/engagements/timesheets", permission: "engagement:read" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Employees", href: "/people", permission: "hr:read" },
      { label: "Attendance", href: "/people/attendance", permission: "hr:read" },
      { label: "Leave", href: "/people/leave", permission: "hr:read", badge: "pendingLeave" },
      { label: "Payroll", href: "/people/payroll", permission: "payroll:read" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Process flow", href: "/sales/flow", permission: "sales:read" },
      { label: "Inquiries", href: "/sales/inquiries", permission: "sales:read", badge: "openSalesInquiries" },
      { label: "Cost sheets", href: "/sales/cost-sheets", permission: "costsheet:read", badge: "pendingCostSheets" },
      { label: "Quotations", href: "/sales/quotations", permission: "squote:read" },
      { label: "Sales orders", href: "/sales/orders", permission: "so:read", badge: "soApproval" },
      { label: "Despatch", href: "/sales/dispatch", permission: "dispatch:read" },
      { label: "Packing lists", href: "/sales/packing-lists", permission: "dispatch:read" },
      { label: "Invoices", href: "/sales/invoices", permission: "invoice:read", badge: "overdueInvoices" },
      { label: "Credit notes", href: "/sales/credit-notes", permission: "invoice:read" },
      { label: "Returns", href: "/sales/returns", permission: "sreturn:read", badge: "returnsPendingQc" },
    ],
  },
  {
    label: "Projects",
    items: [
      { label: "All projects", href: "/projects", permission: "project:read" },
      { label: "Formulations", href: "/projects/formulations", permission: "project:read" },
      { label: "Documents", href: "/documents", permission: "document:read" },
      { label: "Samples & demos", href: "/projects/demos", permission: "demo:read" },
    ],
  },
  {
    label: "Item Management",
    items: [
      { label: "Item master", href: "/items", permission: "project:read" },
      { label: "Standard BOMs", href: "/items/standard", permission: "project:read" },
      { label: "Order BOMs", href: "/items/order", permission: "project:read" },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Work orders", href: "/planning", permission: "project:read" },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Console dashboard", href: "/production", permission: "project:read" },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Price approvals", href: "/finance/approvals", permission: "price:approve", badge: "pendingPrices" },
      { label: "Material prices", href: "/finance/prices", permission: "price:read" },
      { label: "Price history", href: "/finance/history", permission: "price:read" },
      { label: "Compound costing", href: "/finance/costing", permission: "price:read" },
      { label: "Accounts payable", href: "/finance/payable", permission: "invoice:read" },
      { label: "Debit notes", href: "/purchase/debit-notes", permission: "invoice:read" },
      { label: "Accounts receivable", href: "/finance/receivable", permission: "payment:receive" },
      { label: "Billing & collections", href: "/billing", permission: "billing:read", badge: "overdueBilling" },
      { label: "Journal Vouchers", href: "/finance/journal", permission: "journal:read" },
    ],
  },
  {
    label: "Procurement",
    items: [
      // The flow map sits first deliberately: it is the only screen that shows
      // the stages as one chain rather than as seven unrelated lists.
      { label: "Process flow", href: "/procurement/flow", permission: "po:read" },
      { label: "Requisitions", href: "/procurement/requisitions", permission: "req:read", badge: "pendingReq" },
      { label: "Inquiries", href: "/procurement/inquiries", permission: "inquiry:read", badge: "openInquiries" },
      { label: "Order approvals", href: "/procurement/approvals", permission: "po:approve", badge: "poApproval" },
      { label: "Purchase orders", href: "/procurement/orders", permission: "po:read" },
      { label: "Goods receipts", href: "/procurement/grn", permission: "grn:read", badge: "pendingGrn" },
      { label: "Rejection notes", href: "/procurement/rejections", permission: "vrn:read", badge: "heldRejections" },
      { label: "Debit notes", href: "/purchase/debit-notes", permission: "po:read" },
      { label: "Inventory", href: "/procurement/inventory", permission: "inventory:read", badge: "lowStock" },
      { label: "Stock ledger", href: "/procurement/ledger", permission: "inventory:read" },
      { label: "Raw materials", href: "/procurement/materials", permission: "material:read" },
      { label: "Vendors", href: "/procurement/vendors", permission: "vendor:read" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users & roles", href: "/admin/users", permission: "admin:users" },
      { label: "Settings", href: "/admin/settings", permission: "admin:settings" },
    ],
  },
];

/** The vendor's keyhole — a deliberately different, much smaller rail. */
const VENDOR_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", permission: "price:read" }],
  },
  {
    label: "Pricing",
    items: [
      { label: "My price list", href: "/vendor/prices", permission: "price:read" },
      { label: "Submissions", href: "/vendor/submissions", permission: "price:submit" },
    ],
  },
  {
    label: "Orders",
    items: [
      { label: "Inquiries to you", href: "/procurement/inquiries", permission: "inquiry:read" },
      { label: "Purchase orders", href: "/vendor/orders", permission: "po:read" },
    ],
  },
];

/** Group order per kind of business: a services firm leads with its clients and people. */
const SERVICE_ORDER = ["Overview", "Customers", "Engagements", "People", "Finance", "Procurement", "Projects", "Administration"];

export function navForRole(role: Role, tenantKey: TenantKey): NavGroup[] {
  const tenant = TENANTS[tenantKey];
  const source = role === Role.VENDOR ? VENDOR_GROUPS : GROUPS;
  const groups = source
    .map((g) => ({
      label: tenant.labels[`group:${g.label}`] ?? g.label,
      key: g.label,
      items: g.items
        .filter((i) => can(role, i.permission) && !isHidden(tenant, i.href))
        .map((i) => ({ ...i, label: tenant.labels[i.href] ?? i.label })),
    }))
    .filter((g) => g.items.length > 0);
  if (tenant.kind === "services") {
    groups.sort((x, y) => SERVICE_ORDER.indexOf(x.key) - SERVICE_ORDER.indexOf(y.key));
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

/** Flat list for the command palette's navigation section. */
export function navTargets(role: Role, tenantKey: TenantKey): { label: string; href: string; group: string }[] {
  return navForRole(role, tenantKey).flatMap((g) =>
    g.items.map((i) => ({ label: i.label, href: i.href, group: g.label })),
  );
}
