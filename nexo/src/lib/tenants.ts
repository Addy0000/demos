/**
 * The companies this instance runs. One application, one database, and one
 * Postgres schema per company: their records never share a table.
 *
 * Everything that makes a company feel like its own system lives here: name and
 * mark, default theme, which modules it uses and what it calls them, its demo
 * accounts, and which guided tour it gets. Pure data, safe on client and server.
 */

export type TenantKey = "tangent" | "duplast" | "trident" | "raj" | "harvest" | "meridian" | "kestrel" | "loomcraft";
export type ThemeKey =
  | "teal" | "cobalt" | "forge" | "indigo" | "graphite" | "sand"
  | "saffron" | "moss" | "crimson" | "plum" | "ocean" | "mono";
export type StyleKey = "classic" | "compact" | "soft" | "editorial";
export type ModeKey = "light" | "dark" | "system";
export type DemoAccount = readonly [email: string, role: string, scope: string];

export type Tenant = {
  key: TenantKey;
  name: string;
  short: string;
  industry: string;
  focus: string;
  complexity: "High" | "Medium" | "To be assessed";
  /** Named prospects first; industry demos show a use case on synthetic data. */
  group: "prospect" | "industry";
  /** A line under the name on a letterhead. */
  descriptor: string;
  region: string;
  kind: "manufacturing" | "services";
  /** What the company calls the thing it sells, where the screens name it. */
  noun: { one: string; many: string };
  theme: ThemeKey;
  /** How dense, round and typographic the screens are, until the user picks another. */
  style: StyleKey;
  demoPassword: string;
  demoAccounts: readonly DemoAccount[];
  /** Nav labels this company calls by another name, keyed by href. */
  labels: Record<string, string>;
  /** Screens this company does not use, by href prefix. */
  hidden: string[];
  /** Headline facts for the company picker. */
  highlights: string[];
};

const MANUFACTURING_HIDDEN = ["/people", "/engagements", "/billing"];
const SERVICES_HIDDEN = [
  "/sales", "/projects/formulations", "/projects/demos", "/items", "/planning", "/production",
  "/procurement/requisitions", "/procurement/inquiries", "/procurement/approvals", "/procurement/grn",
  "/procurement/rejections", "/procurement/inventory", "/procurement/ledger", "/procurement/materials",
  "/procurement/flow", "/procurement/orders", "/purchase/debit-notes", "/finance/approvals", "/finance/prices", "/finance/history",
  "/finance/costing", "/finance/receivable", "/projects",
];

