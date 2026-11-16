/**
 * Twelve months of coherent operating history for the dashboard to read.
 *
 * One imagined mid-size compounding plant, held consistent end to end: the
 * orders drive the dispatches, the dispatches drive the invoices and the
 * finished-goods consumption, and that consumption drives what gets bought.
 * A handful of deliberate misses are planted — a challan nobody invoiced, a
 * receipt with no bill, a rejection with no VRN — because the dashboard exists
 * to surface exactly those, and an empty exception list proves nothing.
 *
 * Additive only. Refuses to run if any customer exists, so it never lands on
 * top of real or hand-entered data. Users must already exist (`npm run db:seed`).
 */
import {
  PrismaClient,

  Role,
  AccountType,
  WarehouseKind,
  Industry,
  CustomerStatus,
  ProjectStage,
  ProjectPriority,
  DocumentType,
  MaterialCategory,
  ItemType,
  PriceStatus,
  PoStatus,
  GrnStatus,
  QcResult,
  BatchStatus,
  MovementKind,
  SalesInquiryStatus,
  SalesQuotationStatus,
  SalesOrderStatus,
  ChallanStatus,
  SalesInvoiceStatus,
  VendorBillStatus,
  VendorBillBasis,
  PostingSide,
  PostingSourceType,
  CostSheetStatus,
  RequisitionStatus,
  ApprovalTier,
  PlanningStatus,
  PlanningSource,
  VrnStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 86_400_000;
const NOW = new Date();
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const r2 = (n: number) => Math.round(n * 100) / 100;

// Deterministic, so two runs on two machines draw the same business.
let seed = 0x5eed;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));