export const TENANTS: Record<TenantKey, Tenant> = {
  tangent: {
    key: "tangent",
    group: "prospect",
    name: "Tangent Chemicals",
    short: "Tangent",
    industry: "Chemical manufacturing",
    focus: "General ERP",
    complexity: "To be assessed",
    descriptor: "Speciality additives for PVC: stabilisers, lubricants and plasticisers",
    region: "Gujarat",
    kind: "manufacturing",
    noun: { one: "Grade", many: "grades" },
    theme: "teal",
    style: "classic",
    demoPassword: "Tangent@2026",
    demoAccounts: [
      ["admin@tangent.demo", "Administrator", "Everything, plus users and roles"],
      ["md@tangent.demo", "Managing Director", "Reads all; approves orders above ₹25 lakh"],
      ["sales@tangent.demo", "Sales", "Customers, inquiries, quotations, orders"],
      ["finance@tangent.demo", "Finance", "Price approvals, invoicing, receivables, journals"],
      ["purchasehead@tangent.demo", "Purchase Head", "Approves orders up to ₹25 lakh; owns vendors"],
      ["purchase@tangent.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@tangent.demo", "Stores & QC", "GRN, QC, despatch, inventory"],
      ["rnd@tangent.demo", "R&D", "Product development, TDS/SDS, customer samples"],
      ["vendor.oleo@tangent.demo", "Vendor: Gujarat Oleochem", "Its own price list and orders only"],
    ],
    labels: { "/finance/costing": "Grade costing" },
    hidden: MANUFACTURING_HIDDEN,
    highlights: ["Ca-Zn one-packs, lubricants, ESO", "14 customers across 4 states", "Quote to cash, batch-traceable"],
  },
  duplast: {
    key: "duplast",
    group: "prospect",
    name: "Duplast",
    short: "Duplast",
    industry: "Chemical & polymer manufacturing",
    focus: "Customisable multi-tenant ERP, open-ended architecture",
    complexity: "High",
    descriptor: "PVC additives, stabilisers, plasticisers and related products",
    region: "Vapi and Silvassa",
    kind: "manufacturing",
    noun: { one: "Grade", many: "grades" },
    theme: "cobalt",
    style: "classic",
    demoPassword: "Duplast@2026",
    demoAccounts: [
      ["admin@duplast.demo", "Administrator", "Users, roles, configuration"],
      ["ceo@duplast.demo", "CEO", "Reads all; approves escalations"],
      ["sales@duplast.demo", "Sales", "Customers, inquiries, quotations, orders"],
      ["finance@duplast.demo", "Finance", "Price approvals, invoicing, receivables, journals"],
      ["purchasehead@duplast.demo", "Purchase Head", "Approves orders up to ₹25 lakh; owns vendors"],
      ["purchase@duplast.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@duplast.demo", "Stores & QC", "Both plants: GRN, QC, despatch"],
      ["technical@duplast.demo", "Technical Services", "Product development, TDS/SDS, trials"],
    ],
    labels: { "/finance/costing": "Grade costing" },
    hidden: MANUFACTURING_HIDDEN,
    highlights: ["Plasticisers and stabilisers, two plants", "Configurable per company: modules, labels, theme", "High complexity, built to extend"],
  },
  trident: {
    key: "trident",
    group: "prospect",
    name: "Trident Fasteners",
    short: "Trident",
    industry: "Industrial manufacturing: nuts and bolts",
    focus: "General ERP",
    complexity: "To be assessed",
    descriptor: "High-tensile bolts, nuts, studs and washers",
    region: "Ludhiana",
    kind: "manufacturing",
    noun: { one: "Part", many: "parts" },
    theme: "forge",
    style: "classic",
    demoPassword: "Trident@2026",
    demoAccounts: [
      ["admin@trident.demo", "Administrator", "Everything, plus users and roles"],
      ["director@trident.demo", "Director", "Reads all; approves orders above ₹25 lakh"],
      ["sales@trident.demo", "Sales", "OEM and distributor orders"],
      ["finance@trident.demo", "Finance", "Wire-rod price approvals, invoicing, journals"],
      ["purchasehead@trident.demo", "Purchase Head", "Wire rod and plating contracts"],
      ["purchase@trident.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@trident.demo", "Stores & QC", "Heat-lot traceability, despatch"],
      ["engineering@trident.demo", "Engineering", "New part development, PPAP, drawings"],
    ],
    labels: {
      "/projects": "New part development",
      "/projects/formulations": "Part specifications",
      "/documents": "Drawings & PPAP",
      "/projects/demos": "Samples & PPAP",
      "/finance/costing": "Part costing",
      "/items": "Part master",
      "group:Projects": "Engineering",
      "group:Item Management": "Parts & BOMs",
    },
    hidden: MANUFACTURING_HIDDEN,
    highlights: ["Hex bolts, nuts, studs: 8.8 to 12.9", "Auto OEM, infra and distributor customers", "Heat-lot traceable from wire rod to box"],
  },
  raj: {
    key: "raj",
    group: "prospect",
    name: "Raj Enterprises",
    short: "Raj",
    industry: "Pharma & FMCG service provider",
    focus: "ERP, HRMS, project planning; client and service-provider management",
    complexity: "High",
    descriptor: "Validation, compliance and facility services for pharma and FMCG",
    region: "Mumbai and Ahmedabad",
    kind: "services",
    noun: { one: "Service", many: "services" },
    theme: "indigo",
    style: "classic",
    demoPassword: "Raj@2026",
    demoAccounts: [
      ["admin@raj.demo", "Administrator", "Everything, plus users and roles"],
      ["director@raj.demo", "Director", "Reads all: clients, delivery, people, money"],
      ["pmo@raj.demo", "Project Manager", "Engagements, task plans, timesheets"],
      ["hr@raj.demo", "Human Resources", "Employees, attendance, leave, payroll"],
      ["finance@raj.demo", "Finance", "Billing, collections, payables, payroll cost"],
      ["bd@raj.demo", "Business Development", "Clients, contacts, proposals"],
    ],
    labels: {
      "/customers": "All clients",
      "/procurement/vendors": "Service providers",
      "/finance/payable": "Provider bills",
      "group:Customers": "Clients",
      "group:Procurement": "Service providers",
      "group:Projects": "Records",
    },
    hidden: SERVICES_HIDDEN,
    highlights: ["About 50 staff on client sites", "Engagements planned to the task", "HRMS: attendance, leave, payroll"],
  },
  harvest: {
    key: "harvest",
    group: "industry",
    name: "Harvest Grove Foods",
    short: "Harvest Grove",
    industry: "Food & beverage manufacturing",
    focus: "Batch production with shelf life, FSSAI records, distributor and modern-trade orders",
    complexity: "Medium",
    descriptor: "Spice blends, instant mixes and snack seasonings, packed to a best-before date",
    region: "Nashik",
    kind: "manufacturing",
    noun: { one: "SKU", many: "SKUs" },
    theme: "saffron",
    style: "soft",
    demoPassword: "Harvest@2026",
    demoAccounts: [
      ["admin@harvest.demo", "Administrator", "Everything, plus users and roles"],
      ["md@harvest.demo", "Managing Director", "Reads all; approves orders above ₹25 lakh"],
      ["sales@harvest.demo", "Sales", "Distributors, modern trade, private label"],
      ["finance@harvest.demo", "Finance", "Price approvals, invoicing, receivables, journals"],
      ["purchasehead@harvest.demo", "Purchase Head", "Spices, oils and packaging contracts"],
      ["purchase@harvest.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@harvest.demo", "Stores & QC", "Moisture and micro checks, first-expiry-first-out despatch"],
      ["npd@harvest.demo", "Product Development", "Recipes, shelf-life trials, FSSAI dossiers"],
    ],
    labels: {
      "/projects": "New product development",
      "/projects/formulations": "Recipes",
      "/documents": "FSSAI & lab reports",
      "/projects/demos": "Trial batches & samples",
      "/finance/costing": "Recipe costing",
      "/items": "SKU master",
      "group:Projects": "Product development",
      "group:Item Management": "SKUs & recipes",
    },
    hidden: MANUFACTURING_HIDDEN,
    highlights: ["Masalas, instant mixes, seasonings", "Batch and best-before on every carton", "Distributors and modern trade in 5 states"],
  },
  meridian: {
    key: "meridian",
    group: "industry",
    name: "Meridian Wholesale",
    short: "Meridian",
    industry: "Distribution & trading: staples and edible oils",
    focus: "Buy in bulk, repack, resell across branches; credit control and margin by line",
    complexity: "Medium",
    descriptor: "Rice, pulses, sugar and edible oils, bought in bulk and repacked for retail and HoReCa",
    region: "Pune and Hyderabad",
    kind: "manufacturing",
    noun: { one: "Product", many: "products" },
    theme: "moss",
    style: "compact",
    demoPassword: "Meridian@2026",
    demoAccounts: [
      ["admin@meridian.demo", "Administrator", "Everything, plus users and roles"],
      ["owner@meridian.demo", "Proprietor", "Reads all; approves orders above ₹25 lakh"],
      ["sales@meridian.demo", "Sales", "Retailers, HoReCa and institutional buyers"],
      ["finance@meridian.demo", "Finance", "Credit control, invoicing, collections, journals"],
      ["purchasehead@meridian.demo", "Purchase Head", "Mill and refinery contracts"],
      ["purchase@meridian.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@meridian.demo", "Godown & QC", "Receiving, repacking, despatch by route"],
    ],
    labels: {
      "/items": "Catalogue",
      "/procurement/materials": "Bulk stock",
      "/planning": "Repacking plan",
      "/production": "Repacking floor",
      "/finance/costing": "Landed cost & margin",
      "/sales/cost-sheets": "Margin sheets",
      "group:Item Management": "Catalogue",
      "group:Production": "Repacking",
      "group:Planning": "Repacking plan",
      "group:Projects": "Records",
    },
    hidden: [...MANUFACTURING_HIDDEN, "/projects"],
    highlights: ["Staples and oils, bulk to 1 kg packs", "Retail, HoReCa and institutions", "Credit limits enforced at the order"],
  },
  kestrel: {
    key: "kestrel",
    group: "industry",
    name: "Kestrel Projects",
    short: "Kestrel",
    industry: "EPC & engineering projects",
    focus: "Site projects billed by milestone, subcontractors, site crews on timesheets and payroll",
    complexity: "High",
    descriptor: "Electrical, mechanical and utility installations for factories and warehouses",
    region: "Chennai and Bengaluru",
    kind: "services",
    noun: { one: "Service", many: "services" },
    theme: "crimson",
    style: "compact",
    demoPassword: "Kestrel@2026",
    demoAccounts: [
      ["admin@kestrel.demo", "Administrator", "Everything, plus users and roles"],
      ["director@kestrel.demo", "Director", "Reads all: projects, crews, money"],
      ["pm@kestrel.demo", "Project Manager", "Projects, task plans, site timesheets"],
      ["hr@kestrel.demo", "Human Resources", "Crews, attendance, leave, payroll"],
      ["finance@kestrel.demo", "Finance", "RA bills, collections, subcontractor bills"],
      ["bd@kestrel.demo", "Business Development", "Clients, tenders, proposals"],
    ],
    labels: {
      "/customers": "All clients",
      "/engagements": "Projects",
      "/engagements/timeline": "Project schedule",
      "/engagements/timesheets": "Site timesheets",
      "/procurement/vendors": "Subcontractors",
      "/finance/payable": "Subcontractor bills",
      "/billing": "RA bills",
      "/people": "Crews & staff",
      "group:Customers": "Clients",
      "group:Engagements": "Projects",
      "group:Procurement": "Subcontractors",
      "group:Projects": "Records",
    },
    hidden: SERVICES_HIDDEN,
    highlights: ["Factory electrical and utility EPC", "Milestone RA bills per project", "Site crews on timesheets and payroll"],
  },
  loomcraft: {
    key: "loomcraft",
    group: "industry",
    name: "Loomcraft Textiles",
    short: "Loomcraft",
    industry: "Textiles: yarn, fabric and processing",
    focus: "Yarn to greige to dyed fabric, job work at outside units, export orders",
    complexity: "Medium",
    descriptor: "Cotton and poly-cotton yarn, greige and dyed fabric for garment exporters",
    region: "Tiruppur and Surat",
    kind: "manufacturing",
    noun: { one: "Quality", many: "qualities" },
    theme: "plum",
    style: "editorial",
    demoPassword: "Loomcraft@2026",
    demoAccounts: [
      ["admin@loomcraft.demo", "Administrator", "Everything, plus users and roles"],
      ["md@loomcraft.demo", "Managing Director", "Reads all; approves orders above ₹25 lakh"],
      ["sales@loomcraft.demo", "Sales", "Garment exporters and domestic converters"],
      ["finance@loomcraft.demo", "Finance", "Cotton price approvals, invoicing, journals"],
      ["purchasehead@loomcraft.demo", "Purchase Head", "Cotton, polyester and dyes"],
      ["purchase@loomcraft.demo", "Purchase Executive", "Raises orders and GRN; cannot approve"],
      ["stores@loomcraft.demo", "Stores & QC", "Count, strength and shade checks"],
      ["design@loomcraft.demo", "Design & Sampling", "Constructions, lab dips, buyer approvals"],
    ],
    labels: {
      "/projects": "Sampling & development",
      "/projects/formulations": "Constructions",
      "/documents": "Test reports & certificates",
      "/projects/demos": "Lab dips & samples",
      "/finance/costing": "Fabric costing",
      "/items": "Quality master",
      "/procurement/materials": "Fibre, yarn & dyes",
      "group:Projects": "Design & sampling",
      "group:Item Management": "Qualities",
    },
    hidden: MANUFACTURING_HIDDEN,
    highlights: ["Ring-spun yarn, greige and dyed fabric", "Job work at outside dye houses", "Lot and shade traceable to the bale"],
  },
};

export const TENANT_ORDER: TenantKey[] = ["trident", "raj", "tangent", "duplast", "harvest", "meridian", "kestrel", "loomcraft"];
export const TENANT_COOKIE = "tenant";
export const DEFAULT_TENANT: TenantKey = "tangent";

export function tenantOf(key: string | undefined | null): TenantKey | null {
  return key && key in TENANTS ? (key as TenantKey) : null;
}

export function isHidden(t: Tenant, href: string): boolean {
  return t.hidden.some((h) => href === h || href.startsWith(h + "/"));
}

// ── Themes ────────────────────────────────────────────────────────────────

export const THEMES: { key: ThemeKey; name: string; swatch: [string, string, string] }[] = [
  { key: "teal", name: "Teal", swatch: ["#263537", "#248375", "#EDEDED"] },
  { key: "cobalt", name: "Cobalt", swatch: ["#13233A", "#1F5FAF", "#ECEFF3"] },
  { key: "forge", name: "Forge", swatch: ["#25282C", "#B4501C", "#EEEDEB"] },
  { key: "indigo", name: "Indigo", swatch: ["#221C33", "#5B3E96", "#EFEDF3"] },
  { key: "graphite", name: "Graphite", swatch: ["#2A2C2E", "#3B5B7A", "#EDEEEF"] },
  { key: "sand", name: "Sandstone", swatch: ["#36302A", "#8A5A1F", "#F0ECE6"] },
  { key: "saffron", name: "Saffron", swatch: ["#2E2018", "#B4461B", "#F3EEE8"] },
  { key: "moss", name: "Moss", swatch: ["#1F2A20", "#4B6B2A", "#ECEFE8"] },
  { key: "crimson", name: "Crimson", swatch: ["#1E2027", "#A8283E", "#EEEDEF"] },
  { key: "plum", name: "Plum", swatch: ["#26182A", "#7E2F6B", "#F1ECF0"] },
  { key: "ocean", name: "Ocean", swatch: ["#0F2229", "#0F6E83", "#E9F0F1"] },
  { key: "mono", name: "Ink", swatch: ["#151515", "#2B2B2B", "#F2F2F2"] },
];

export const STYLES: { key: StyleKey; name: string; note: string }[] = [
  { key: "classic", name: "Classic", note: "Balanced" },
  { key: "compact", name: "Compact", note: "Dense lists" },
  { key: "soft", name: "Soft", note: "Round, roomy" },
  { key: "editorial", name: "Editorial", note: "Serif, hairlines" },
];
export const styleCookie = (t: TenantKey) => `style_${t}`;
export function styleOf(v: string | undefined, fallback: StyleKey): StyleKey {
  return STYLES.some((s) => s.key === v) ? (v as StyleKey) : fallback;
}
export const MODES: { key: ModeKey; name: string }[] = [
  { key: "light", name: "Light" },
  { key: "dark", name: "Dark" },
  { key: "system", name: "System" },
];
export const themeCookie = (t: TenantKey) => `theme_${t}`;
export const MODE_COOKIE = "mode";

export function themeOf(v: string | undefined, fallback: ThemeKey): ThemeKey {
  return THEMES.some((t) => t.key === v) ? (v as ThemeKey) : fallback;
}
export function modeOf(v: string | undefined): ModeKey {
  return v === "dark" || v === "system" ? v : "light";
}