const counters = new Map<string, number>();
function code(prefix: string, at: Date, pad = 4) {
  const key = `${prefix}-${at.getFullYear()}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(pad, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The cast
// ─────────────────────────────────────────────────────────────────────────────

type Mat = {
  code: string;
  name: string;
  category: MaterialCategory;
  grade?: string;
  /** Rate a year ago, and the % moves since, oldest first. The last lands in the last 90 days. */
  base: number;
  moves: number[];
  vendor: number;
  reorder: number;
};

const MATERIALS: Mat[] = [
  { code: "RM-0001", name: "PVC resin, K-67", category: MaterialCategory.PVC_RESIN, grade: "K67", base: 88.5, moves: [1.8, 2.4], vendor: 0, reorder: 40000 },
  { code: "RM-0002", name: "DOP plasticiser", category: MaterialCategory.PLASTICISER, grade: "DOP", base: 109, moves: [1.5, 6.1], vendor: 1, reorder: 12000 },
  { code: "RM-0003", name: "DINP plasticiser", category: MaterialCategory.PLASTICISER, grade: "DINP", base: 124, moves: [2.0], vendor: 1, reorder: 4000 },
  { code: "RM-0004", name: "Ca-Zn stabiliser", category: MaterialCategory.STABILISER, grade: "Ca-Zn 402", base: 226, moves: [9.4], vendor: 2, reorder: 2500 },
  { code: "RM-0005", name: "Calcium carbonate", category: MaterialCategory.FILLER, grade: "Coated, 2µ", base: 13.6, moves: [1.2], vendor: 3, reorder: 15000 },
  { code: "RM-0006", name: "Titanium dioxide", category: MaterialCategory.PIGMENT, grade: "Rutile", base: 262, moves: [2.0, 11.2], vendor: 2, reorder: 800 },
  { code: "RM-0007", name: "Pigment, blue", category: MaterialCategory.PIGMENT, grade: "Phthalo", base: 610, moves: [14.0], vendor: 2, reorder: 60 },
  { code: "RM-0008", name: "Processing aid", category: MaterialCategory.PROCESSING_AID, grade: "Acrylic", base: 268, moves: [-3.1], vendor: 4, reorder: 600 },
  { code: "RM-0009", name: "Lubricant, stearic", category: MaterialCategory.LUBRICANT, base: 128, moves: [0.8], vendor: 4, reorder: 500 },
  { code: "RM-0010", name: "Antimony trioxide", category: MaterialCategory.FLAME_RETARDANT, base: 905, moves: [4.0, 7.5], vendor: 3, reorder: 300 },
  { code: "RM-0011", name: "ESBO", category: MaterialCategory.PLASTICISER, base: 138, moves: [1.1], vendor: 1, reorder: 1000 },
];

const VENDORS = [
  { code: "VEN-0101", name: "Reliance Polymers", city: "Hazira", creditDays: 30 },
  { code: "VEN-0102", name: "Western Plasticisers", city: "Vapi", creditDays: 45 },
  { code: "VEN-0103", name: "Baerlocher Additives", city: "Navi Mumbai", creditDays: 45 },
  { code: "VEN-0104", name: "Gujarat Minerals & Chem", city: "Bhavnagar", creditDays: 30 },
  { code: "VEN-0105", name: "Arkema Process Aids", city: "Pune", creditDays: 60 },
];

type Grade = {
  grade: string;
  name: string;
  application: string;
  stage: ProjectStage;
  /** phr by material code, resin = 100. */
  phr: Record<string, number>;
  conversion: number;
  overhead: number;
  margin: number;
  docs: DocumentType[];
  sold: boolean;
};

const ALL_DOCS = [DocumentType.TDS, DocumentType.SDS, DocumentType.COA, DocumentType.ROHS, DocumentType.REACH];

const GRADES: Grade[] = [
  {
    grade: "SP-K67-R", name: "Rigid pipe compound", application: "Rigid PVC pressure pipe", stage: ProjectStage.IN_PRODUCTION,
    phr: { "RM-0001": 100, "RM-0004": 3.5, "RM-0005": 18, "RM-0006": 1.5, "RM-0008": 1.2, "RM-0009": 0.8, "RM-0007": 0.05 },
    conversion: 12.4, overhead: 4, margin: 17, docs: ALL_DOCS, sold: true,
  },
  {
    grade: "SP-F58-C", name: "Cable insulation compound", application: "1.1 kV cable insulation", stage: ProjectStage.IN_PRODUCTION,
    phr: { "RM-0001": 100, "RM-0002": 45, "RM-0003": 10, "RM-0004": 5, "RM-0005": 30, "RM-0011": 3, "RM-0009": 0.5 },
    conversion: 11.2, overhead: 4, margin: 15, docs: ALL_DOCS, sold: true,
  },
  {
    grade: "SP-F70-J", name: "FR cable jacket compound", application: "Flame-retardant cable sheathing", stage: ProjectStage.IN_PRODUCTION,
    phr: { "RM-0001": 100, "RM-0002": 38, "RM-0004": 6, "RM-0005": 25, "RM-0010": 4, "RM-0011": 3, "RM-0009": 0.6 },
    conversion: 13.6, overhead: 4, margin: 19, docs: ALL_DOCS, sold: true,
  },
  {
    grade: "SP-M60-P", name: "Window profile compound", application: "uPVC window profile", stage: ProjectStage.IN_PRODUCTION,
    phr: { "RM-0001": 100, "RM-0004": 4.5, "RM-0005": 8, "RM-0006": 4, "RM-0008": 1.5, "RM-0009": 1 },
    conversion: 14.1, overhead: 4, margin: 18, docs: ALL_DOCS, sold: true,
  },
  {
    grade: "SP-M70-P", name: "Foam profile compound", application: "Foamed skirting profile", stage: ProjectStage.PLANT_TRIAL,
    phr: { "RM-0001": 100, "RM-0004": 4, "RM-0005": 12, "RM-0006": 3, "RM-0008": 6, "RM-0009": 1.2 },
    conversion: 15, overhead: 4, margin: 20,
    docs: [DocumentType.TDS, DocumentType.SDS, DocumentType.ROHS, DocumentType.REACH], sold: false,
  },
  {
    grade: "SP-W62-S", name: "Calendered sheet compound", application: "Rigid calendered sheet", stage: ProjectStage.SAMPLE_WITH_CUSTOMER,
    phr: { "RM-0001": 100, "RM-0004": 3, "RM-0008": 2, "RM-0009": 1, "RM-0006": 2 },
    conversion: 13, overhead: 4, margin: 20,
    docs: [DocumentType.TDS, DocumentType.SDS, DocumentType.COA], sold: false,
  },
  {
    grade: "SP-T44-H", name: "Garden hose compound", application: "Braided garden hose", stage: ProjectStage.FORMULATION,
    phr: { "RM-0001": 100, "RM-0002": 60, "RM-0004": 4, "RM-0005": 20, "RM-0011": 4 },
    conversion: 11, overhead: 4, margin: 18, docs: [DocumentType.TDS], sold: false,
  },
  {
    grade: "SP-L38-F", name: "Footwear sole compound", application: "PVC sandal strap", stage: ProjectStage.LAB_TRIAL,
    phr: { "RM-0001": 100, "RM-0002": 70, "RM-0004": 3, "RM-0005": 15 },
    conversion: 10.5, overhead: 4, margin: 21, docs: [], sold: false,
  },
];

type Cust = {
  name: string;
  city: string;
  industry: Industry;
  grades: string[];
  /** MT a month. */
  scale: number;
  /** Price realised against the cost sheet's rate. Below 1 erodes margin. */
  rate: number;
  creditDays: number;
  creditLimit: number;
  /** Days past due they actually pay. */
  late: number;
  /** Last order this many days ago and none after. */
  dormantSince?: number;
};

const CUSTOMERS: Cust[] = [
  { name: "Aurangabad Cables", city: "Aurangabad", industry: Industry.WIRE_AND_CABLE, grades: ["SP-F58-C", "SP-F70-J"], scale: 42, rate: 0.95, creditDays: 45, creditLimit: 9000000, late: 62 },
  { name: "Deccan Wires", city: "Hyderabad", industry: Industry.WIRE_AND_CABLE, grades: ["SP-F58-C", "SP-F70-J"], scale: 30, rate: 1.04, creditDays: 45, creditLimit: 12000000, late: 4 },
  { name: "Prime Profiles", city: "Pune", industry: Industry.PROFILES, grades: ["SP-M60-P"], scale: 24, rate: 0.955, creditDays: 30, creditLimit: 6500000, late: 18 },
  { name: "Kolhapur Extrusions", city: "Kolhapur", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 22, rate: 1.03, creditDays: 30, creditLimit: 6000000, late: 2 },
  { name: "Nashik Pipes", city: "Nashik", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 16, rate: 1.05, creditDays: 30, creditLimit: 4500000, late: 0 },
  { name: "Gujarat Moulders", city: "Rajkot", industry: Industry.PROFILES, grades: ["SP-M60-P"], scale: 12, rate: 1.0, creditDays: 30, creditLimit: 3500000, late: 9 },
  { name: "Vidarbha Poly", city: "Nagpur", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 10, rate: 1.08, creditDays: 30, creditLimit: 3000000, late: 0 },
  { name: "Sangli Compounds", city: "Sangli", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 7, rate: 1.1, creditDays: 30, creditLimit: 2000000, late: 3 },
  { name: "Ratnagiri Hose", city: "Ratnagiri", industry: Industry.PROFILES, grades: ["SP-M60-P"], scale: 6, rate: 1.06, creditDays: 30, creditLimit: 1800000, late: 5 },
  { name: "Belgaum Fittings", city: "Belgaum", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 6, rate: 0.98, creditDays: 30, creditLimit: 1800000, late: 12 },
  { name: "Surat Sheeting", city: "Surat", industry: Industry.PROFILES, grades: ["SP-M60-P"], scale: 5, rate: 0.99, creditDays: 30, creditLimit: 1200000, late: 75 },
  { name: "Karad Tubes", city: "Karad", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 4, rate: 0.97, creditDays: 30, creditLimit: 1200000, late: 6 },
  { name: "Satara Polymers", city: "Satara", industry: Industry.PIPES_AND_FITTINGS, grades: ["SP-K67-R"], scale: 9, rate: 1.02, creditDays: 30, creditLimit: 2500000, late: 4, dormantSince: 128 },
  { name: "Pune Cable Co", city: "Pune", industry: Industry.WIRE_AND_CABLE, grades: ["SP-F58-C"], scale: 8, rate: 1.01, creditDays: 45, creditLimit: 2500000, late: 6, dormantSince: 104 },
];

// ─────────────────────────────────────────────────────────────────────────────

/** The approved rate for a material on a given day, from its revision history. */
function rateOn(m: Mat, at: Date) {
  // Moves land at evenly spaced points; the last one always inside 90 days.
  let rate = m.base;
  m.moves.forEach((pct, i) => {
    const when = moveDate(m, i);
    if (at >= when) rate = rate * (1 + pct / 100);
  });
  return r2(rate);
}
function moveDate(m: Mat, i: number) {
  const n = m.moves.length;
  return i === n - 1 ? ago(30 + (m.code.charCodeAt(6) % 5) * 11) : ago(330 - (i * 240) / n);
}

function gradeCost(g: Grade, at: Date) {
  const total = Object.values(g.phr).reduce((s, v) => s + v, 0);
  let mat = 0;
  for (const [c, p] of Object.entries(g.phr)) mat += (p / total) * rateOn(MATERIALS.find((m) => m.code === c)!, at);
  return { mat, total };
}

async function main() {
  if ((await prisma.customer.count()) > 0) {
    console.log("Customers already exist — refusing to seed dashboard history on top of real data.");
    return;
  }

  const users = await prisma.user.findMany();
  const byRole = (r: Role) => users.find((u) => u.role === r)?.id;
  const admin = byRole(Role.ADMIN) ?? users[0]?.id;
  if (!admin) throw new Error("No users. Run `npm run db:seed` first.");
  const sales = byRole(Role.SALES) ?? admin;
  const store = byRole(Role.STORE) ?? admin;
  const finance = byRole(Role.FINANCE) ?? admin;
  const purchase = byRole(Role.PURCHASE_EXECUTIVE) ?? admin;
  const pm = byRole(Role.PROJECT_MANAGER) ?? admin;

  // Warehouses and accounts, as the base seeds define them.
  const whs = [
    { code: "WH-STORE", name: "Main Store", kind: WarehouseKind.STORE, location: "Block A" },
    { code: "WH-SHED-B", name: "Shed B", kind: WarehouseKind.STORE, location: "Block B, bulk resin" },
    { code: "WH-REJ", name: "Rejection Warehouse", kind: WarehouseKind.REJECTION, location: "Gate 2, segregated" },
    { code: "WH-FG", name: "Finished Compound", kind: WarehouseKind.STORE, location: "Despatch bay" },
  ];
  for (const w of whs) await prisma.warehouse.upsert({ where: { code: w.code }, update: {}, create: w });
  const wh = Object.fromEntries((await prisma.warehouse.findMany()).map((w) => [w.code, w.id]));

  const accounts = [
    { code: "1000", name: "Inventory", type: AccountType.ASSET },
    { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET },
    { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
    { code: "2100", name: "Output GST Payable", type: AccountType.LIABILITY },
    { code: "4000", name: "Sales Revenue", type: AccountType.REVENUE },
    { code: "5000", name: "Purchases", type: AccountType.EXPENSE },
    { code: "5100", name: "Jobwork Expense", type: AccountType.EXPENSE },
    { code: "5200", name: "Service Expense", type: AccountType.EXPENSE },
    { code: "9000", name: "General", type: AccountType.EXPENSE },
  ];
  for (const a of accounts) await prisma.chartOfAccount.upsert({ where: { code: a.code }, update: {}, create: a });
  const acct = Object.fromEntries((await prisma.chartOfAccount.findMany()).map((a) => [a.code, a.id]));

  // ── Vendors, materials, rate history ──────────────────────────────────────
  console.log("Vendors, materials and rate history…");
  const vendorIds: string[] = [];
  for (const v of VENDORS) {
    const row = await prisma.vendor.upsert({
      where: { code: v.code },
      update: {},
      create: { code: v.code, name: v.name, city: v.city, state: "Maharashtra", creditDays: v.creditDays, rating: 4 },
    });
    vendorIds.push(row.id);
  }

  const matId = new Map<string, string>();
  for (const m of MATERIALS) {
    const current = rateOn(m, NOW);
    const row = await prisma.rawMaterial.upsert({
      where: { code: m.code },
      update: { currentPricePerKg: current },
      create: {
        code: m.code, name: m.name, category: m.category, grade: m.grade,
        reorderLevelKg: m.reorder, reorderQtyKg: m.reorder * 2, leadTimeDays: 10,
        currentPricePerKg: current, currentPriceFrom: moveDate(m, m.moves.length - 1),
      },
    });
    matId.set(m.code, row.id);
    await prisma.vendorMaterial.upsert({
      where: { vendorId_materialId: { vendorId: vendorIds[m.vendor]!, materialId: row.id } },
      update: {},
      create: { vendorId: vendorIds[m.vendor]!, materialId: row.id },
    }).catch(() => undefined);

    // The opening rate and each revision, all approved; every one but the last superseded.
    const points = [{ at: ago(365), rate: m.base, pct: null as number | null }];
    let rate = m.base;
    m.moves.forEach((pct, i) => {
      rate = r2(rate * (1 + pct / 100));
      points.push({ at: moveDate(m, i), rate, pct });
    });
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      const last = i === points.length - 1;
      await prisma.materialPrice.create({
        data: {
          materialId: row.id, vendorId: vendorIds[m.vendor]!, pricePerKg: p.rate, changePct: p.pct,
          status: last ? PriceStatus.APPROVED : PriceStatus.SUPERSEDED,
          effectiveFrom: p.at, effectiveTo: last ? null : points[i + 1]!.at,
          submittedAt: addDays(p.at, -4), approvedAt: addDays(p.at, -1), approvedById: finance, submittedById: admin,
        },
      });
    }
  }

  // ── Grades: projects, formulations, documents, frozen cost sheets ─────────
  console.log("Grades, formulations, documents and cost sheets…");
  type GradeRow = { g: Grade; projectId: string; fgId: string; sell: number; costSheetId: string };
  const grades = new Map<string, GradeRow>();
  let docN = 0;
  for (const [i, g] of GRADES.entries()) {
    const project = await prisma.project.create({
      data: {
        code: `PRJ-${String(i + 1).padStart(4, "0")}`, name: `${g.grade} · ${g.name}`, application: g.application,
        stage: g.stage, priority: g.sold ? ProjectPriority.MODERATE : i % 2 ? ProjectPriority.HIGH : ProjectPriority.CRITICAL,
        managerId: pm, startedAt: ago(g.sold ? 420 : 40 + i * 12), targetDate: g.sold ? null : addDays(NOW, 20 + i * 9),
      },
    });
    const formulation = await prisma.formulation.create({
      data: {
        projectId: project.id,
        lines: { create: Object.entries(g.phr).map(([c, phr], k) => ({ materialId: matId.get(c)!, phr, sequence: k })) },
      },
    });
    for (const t of g.docs) {
      docN++;
      await prisma.document.create({
        data: {
          code: `DOC-${String(docN).padStart(4, "0")}`, title: `${g.grade} ${t}`, type: t,
          fileName: `${g.grade}-${t}.pdf`, issuedOn: ago(60), projectId: project.id, uploadedById: pm,
        },
      });
    }

    // Frozen four months ago, at the rates in force then. Today's rates have moved since.
    const frozenAt = ago(125 + i * 3);
    const { mat, total } = gradeCost(g, frozenAt);
    const sell = r2((mat + g.conversion) * (1 + g.overhead / 100) * (1 + g.margin / 100));
    const cs = await prisma.costSheet.create({
      data: {
        code: code("CS", frozenAt), status: CostSheetStatus.APPROVED, formulationId: formulation.id,
        materialCostPerKg: mat, conversionPerKg: g.conversion, overheadPct: g.overhead, marginPct: g.margin,
        sellingRatePerKg: sell, preparedById: finance, approvedById: admin, approvedAt: frozenAt, createdAt: frozenAt,
        lines: {
          create: Object.entries(g.phr).map(([c, phr], k) => {
            const m = MATERIALS.find((x) => x.code === c)!;
            const rate = rateOn(m, frozenAt);
            return { materialId: matId.get(c)!, lineNo: k + 1, phr, fractionKg: phr / total, ratePerKg: rate, costPerKg: (phr / total) * rate };
          }),
        },
      },
    });

    const fg = await prisma.rawMaterial.create({
      data: { code: `FG-${g.grade.slice(3)}`, name: `${g.grade} ${g.name.toLowerCase()}`, itemType: ItemType.FINISHED_GOOD, category: MaterialCategory.OTHER, grade: g.grade },
    });
    grades.set(g.grade, { g, projectId: project.id, fgId: fg.id, sell, costSheetId: cs.id });
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  const custIds = new Map<string, string>();
  for (const [i, c] of CUSTOMERS.entries()) {
    const row = await prisma.customer.create({
      data: {
        code: `CUST-${String(i + 1).padStart(4, "0")}`, name: c.name, city: c.city, state: "Maharashtra", industry: c.industry,
        status: CustomerStatus.ACTIVE, creditDays: c.creditDays, creditLimit: c.creditLimit, ownerId: sales, createdAt: ago(500),
      },
    });
    custIds.set(c.name, row.id);
  }
  // Trial grades belong to a customer too.
  await prisma.project.update({ where: { id: grades.get("SP-M70-P")!.projectId }, data: { customerId: custIds.get("Prime Profiles") } });
  await prisma.project.update({ where: { id: grades.get("SP-W62-S")!.projectId }, data: { customerId: custIds.get("Surat Sheeting") } });
  await prisma.project.update({ where: { id: grades.get("SP-T44-H")!.projectId }, data: { customerId: custIds.get("Ratnagiri Hose") } });

  // ── Sales history ─────────────────────────────────────────────────────────
  console.log("Twelve months of enquiries, orders, despatches and invoices…");
  /** kg of each grade despatched per month index, to size production and purchasing. */
  const fgMonth = new Map<string, number>();
  const fgBatch = new Map<string, { id: string; rate: number }>();
  let unbilledLeft = 3;
  const outstanding = new Map<string, number>();

  async function fgBatchFor(grade: string, at: Date) {
    const key = `${grade}:${at.getFullYear()}-${at.getMonth()}`;
    const hit = fgBatch.get(key);
    if (hit) return hit;
    const gr = grades.get(grade)!;
    const rate = r2(gradeCost(gr.g, at).mat + gr.g.conversion);
    const b = await prisma.inventoryBatch.create({
      data: {
        batchNo: code("B", at, 5), materialId: gr.fgId, status: BatchStatus.AVAILABLE, receivedQtyKg: 0, availableQtyKg: 0,
        ratePerKg: rate, warehouseId: wh["WH-FG"]!, receivedOn: addDays(at, -2),
      },
    });
    const out = { id: b.id, rate };
    fgBatch.set(key, out);
    return out;
  }

  for (const c of CUSTOMERS) {
    const customerId = custIds.get(c.name)!;
    for (let mo = 11; mo >= 0; mo--) {
      const orders = Math.max(1, Math.round(c.scale / 9));
      for (let k = 0; k < orders; k++) {
        const daysAgo = Math.round(mo * 30.4 + between(0, 29));
        if (daysAgo < 1) continue;
        if (c.dormantSince && daysAgo < c.dormantSince) continue;
        const orderedOn = ago(daysAgo);
        const grade = c.grades[int(0, c.grades.length - 1)]!;
        const gr = grades.get(grade)!;
        const qty = Math.round((c.scale * 1000 * between(0.7, 1.3)) / orders / 500) * 500;
        const rate = r2(gr.sell * c.rate * between(0.985, 1.015));
        const subtotal = r2(qty * rate);
        const tax = r2(subtotal * 0.18);

        const inquiry = await prisma.salesInquiry.create({
          data: {
            code: code("SI", addDays(orderedOn, -12)), status: SalesInquiryStatus.WON, customerId, projectId: gr.projectId,
            receivedOn: addDays(orderedOn, -12), ownerId: sales,
            lines: { create: [{ lineNo: 1, description: `${grade} ${gr.g.name}`, quantityKg: qty }] },
          },
        });
        const quotation = await prisma.salesQuotation.create({
          data: {
            code: code("SQ", addDays(orderedOn, -8)), status: SalesQuotationStatus.ACCEPTED, inquiryId: inquiry.id, customerId,
            costSheetId: gr.costSheetId, issuedOn: addDays(orderedOn, -8), subtotal, taxAmount: tax, totalValue: subtotal + tax, ownerId: sales,
            lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: subtotal }] },
          },
        });

        // Recent orders are still in the yard: some unallocated, some allocated and waiting.
        const open = daysAgo <= 7;
        const despatched = !open;
        const dispatchedOn = addDays(orderedOn, int(3, 6));
        const fg = await fgBatchFor(grade, dispatchedOn);
        const allocated = open && daysAgo > 3 && rand() > 0.35;

        const so = await prisma.salesOrder.create({
          data: {
            code: code("SO", orderedOn), customerId, quotationId: quotation.id, orderedOn, promisedOn: addDays(orderedOn, 10),
            status: despatched ? SalesOrderStatus.INVOICED : SalesOrderStatus.CONFIRMED,
            subtotal, taxAmount: tax, totalValue: subtotal + tax, raisedById: sales, approvedById: admin, approvedAt: addDays(orderedOn, 0.2),
            lines: {
              create: [{
                projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: subtotal,
                allocatedKg: despatched || allocated ? qty : 0, dispatchedKg: despatched ? qty : 0,
              }],
            },
          },
          include: { lines: true },
        });
        const line = so.lines[0]!;

        await prisma.inventoryBatch.update({
          where: { id: fg.id },
          data: { receivedQtyKg: { increment: qty }, ...(despatched ? {} : { availableQtyKg: { increment: qty } }) },
        });
        const mk = `${grade}:${Math.floor(daysAgo / 30.4)}`;
        fgMonth.set(mk, (fgMonth.get(mk) ?? 0) + qty);

        if (allocated) {
          await prisma.stockAllocation.create({ data: { salesOrderLineId: line.id, batchId: fg.id, quantityKg: qty, allocatedById: store, createdAt: addDays(orderedOn, 1) } });
        }
        if (!despatched) continue;

        // The plant only ever despatches what it made: receipt into FG, issue out.
        await prisma.stockMovement.createMany({
          data: [
            { kind: MovementKind.ADJUSTMENT_POSITIVE, materialId: gr.fgId, batchId: fg.id, quantityKg: qty, ratePerKg: fg.rate, reference: "Production output", occurredAt: addDays(dispatchedOn, -2) },
            { kind: MovementKind.ISSUE_TO_PRODUCTION, materialId: gr.fgId, batchId: fg.id, quantityKg: -qty, ratePerKg: fg.rate, reference: so.code, occurredAt: dispatchedOn },
          ],
        });

        const challan = await prisma.deliveryChallan.create({
          data: {
            code: code("DC", dispatchedOn), status: daysAgo > 12 ? ChallanStatus.DELIVERED : ChallanStatus.DISPATCHED,
            salesOrderId: so.id, customerId, packedOn: addDays(dispatchedOn, -1), dispatchedOn, deliveredOn: daysAgo > 12 ? addDays(dispatchedOn, 2) : null,
            vehicleNo: `MH-${int(10, 50)}-${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}-${int(1000, 9999)}`,
            raisedById: store,
            lines: { create: [{ salesOrderLineId: line.id, batchId: fg.id, lineNo: 1, quantityKg: qty, ratePerKg: rate }] },
          },
        });

        // The miss the whole deck is about: despatched at the gate, never invoiced in the office.
        const recent = daysAgo <= 14 && daysAgo >= 8;
        if (recent && unbilledLeft > 0 && rand() > 0.4) {
          unbilledLeft--;
          await prisma.salesOrder.update({ where: { id: so.id }, data: { status: SalesOrderStatus.DISPATCHED } });
          continue;
        }

        const invoiceDate = addDays(dispatchedOn, int(0, 1));
        const dueOn = addDays(invoiceDate, c.creditDays);
        const total = subtotal + tax;
        const paidOn = addDays(dueOn, c.late + int(-3, 6));
        // The habitually late payer clears half on the due date and the rest when it pleases.
        const halfAt = c.late > 40 ? addDays(dueOn, int(0, 5)) : null;
        let paid = 0;
        const payments: { at: Date; amount: number }[] = [];
        if (paidOn < NOW) { payments.push({ at: paidOn, amount: total }); paid = total; }
        else if (halfAt && halfAt < NOW) { payments.push({ at: halfAt, amount: r2(total / 2) }); paid = r2(total / 2); }

        const status = paid >= total ? SalesInvoiceStatus.PAID : paid > 0 ? SalesInvoiceStatus.PART_PAID : dueOn < NOW ? SalesInvoiceStatus.OVERDUE : SalesInvoiceStatus.RAISED;
        const inv = await prisma.salesInvoice.create({
          data: {
            code: code("INV", invoiceDate), status, salesOrderId: so.id, challanId: challan.id, customerId,
            invoiceDate, dueOn, subtotal, taxAmount: tax, totalValue: total, paidAmount: paid, raisedById: finance, createdAt: invoiceDate,
          },
        });
        for (const p of payments) {
          await prisma.ledgerPosting.createMany({
            data: [
              { accountId: acct["1000"]!, side: PostingSide.DEBIT, amount: p.amount, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: p.at },
              { accountId: acct["1100"]!, side: PostingSide.CREDIT, amount: p.amount, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: p.at },
            ],
          });
        }
        outstanding.set(customerId, (outstanding.get(customerId) ?? 0) + total - paid);
      }
    }
  }
  for (const [id, amt] of outstanding) await prisma.customer.update({ where: { id }, data: { outstandingAmt: r2(amt) } });

  // Enquiries that did not become orders. The trial-stage leak sits in the last quarter:
  // quotes are going out at the usual rate and coming back rejected far more often.
  console.log("Lost and open enquiries…");
  const active = CUSTOMERS.filter((c) => !c.dormantSince);
  for (let i = 0; i < 150; i++) {
    const c = active[int(0, active.length - 1)]!;
    const customerId = custIds.get(c.name)!;
    const daysAgo = int(2, 270);
    const recentQ = daysAgo <= 90;
    const at = ago(daysAgo);
    const grade = c.grades[0]!;
    const gr = grades.get(grade)!;
    const qty = Math.round((c.scale * 1000 * between(0.5, 1.2)) / 500) * 500;
    const quoted = rand() < (recentQ ? 0.62 : 0.58);
    const status = quoted ? SalesInquiryStatus.QUOTED : daysAgo < 12 ? SalesInquiryStatus.OPEN : SalesInquiryStatus.LOST;
    const inq = await prisma.salesInquiry.create({
      data: {
        code: code("SI", at), status, customerId, projectId: gr.projectId, receivedOn: at, ownerId: sales,
        lostReason: status === SalesInquiryStatus.LOST ? "Price" : null,
        lines: { create: [{ lineNo: 1, description: `${grade} ${gr.g.name}`, quantityKg: qty }] },
      },
    });
    if (!quoted) continue;
    // Recent quotes are lost far more often than the trailing rate says they should be.
    const accepted = rand() < (recentQ ? 0.12 : 0.42);
    const issued = addDays(at, 4);
    const rate = r2(gr.sell * c.rate);
    await prisma.salesQuotation.create({
      data: {
        code: code("SQ", issued), inquiryId: inq.id, customerId, costSheetId: gr.costSheetId, issuedOn: issued, ownerId: sales,
        status: accepted ? SalesQuotationStatus.ACCEPTED : daysAgo < 20 ? SalesQuotationStatus.UNDER_NEGOTIATION : rand() > 0.5 ? SalesQuotationStatus.REJECTED : SalesQuotationStatus.EXPIRED,
        subtotal: r2(qty * rate), totalValue: r2(qty * rate * 1.18), taxAmount: r2(qty * rate * 0.18),
        lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: r2(qty * rate) }] },
      },
    });
  }

  // A large forward order or two, so the order book is more than this week's yard.
  for (const [name, grade, qty, days] of [["Deccan Wires", "SP-F70-J", 60000, 5], ["Kolhapur Extrusions", "SP-K67-R", 45000, 3], ["Aurangabad Cables", "SP-F58-C", 52000, 6]] as const) {
    const gr = grades.get(grade)!;
    const c = CUSTOMERS.find((x) => x.name === name)!;
    const rate = r2(gr.sell * c.rate);
    const at = ago(days);
    await prisma.salesOrder.create({
      data: {
        code: code("SO", at), customerId: custIds.get(name)!, orderedOn: at, promisedOn: addDays(NOW, 24), status: SalesOrderStatus.CONFIRMED,
        subtotal: r2(qty * rate), taxAmount: r2(qty * rate * 0.18), totalValue: r2(qty * rate * 1.18), raisedById: sales, approvedById: admin, approvedAt: at,
        lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: r2(qty * rate) }] },
      },
    });
  }

  // ── Purchasing: what production consumed, bought a month at a time ────────
  console.log("Purchase orders, receipts, batches and bills…");
  const rejectedNoVrn = new Set([2, 5]);
  const unbilled = new Set<number>();
  let grnN = 0;
  let pendingLeft = 2;
  for (let mo = 11; mo >= 0; mo--) {
    for (const m of MATERIALS) {
      let need = 0;
      for (const g of GRADES.filter((x) => x.sold)) {
        const kgOut = fgMonth.get(`${g.grade}:${mo}`) ?? 0;
        const { total } = gradeCost(g, NOW);
        need += kgOut * ((g.phr[m.code] ?? 0) / total);
      }
      if (need < 20) continue;
      const qty = Math.ceil((need * 1.06) / 25) * 25;
      const orderedOn = ago(mo * 30.4 + 26 - int(0, 4));
      if (orderedOn > ago(1)) continue;
      const rate = rateOn(m, orderedOn);
      const lineTotal = r2(qty * rate);
      const receivedOn = addDays(orderedOn, int(4, 9));
      const arrived = receivedOn < ago(0.5);
      const vendorId = vendorIds[m.vendor]!;

      const po = await prisma.purchaseOrder.create({
        data: {
          code: code("PO", orderedOn), vendorId, orderedOn, expectedOn: addDays(orderedOn, 7),
          status: arrived ? PoStatus.RECEIVED : PoStatus.APPROVED, approvalTier: lineTotal > 2500000 ? ApprovalTier.MANAGEMENT : ApprovalTier.HEAD,
          subtotal: lineTotal, taxAmount: r2(lineTotal * 0.18), totalValue: r2(lineTotal * 1.18), raisedById: purchase, approvedById: admin, approvedAt: orderedOn,
          lines: { create: [{ materialId: matId.get(m.code)!, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal, receivedKg: arrived ? qty : 0 }] },
        },
        include: { lines: true },
      });
      if (!arrived) continue;
      grnN++;

      // The last few days' receipts are still on the inspection bench.
      const age = (NOW.getTime() - receivedOn.getTime()) / DAY;
      const pendingQc = age < 10 && pendingLeft-- > 0;
      const rejected = !pendingQc && age > 6 && age < 70 && grnN % 9 === 2 ? Math.round(qty * 0.04) : 0;
      const accepted = qty - rejected;

      let batchId: string | undefined;
      if (!pendingQc) {
        // What is left on the shelf depends on age; shelf-limited lines linger.
        const lingering = m.category === MaterialCategory.STABILISER || m.category === MaterialCategory.PIGMENT || m.category === MaterialCategory.FLAME_RETARDANT;
        const remain = age < 30 ? 0.55 : age < 60 ? 0.22 : age < 90 ? 0.08 : lingering && age < 220 ? 0.38 : 0;
        const available = Math.round(accepted * remain);
        const batch = await prisma.inventoryBatch.create({
          data: {
            batchNo: code("B", receivedOn, 5), materialId: matId.get(m.code)!, status: available > 0 ? BatchStatus.AVAILABLE : BatchStatus.CONSUMED,
            receivedQtyKg: accepted, availableQtyKg: available, ratePerKg: rate, warehouseId: m.category === MaterialCategory.PVC_RESIN ? wh["WH-SHED-B"]! : wh["WH-STORE"]!,
            receivedOn, binLocation: `R${int(1, 9)}-${int(1, 20)}`,
          },
        });
        batchId = batch.id;
        await prisma.stockMovement.createMany({
          data: [
            { kind: MovementKind.GRN_RECEIPT, materialId: matId.get(m.code)!, batchId, quantityKg: accepted, ratePerKg: rate, occurredAt: receivedOn },
            ...(accepted - available > 0
              ? [{ kind: MovementKind.ISSUE_TO_PRODUCTION, materialId: matId.get(m.code)!, batchId, quantityKg: -(accepted - available), ratePerKg: rate, occurredAt: new Date(Math.min(addDays(receivedOn, int(6, 24)).getTime(), ago(1).getTime())) }]
              : []),
          ],
        });
      }

      const grn = await prisma.goodsReceipt.create({
        data: {
          code: code("GRN", receivedOn), status: pendingQc ? GrnStatus.PENDING_QC : rejected ? GrnStatus.PARTIALLY_ACCEPTED : GrnStatus.POSTED,
          purchaseOrderId: po.id, vendorId, receivedOn, invoiceNo: `VI/${int(1000, 9999)}`, receivedById: store,
          inspectedById: pendingQc ? null : store, inspectedAt: pendingQc ? null : addDays(receivedOn, 1), postedAt: pendingQc ? null : addDays(receivedOn, 1),
          lines: {
            create: [{
              purchaseOrderLineId: po.lines[0]!.id, lineNo: 1, challanQtyKg: qty, receivedQtyKg: qty, acceptedQtyKg: pendingQc ? 0 : accepted,
              rejectedQtyKg: rejected, qcResult: pendingQc ? QcResult.PENDING : rejected ? QcResult.CONDITIONAL : QcResult.PASS, batchId,
            }],
          },
        },
      });

      if (rejected) {
        if (!rejectedNoVrn.has(grnN % 7)) {
          await prisma.vendorRejectionNote.create({
            data: {
              code: code("VRN", receivedOn), status: VrnStatus.DISPATCHED, goodsReceiptId: grn.id, vendorId, raisedById: purchase,
              approvedById: admin, approvedAt: addDays(receivedOn, 2), dispatchedAt: addDays(receivedOn, 4),
            },
          });
        }
      }

      // Bills. Four receipts in the last three weeks have none — the bill is sitting in someone's drawer.
      if (pendingQc) continue;
      if (age > 5 && age < 24 && unbilled.size < 4 && grnN % 2 === 1) { unbilled.add(grnN); continue; }
      if (age < 3) continue;
      const vend = VENDORS[m.vendor]!;
      const billDate = addDays(receivedOn, int(1, 3));
      const due = addDays(billDate, vend.creditDays);
      const value = r2(accepted * rate * 1.18);
      const paidAt = addDays(due, int(-2, 4));
      const isPaid = paidAt < NOW;
      const bill = await prisma.vendorBill.create({
        data: {
          code: code("VB", billDate), status: isPaid ? VendorBillStatus.PAID : VendorBillStatus.APPROVED, basis: VendorBillBasis.GRN,
          vendorId, purchaseOrderId: po.id, goodsReceiptId: grn.id, billNo: `VI/${int(1000, 9999)}`, billDate, dueOn: due,
          subtotal: r2(accepted * rate), taxAmount: r2(accepted * rate * 0.18), totalValue: value, paidAmount: isPaid ? value : 0, createdById: finance,
        },
      });
      if (isPaid) {
        await prisma.ledgerPosting.createMany({
          data: [
            { accountId: acct["2000"]!, side: PostingSide.DEBIT, amount: value, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: paidAt },
            { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount: value, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: paidAt },
          ],
        });
      }
    }
  }

  // Orders the vendor has not delivered against, past the date they promised.
  for (const [mc, days, qty] of [["RM-0004", 9, 1500], ["RM-0006", 5, 600], ["RM-0002", 12, 8000]] as const) {
    const m = MATERIALS.find((x) => x.code === mc)!;
    const at = ago(days + 8);
    const rate = rateOn(m, at);
    await prisma.purchaseOrder.create({
      data: {
        code: code("PO", at), vendorId: vendorIds[m.vendor]!, orderedOn: at, expectedOn: ago(days), status: PoStatus.APPROVED, approvalTier: ApprovalTier.HEAD,
        subtotal: r2(qty * rate), taxAmount: r2(qty * rate * 0.18), totalValue: r2(qty * rate * 1.18), raisedById: purchase, approvedById: admin, approvedAt: at,
        lines: { create: [{ materialId: matId.get(mc)!, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: r2(qty * rate) }] },
      },
    });
  }

  // Requisitions approved and never turned into an order.
  for (const [mc, days, qty] of [["RM-0007", 8, 120], ["RM-0010", 5, 900], ["RM-0001", 4, 25000], ["RM-0009", 1, 400]] as const) {
    const at = ago(days);
    await prisma.purchaseRequisition.create({
      data: {
        code: code("PR", at), status: RequisitionStatus.APPROVED, purpose: "Production replenishment", requiredBy: addDays(NOW, 6),
        raisedById: store, approvedById: admin, approvedAt: at, createdAt: addDays(at, -1),
        lines: { create: [{ materialId: matId.get(mc)!, lineNo: 1, quantityKg: qty }] },
      },
    });
  }

  // ── Overheads into the ledger, a month at a time ──────────────────────────
  for (let mo = 11; mo >= 0; mo--) {
    const at = ago(mo * 30.4 + 2);
    if (at > NOW) continue;
    for (const [acc, amt] of [["5100", 870000], ["5200", 590000], ["9000", 1290000]] as const) {
      const amount = r2(amt * between(0.9, 1.1));
      await prisma.ledgerPosting.createMany({
        data: [
          { accountId: acct[acc]!, side: PostingSide.DEBIT, amount, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: `JE-${mo}-${acc}`, postedAt: at },
          { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: `JE-${mo}-${acc}`, postedAt: at },
        ],
      });
    }
  }

  // ── Planning: allocations nobody released ─────────────────────────────────
  console.log("Planning work orders…");
  const resinBatches = await prisma.inventoryBatch.findMany({
    where: { status: BatchStatus.AVAILABLE, material: { itemType: ItemType.RAW_MATERIAL } },
    orderBy: { receivedOn: "desc" },
    take: 6,
  });
  const pwo = async (status: PlanningStatus, days: number, grade: string, qty: number, allocs: number, shortage?: string) => {
    const gr = grades.get(grade)!;
    const row = await prisma.planningWorkOrder.create({
      data: {
        code: code("PWO", ago(days)), status, source: PlanningSource.MAKE_TO_ORDER, materialId: gr.fgId, quantityKg: qty,
        requestedById: pm, approvedById: admin, approvedAt: ago(days), createdAt: ago(days), updatedAt: ago(Math.max(1, days - 3)),
      },
    });
    for (const b of resinBatches.splice(0, allocs)) {
      await prisma.planningAllocation.create({
        data: { pwoId: row.id, materialId: b.materialId, batchId: b.id, quantityKg: Math.round(Number(b.availableQtyKg) * 0.4), createdAt: ago(days) },
      });
    }
    if (shortage) {
      await prisma.planningShortage.create({
        data: { pwoId: row.id, materialId: matId.get(shortage)!, requiredQtyKg: 2400, allocatedQtyKg: 900, shortageQtyKg: 1500, createdAt: ago(days) },
      });
    }
  };
  await pwo(PlanningStatus.CANCELLED, 16, "SP-F70-J", 14000, 2);
  await pwo(PlanningStatus.COMPLETED, 22, "SP-K67-R", 20000, 1);
  await pwo(PlanningStatus.IN_PROGRESS, 4, "SP-F58-C", 18000, 1, "RM-0004");
  await pwo(PlanningStatus.APPROVED, 2, "SP-M60-P", 9000, 0, "RM-0006");

  // A cancelled sales order whose allocation was never let go of.
  const fgAny = await prisma.inventoryBatch.findFirst({ where: { material: { itemType: ItemType.FINISHED_GOOD }, availableQtyKg: { gt: 0 } } });
  if (fgAny) {
    const gr = grades.get("SP-K67-R")!;
    const at = ago(11);
    const so = await prisma.salesOrder.create({
      data: {
        code: code("SO", at), customerId: custIds.get("Belgaum Fittings")!, orderedOn: at, status: SalesOrderStatus.CANCELLED, raisedById: sales,
        subtotal: 0, totalValue: 0, remark: "Customer deferred",
        lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: 6000, ratePerKg: gr.sell, lineTotal: r2(6000 * gr.sell), allocatedKg: 6000 }] },
      },
      include: { lines: true },
    });
    await prisma.stockAllocation.create({ data: { salesOrderLineId: so.lines[0]!.id, batchId: fgAny.id, quantityKg: 6000, allocatedById: store, createdAt: addDays(at, 1) } });
  }

  console.log("Dashboard history seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
