/**
 * The manufacturing demo engine.
 *
 * Twelve months of coherent history for one manufacturer, held consistent end
 * to end: orders drive despatches, despatches drive invoices and consumption,
 * consumption drives purchasing. The usual misses are planted (a challan nobody
 * invoiced, a receipt with no bill, a rejection without a VRN) because the
 * dashboard exists to surface them, and every screen the guided tour visits has
 * data. Ledger postings follow the app's own rules, so the books balance.
 *
 * Everything company-specific comes in through a World: its people, materials,
 * vendors, products, customers and the handful of planted situations.
 */
import {
  PrismaClient, Role, AccountType, WarehouseKind, Industry, CustomerStatus, ProjectStage, ProjectPriority,
  DocumentType, MaterialCategory, ItemType, PriceStatus, PoStatus, GrnStatus, QcResult, BatchStatus, MovementKind,
  SalesInquiryStatus, SalesQuotationStatus, SalesOrderStatus, ChallanStatus, SalesInvoiceStatus, VendorBillStatus,
  VendorBillBasis, PostingSide, PostingSourceType, CostSheetStatus, RequisitionStatus, ApprovalTier, PlanningStatus,
  PlanningSource, VrnStatus, ActivityKind, DemoStatus, InquiryStatus, QuotationStatus, SalesReturnStatus,
  ReturnResolution, PackingListStatus, BomStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

export const DAY = 86_400_000;
export const NOW = new Date();
export const YEAR = NOW.getFullYear();
export const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const r2 = (n: number) => Math.round(n * 100) / 100;

export function rng(seed: number) {
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (a: number, b: number) => a + rand() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));
  const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)]!;
  return { rand, between, int, pick };
}

export function codes() {
  const counters = new Map<string, number>();
  return (prefix: string, at: Date, pad = 4) => {
    const key = `${prefix}-${at.getFullYear()}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return `${key}-${String(n).padStart(pad, "0")}`;
  };
}

export const STATE_CODE: Record<string, string> = {
  Gujarat: "24", Maharashtra: "27", "Madhya Pradesh": "23", Rajasthan: "08", "Dadra and Nagar Haveli": "26",
  Punjab: "03", Haryana: "06", Delhi: "07", "Uttar Pradesh": "09", "Tamil Nadu": "33", Karnataka: "29", Telangana: "36",
  "Himachal Pradesh": "02", Uttarakhand: "05", "West Bengal": "19", Kerala: "32", Chhattisgarh: "22", Jharkhand: "20", Goa: "30",
};
export const gstinFor = (state: string, i: number) =>
  `${STATE_CODE[state] ?? "24"}AAAC${String.fromCharCode(65 + (i % 26))}${String(1000 + i * 37).slice(-4)}${String.fromCharCode(65 + ((i * 7) % 26))}1Z${i % 10}`;

export type Staff = { email: string; name: string; role: Role; jobTitle: string };

export type Mat = {
  code: string; name: string; category: MaterialCategory; grade?: string; cas?: string; hsn?: string; hazardous?: boolean;
  base: number; moves: number[]; vendor: number; reorder: number; warehouse: string;
};
export type Vend = { code: string; name: string; city: string; state: string; creditDays: number; contact: string; rating: number };
export type Pack = { unit: number; perPack: number; tare: number; packageType: string; remark: string };
export type Grade = {
  grade: string; name: string; application: string; stage: ProjectStage; parts: Record<string, number>;
  conversion: number; overhead: number; margin: number; docs: DocumentType[]; sold: boolean; pack: Pack;
  category: MaterialCategory; hsn: string; fgWarehouse?: string;
};
export type Cust = {
  name: string; city: string; state: string; industry: Industry; grades: string[]; scale: number; rate: number;
  creditDays: number; creditLimit: number; late: number; dormantSince?: number; contacts: [string, string][];
};

export type World = {
  label: string;
  seed: number;
  password: string;
  staff: Staff[];
  vendorUsers: { email: string; name: string; vendor: number }[];
  warehouses: { code: string; name: string; kind: WarehouseKind; location: string }[];
  materials: Mat[];
  vendors: Vend[];
  grades: Grade[];
  customers: Cust[];
  vehicle: string;
  outputRef: string;
  qcRemarks: string[];
  lostReasons: string[];
  testReportTitle: string;
  priceSubmissions: [string, number, number][];
  pendingCostSheet: string;
  devFor: [string, string][];
  demos: [string, string, DemoStatus, number, string | null, number][];
  activities: { customer: string; kind: ActivityKind; subject: string; days: number; by: "sales" | "rnd" }[];
  forwardOrders: [string, string, number, number, SalesOrderStatus][];
  overduePOs: [string, number, number, PoStatus][];
  requisitions: [string, number, number, RequisitionStatus][];
  rfqs: { mc: string; qty: number; days: number; status: InquiryStatus; vendors: [number, number, number | null][]; terms: string }[];
  returns: { restockGrade: string; restockReason: string; qcRemark: string; pendingGrade: string; pendingReason: string; returnQty: number; pendingQty: number };
  pwos: [PlanningStatus, number, string, number, number, [string, number, number]?][];
  jvs: { days: number; remark: string; lines: [string, PostingSide, number][] }[];
  overheads: [string, number][];
  orderDivisor: number;
};

export const ACCOUNTS = [
  // The app posts receipts and payments to 1000 and input GST to 1500.
  { code: "1000", name: "Bank / Cash: current account", type: AccountType.ASSET },
  { code: "1050", name: "Inventory", type: AccountType.ASSET },
  { code: "1100", name: "Accounts Receivable", type: AccountType.ASSET },
  { code: "1300", name: "Prepaid Expenses", type: AccountType.ASSET },
  { code: "1500", name: "Input GST Receivable", type: AccountType.ASSET },
  { code: "1600", name: "Plant & Machinery", type: AccountType.ASSET },
  { code: "1610", name: "Accumulated Depreciation", type: AccountType.ASSET },
  { code: "2000", name: "Accounts Payable", type: AccountType.LIABILITY },
  { code: "2100", name: "Output GST Payable", type: AccountType.LIABILITY },
  { code: "2200", name: "Accrued Expenses", type: AccountType.LIABILITY },
  { code: "2300", name: "Salaries Payable", type: AccountType.LIABILITY },
  { code: "2310", name: "Statutory Dues (PF, ESI, PT, TDS)", type: AccountType.LIABILITY },
  { code: "4000", name: "Sales Revenue", type: AccountType.REVENUE },
  { code: "4100", name: "Service Revenue", type: AccountType.REVENUE },
  { code: "5000", name: "Purchases", type: AccountType.EXPENSE },
  { code: "5100", name: "Jobwork Expense", type: AccountType.EXPENSE },
  { code: "5200", name: "Service Expense", type: AccountType.EXPENSE },
  { code: "5300", name: "Depreciation", type: AccountType.EXPENSE },
  { code: "5400", name: "Power & Fuel", type: AccountType.EXPENSE },
  { code: "5500", name: "Insurance", type: AccountType.EXPENSE },
  { code: "5600", name: "Freight Outward", type: AccountType.EXPENSE },
  { code: "5700", name: "Salaries & Wages", type: AccountType.EXPENSE },
  { code: "5800", name: "Subcontracted Services", type: AccountType.EXPENSE },
  { code: "5900", name: "Travel & Site Expenses", type: AccountType.EXPENSE },
  { code: "9000", name: "General", type: AccountType.EXPENSE },
];

export async function seedAccounts(prisma: PrismaClient) {
  for (const a of ACCOUNTS) await prisma.chartOfAccount.upsert({ where: { code: a.code }, update: {}, create: a });
  return Object.fromEntries((await prisma.chartOfAccount.findMany()).map((a) => [a.code, a.id])) as Record<string, string>;
}

export async function seedJournalVouchers(prisma: PrismaClient, acct: Record<string, string>, jvs: World["jvs"]) {
  let n = 0;
  for (const jv of jvs) {
    n++;
    const voucherNo = `JV-${YEAR}-${String(n).padStart(4, "0")}`;
    await prisma.ledgerPosting.createMany({
      data: jv.lines.map(([a, side, amount]) => ({
        accountId: acct[a]!, side, amount, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: voucherNo, voucherNo, remark: jv.remark, postedAt: ago(jv.days),
      })),
    });
  }
  await prisma.voucherSequence.upsert({ where: { series_year: { series: "JV", year: YEAR } }, update: { lastNo: n }, create: { series: "JV", year: YEAR, lastNo: n } });
}

export async function seedManufacturing(prisma: PrismaClient, w: World) {
  const { rand, between, int, pick } = rng(w.seed);
  const code = codes();
  const vehicle = () =>
    `${w.vehicle}-${String(int(1, 39)).padStart(2, "0")}-${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}-${int(1000, 9999)}`;
  const mat = (c: string) => w.materials.find((m) => m.code === c)!;
  const rateOn = (m: Mat, at: Date) => {
    let rate = m.base;
    m.moves.forEach((pct, i) => {
      if (at >= moveDate(m, i)) rate = rate * (1 + pct / 100);
    });
    return r2(rate);
  };
  function moveDate(m: Mat, i: number) {
    const n = m.moves.length;
    return i === n - 1 ? ago(30 + (m.code.charCodeAt(6) % 5) * 11) : ago(330 - (i * 240) / n);
  }
  const gradeCost = (g: Grade, at: Date) => {
    const total = Object.values(g.parts).reduce((s, v) => s + v, 0);
    let m = 0;
    for (const [c, p] of Object.entries(g.parts)) m += (p / total) * rateOn(mat(c), at);
    return { mat: m, total };
  };

  // ── Accounts ──────────────────────────────────────────────────────────────
  console.log(`  ${w.label}: team accounts…`);
  const passwordHash = await bcrypt.hash(w.password, 10);
  const userId: Partial<Record<Role, string>> = {};
  for (const s of w.staff) {
    const u = await prisma.user.upsert({
      where: { email: s.email },
      update: { name: s.name, role: s.role, jobTitle: s.jobTitle, passwordHash, isVerified: true, isActive: true },
      create: { ...s, passwordHash, isVerified: true, isActive: true },
    });
    userId[s.role] ??= u.id;
  }
  const md = userId[Role.MANAGEMENT]!;
  const purchaseHead = userId[Role.PURCHASE_HEAD]!;
  const purchase = userId[Role.PURCHASE_EXECUTIVE]!;
  const finance = userId[Role.FINANCE]!;
  const store = userId[Role.STORE]!;
  const rnd = userId[Role.PROJECT_MANAGER]!;
  const sales = userId[Role.SALES]!;

  for (const x of w.warehouses) await prisma.warehouse.upsert({ where: { code: x.code }, update: {}, create: x });
  const wh = Object.fromEntries((await prisma.warehouse.findMany()).map((x) => [x.code, x.id])) as Record<string, string>;
  const acct = await seedAccounts(prisma);

  // ── Vendors, materials, rate history ──────────────────────────────────────
  console.log(`  ${w.label}: vendors, materials and rate history…`);
  const vendorIds: string[] = [];
  for (const [i, v] of w.vendors.entries()) {
    const row = await prisma.vendor.create({
      data: {
        code: v.code, name: v.name, legalName: `${v.name} Pvt Ltd`, city: v.city, state: v.state, creditDays: v.creditDays,
        paymentTerms: `${v.creditDays} days from invoice`, rating: v.rating, contactName: v.contact,
        contactEmail: `sales@${v.name.toLowerCase().replace(/[^a-z]+/g, "")}.demo`, contactPhone: `+91 9${int(100000000, 999999999)}`,
        gstin: gstinFor(v.state, i + 40),
      },
    });
    vendorIds.push(row.id);
  }
  const vendorUsers: string[] = [];
  for (const vu of w.vendorUsers) {
    const u = await prisma.user.upsert({
      where: { email: vu.email },
      update: {},
      create: { email: vu.email, name: vu.name, role: Role.VENDOR, jobTitle: "Vendor portal", passwordHash, isVerified: true, isActive: true, vendorId: vendorIds[vu.vendor]! },
    });
    vendorUsers.push(u.id);
  }

  const matId = new Map<string, string>();
  for (const m of w.materials) {
    const row = await prisma.rawMaterial.create({
      data: {
        code: m.code, name: m.name, category: m.category, grade: m.grade, casNumber: m.cas, hsnCode: m.hsn, isHazardous: !!m.hazardous,
        reorderLevelKg: m.reorder, reorderQtyKg: m.reorder * 2, leadTimeDays: 10,
        currentPricePerKg: rateOn(m, NOW), currentPriceFrom: moveDate(m, m.moves.length - 1),
      },
    });
    matId.set(m.code, row.id);
    await prisma.vendorMaterial.create({ data: { vendorId: vendorIds[m.vendor]!, materialId: row.id } }).catch(() => undefined);
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
          status: last ? PriceStatus.APPROVED : PriceStatus.SUPERSEDED, effectiveFrom: p.at, effectiveTo: last ? null : points[i + 1]!.at,
          submittedAt: addDays(p.at, -4), approvedAt: addDays(p.at, -1), approvedById: finance, submittedById: purchase,
        },
      });
    }
  }
  for (const [mc, pct, by] of w.priceSubmissions) {
    const m = mat(mc);
    await prisma.materialPrice.create({
      data: {
        materialId: matId.get(mc)!, vendorId: vendorIds[m.vendor]!, pricePerKg: r2(rateOn(m, NOW) * (1 + pct / 100)), changePct: pct,
        status: PriceStatus.PENDING_APPROVAL, effectiveFrom: addDays(NOW, 7), submittedAt: ago(2), submittedById: vendorUsers[by] ?? purchase,
      },
    });
  }

  // ── Products ──────────────────────────────────────────────────────────────
  console.log(`  ${w.label}: products, specifications, documents and cost sheets…`);
  type GradeRow = { g: Grade; projectId: string; formulationId: string; fgId: string; sell: number; costSheetId: string | null };
  const grades = new Map<string, GradeRow>();
  let docN = 0;
  for (const [i, g] of w.grades.entries()) {
    const project = await prisma.project.create({
      data: {
        code: `PRJ-${String(i + 1).padStart(4, "0")}`, name: `${g.grade} · ${g.name}`, application: g.application,
        stage: g.stage, priority: g.sold ? ProjectPriority.MODERATE : i % 2 ? ProjectPriority.HIGH : ProjectPriority.CRITICAL,
        managerId: rnd, startedAt: ago(g.sold ? 420 : 40 + i * 12), targetDate: g.sold ? null : addDays(NOW, 20 + i * 9),
      },
    });
    const formulation = await prisma.formulation.create({
      data: { projectId: project.id, lines: { create: Object.entries(g.parts).map(([c, phr], k) => ({ materialId: matId.get(c)!, phr, sequence: k })) } },
    });
    for (const t of g.docs) {
      docN++;
      await prisma.document.create({
        data: {
          code: `DOC-${String(docN).padStart(4, "0")}`, title: `${g.grade} ${t === DocumentType.TEST_REPORT ? w.testReportTitle : t === DocumentType.DRAWING ? "drawing" : t === DocumentType.SPEC_SHEET ? "control plan" : t}`, type: t,
          fileName: `${g.grade.replace(/\s+/g, "-")}-${t}.pdf`, issuedOn: ago(60 + i * 4),
          expiresOn: t === DocumentType.ROHS || t === DocumentType.REACH ? addDays(ago(60 + i * 4), i === 1 ? 50 : 365) : null,
          projectId: project.id, uploadedById: rnd,
        },
      });
    }
    const fg = await prisma.rawMaterial.create({
      data: { code: `FG-${g.grade.replace(/^[A-Z]+-/, "").replace(/[^A-Za-z0-9]+/g, "")}`, name: `${g.grade} ${g.name}`, itemType: ItemType.FINISHED_GOOD, category: g.category, grade: g.grade, hsnCode: g.hsn },
    });
    let costSheetId: string | null = null;
    let sell = 0;
    if (g.sold) {
      const frozenAt = ago(125 + i * 3);
      const { mat: mc, total } = gradeCost(g, frozenAt);
      sell = r2((mc + g.conversion) * (1 + g.overhead / 100) * (1 + g.margin / 100));
      const cs = await prisma.costSheet.create({
        data: {
          code: code("CS", frozenAt), status: CostSheetStatus.APPROVED, formulationId: formulation.id,
          materialCostPerKg: mc, conversionPerKg: g.conversion, overheadPct: g.overhead, marginPct: g.margin,
          sellingRatePerKg: sell, preparedById: sales, approvedById: finance, approvedAt: frozenAt, createdAt: frozenAt,
          lines: {
            create: Object.entries(g.parts).map(([c, phr], k) => {
              const rate = rateOn(mat(c), frozenAt);
              return { materialId: matId.get(c)!, lineNo: k + 1, phr, fractionKg: phr / total, ratePerKg: rate, costPerKg: (phr / total) * rate };
            }),
          },
        },
      });
      costSheetId = cs.id;
      await prisma.standardBom.create({
        data: {
          code: `BOM-STD-${String(i + 1).padStart(4, "0")}`, status: BomStatus.APPROVED, materialId: fg.id, requestedById: rnd, approvedById: md, approvedAt: ago(400),
          lines: { create: Object.entries(g.parts).map(([c, p], k) => ({ materialId: matId.get(c)!, lineNo: k + 1, quantityKg: r2((p / total) * 1000) })) },
        },
      });
    }
    grades.set(g.grade, { g, projectId: project.id, formulationId: formulation.id, fgId: fg.id, sell, costSheetId });
  }
  {
    const gr = grades.get(w.pendingCostSheet)!;
    const { mat: mc, total } = gradeCost(gr.g, NOW);
    await prisma.costSheet.create({
      data: {
        code: code("CS", ago(1)), status: CostSheetStatus.PENDING_APPROVAL, formulationId: gr.formulationId,
        materialCostPerKg: mc, conversionPerKg: gr.g.conversion, overheadPct: gr.g.overhead, marginPct: gr.g.margin,
        sellingRatePerKg: r2((mc + gr.g.conversion) * (1 + gr.g.overhead / 100) * (1 + gr.g.margin / 100)), preparedById: sales, createdAt: ago(1),
        lines: {
          create: Object.entries(gr.g.parts).map(([c, phr], k) => {
            const rate = rateOn(mat(c), NOW);
            return { materialId: matId.get(c)!, lineNo: k + 1, phr, fractionKg: phr / total, ratePerKg: rate, costPerKg: (phr / total) * rate };
          }),
        },
      },
    });
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  console.log(`  ${w.label}: customers, contacts and activity…`);
  const custIds = new Map<string, string>();
  for (const [i, c] of w.customers.entries()) {
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, "");
    const row = await prisma.customer.create({
      data: {
        code: `CUST-${String(i + 1).padStart(4, "0")}`, name: c.name, legalName: `${c.name} Pvt Ltd`, city: c.city, state: c.state,
        industry: c.industry, status: c.dormantSince ? CustomerStatus.DORMANT : CustomerStatus.ACTIVE,
        gstin: gstinFor(c.state, i + 1), addressLine1: `Plot ${int(10, 480)}, Industrial Estate`, pincode: String(int(110000, 560099)),
        creditDays: c.creditDays, creditLimit: c.creditLimit, paymentTerms: `${c.creditDays} days from invoice`, ownerId: sales, createdAt: ago(500),
        contacts: {
          create: c.contacts.map(([name, role], k) => ({
            name, role, isPrimary: k === 0, email: `${name.split(" ")[0]!.toLowerCase()}@${slug}.demo`, phone: `+91 9${int(100000000, 999999999)}`,
          })),
        },
      },
    });
    custIds.set(c.name, row.id);
    const acts: [ActivityKind, string, number][] = [
      [ActivityKind.MEETING, `Plant visit: reviewed ${c.grades[0]} performance on their line`, int(40, 120)],
      [ActivityKind.CALL, "Monthly schedule and delivery slots agreed", int(8, 30)],
      [ActivityKind.QUOTE_SENT, `Revised price for ${c.grades[0]} after raw material increase`, int(3, 20)],
    ];
    if (c.late > 40) acts.push([ActivityKind.CALL, "Followed up on overdue invoices; part payment promised", int(1, 6)]);
    for (const [kind, subject, d] of acts) {
      await prisma.customerActivity.create({ data: { customerId: row.id, kind, subject, occurredAt: ago(d), userId: sales } });
    }
  }
  for (const a of w.activities) {
    await prisma.customerActivity.create({
      data: { customerId: custIds.get(a.customer)!, kind: a.kind, subject: a.subject, occurredAt: ago(a.days), userId: a.by === "rnd" ? rnd : sales },
    });
  }
  for (const [grade, cust] of w.devFor) await prisma.project.update({ where: { id: grades.get(grade)!.projectId }, data: { customerId: custIds.get(cust) } });
  for (const [n, [grade, title, status, d, feedback, qty]] of w.demos.entries()) {
    await prisma.productDemo.create({
      data: {
        code: `DEMO-${String(n + 1).padStart(5, "0")}`, projectId: grades.get(grade)!.projectId, title, status,
        batchRef: `LAB-${YEAR}-${String(31 + n * 7).padStart(3, "0")}`, quantityKg: qty,
        dispatchedOn: status === DemoStatus.IN_LAB ? null : ago(d), courierRef: status === DemoStatus.IN_LAB ? null : `DTDC ${int(10000000, 99999999)}`,
        feedbackOn: feedback ? ago(Math.max(1, d - 10)) : null, feedback,
      },
    });
  }

  // ── Sales history ─────────────────────────────────────────────────────────
  console.log(`  ${w.label}: twelve months of orders, despatches and invoices…`);
  const fgMonth = new Map<string, number>();
  const fgBatch = new Map<string, { id: string; rate: number }>();
  let unbilledLeft = 2;
  const outstanding = new Map<string, number>();
  type Billed = { soId: string; lineId: string; projectId: string; customerId: string; invoiceId: string; rate: number; grade: string; at: Date };
  const billed: Billed[] = [];
  const shipped: { challanId: string; lineId: string; qty: number; pack: Pack; at: Date }[] = [];

  async function fgBatchFor(grade: string, at: Date) {
    const key = `${grade}:${at.getFullYear()}-${at.getMonth()}`;
    const hit = fgBatch.get(key);
    if (hit) return hit;
    const gr = grades.get(grade)!;
    const rate = r2(gradeCost(gr.g, at).mat + gr.g.conversion);
    const b = await prisma.inventoryBatch.create({
      data: {
        batchNo: code("B", at, 5), materialId: gr.fgId, status: BatchStatus.AVAILABLE, receivedQtyKg: 0, availableQtyKg: 0,
        ratePerKg: rate, warehouseId: wh[gr.g.fgWarehouse ?? "WH-FG"]!, receivedOn: addDays(at, -2),
      },
    });
    const out = { id: b.id, rate };
    fgBatch.set(key, out);
    return out;
  }

  for (const c of w.customers) {
    const customerId = custIds.get(c.name)!;
    for (let mo = 11; mo >= 0; mo--) {
      const orders = Math.max(1, Math.round(c.scale / w.orderDivisor));
      for (let k = 0; k < orders; k++) {
        const daysAgo = Math.round(mo * 30.4 + between(0, 29));
        if (daysAgo < 1) continue;
        if (c.dormantSince && daysAgo < c.dormantSince) continue;
        const orderedOn = ago(daysAgo);
        const grade = c.grades[int(0, c.grades.length - 1)]!;
        const gr = grades.get(grade)!;
        const unit = gr.g.pack.unit;
        const qty = Math.max(unit * 20, Math.round((c.scale * 1000 * between(0.7, 1.3)) / orders / (unit * 10)) * unit * 10);
        const rate = r2(gr.sell * c.rate * between(0.985, 1.015));
        const subtotal = r2(qty * rate);
        const tax = r2(subtotal * 0.18);

        const inquiry = await prisma.salesInquiry.create({
          data: {
            code: code("INQ", addDays(orderedOn, -12)), status: SalesInquiryStatus.WON, customerId, projectId: gr.projectId, receivedOn: addDays(orderedOn, -12), ownerId: sales,
            lines: { create: [{ lineNo: 1, description: `${grade} ${gr.g.name}`, quantityKg: qty }] },
          },
        });
        const quotation = await prisma.salesQuotation.create({
          data: {
            code: code("SQ", addDays(orderedOn, -8)), status: SalesQuotationStatus.ACCEPTED, inquiryId: inquiry.id, customerId, costSheetId: gr.costSheetId,
            issuedOn: addDays(orderedOn, -8), validUntil: addDays(orderedOn, 22), subtotal, taxAmount: tax, totalValue: subtotal + tax, ownerId: sales,
            lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: subtotal }] },
          },
        });
        const open = daysAgo <= 7;
        const despatched = !open;
        const dispatchedOn = addDays(orderedOn, int(3, 6));
        const fg = await fgBatchFor(grade, dispatchedOn);
        const allocated = open && daysAgo > 3 && rand() > 0.35;
        const so = await prisma.salesOrder.create({
          data: {
            code: code("SO", orderedOn), customerId, quotationId: quotation.id, orderedOn, promisedOn: addDays(orderedOn, 10),
            status: despatched ? SalesOrderStatus.INVOICED : SalesOrderStatus.CONFIRMED, subtotal, taxAmount: tax, totalValue: subtotal + tax,
            raisedById: sales, approvedById: md, approvedAt: addDays(orderedOn, 0.2),
            lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: subtotal, allocatedKg: despatched || allocated ? qty : 0, dispatchedKg: despatched ? qty : 0 }] },
          },
          include: { lines: true },
        });
        const line = so.lines[0]!;
        await prisma.inventoryBatch.update({ where: { id: fg.id }, data: { receivedQtyKg: { increment: qty }, ...(despatched ? {} : { availableQtyKg: { increment: qty } }) } });
        const mk = `${grade}:${Math.floor(daysAgo / 30.4)}`;
        fgMonth.set(mk, (fgMonth.get(mk) ?? 0) + qty);
        if (allocated) await prisma.stockAllocation.create({ data: { salesOrderLineId: line.id, batchId: fg.id, quantityKg: qty, allocatedById: store, createdAt: addDays(orderedOn, 1) } });
        if (!despatched) continue;

        await prisma.stockMovement.createMany({
          data: [
            { kind: MovementKind.ADJUSTMENT_POSITIVE, materialId: gr.fgId, batchId: fg.id, quantityKg: qty, ratePerKg: fg.rate, reference: w.outputRef, occurredAt: addDays(dispatchedOn, -2) },
            { kind: MovementKind.ISSUE_TO_PRODUCTION, materialId: gr.fgId, batchId: fg.id, quantityKg: -qty, ratePerKg: fg.rate, reference: so.code, occurredAt: dispatchedOn },
          ],
        });
        const challan = await prisma.deliveryChallan.create({
          data: {
            code: code("DC", dispatchedOn), status: daysAgo > 12 ? ChallanStatus.DELIVERED : ChallanStatus.DISPATCHED, salesOrderId: so.id, customerId,
            packedOn: addDays(dispatchedOn, -1), dispatchedOn, deliveredOn: daysAgo > 12 ? addDays(dispatchedOn, 2) : null, vehicleNo: vehicle(), raisedById: store,
            lines: { create: [{ salesOrderLineId: line.id, batchId: fg.id, lineNo: 1, quantityKg: qty, ratePerKg: rate }] },
          },
          include: { lines: true },
        });
        if (daysAgo <= 40) shipped.push({ challanId: challan.id, lineId: challan.lines[0]!.id, qty, pack: gr.g.pack, at: dispatchedOn });
        if (daysAgo <= 14 && daysAgo >= 8 && unbilledLeft > 0 && rand() > 0.4) {
          unbilledLeft--;
          await prisma.salesOrder.update({ where: { id: so.id }, data: { status: SalesOrderStatus.DISPATCHED } });
          continue;
        }
        const invoiceDate = addDays(dispatchedOn, int(0, 1));
        const dueOn = addDays(invoiceDate, c.creditDays);
        const total = subtotal + tax;
        const paidOn = addDays(dueOn, c.late + int(-3, 6));
        const halfAt = c.late > 40 ? addDays(dueOn, int(0, 5)) : null;
        let paid = 0;
        const payments: { at: Date; amount: number }[] = [];
        if (paidOn < NOW) { payments.push({ at: paidOn, amount: total }); paid = total; }
        else if (halfAt && halfAt < NOW) { payments.push({ at: halfAt, amount: r2(total / 2) }); paid = r2(total / 2); }
        const status = paid >= total ? SalesInvoiceStatus.PAID : paid > 0 ? SalesInvoiceStatus.PART_PAID : dueOn < NOW ? SalesInvoiceStatus.OVERDUE : SalesInvoiceStatus.RAISED;
        const inv = await prisma.salesInvoice.create({
          data: { code: code("INV", invoiceDate), status, salesOrderId: so.id, challanId: challan.id, customerId, invoiceDate, dueOn, subtotal, taxAmount: tax, totalValue: total, paidAmount: paid, raisedById: finance, createdAt: invoiceDate },
        });
        await prisma.ledgerPosting.createMany({
          data: [
            { accountId: acct["1100"]!, side: PostingSide.DEBIT, amount: total, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: invoiceDate, customerId, remark: `Invoice ${inv.code} raised for ${c.name}` },
            { accountId: acct["4000"]!, side: PostingSide.CREDIT, amount: subtotal, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: invoiceDate, remark: `Revenue for invoice ${inv.code}` },
            { accountId: acct["2100"]!, side: PostingSide.CREDIT, amount: tax, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: invoiceDate, remark: `Output GST for invoice ${inv.code}` },
          ],
        });
        for (const p of payments) {
          await prisma.ledgerPosting.createMany({
            data: [
              { accountId: acct["1000"]!, side: PostingSide.DEBIT, amount: p.amount, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: p.at, customerId },
              { accountId: acct["1100"]!, side: PostingSide.CREDIT, amount: p.amount, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: p.at, customerId },
            ],
          });
        }
        outstanding.set(customerId, (outstanding.get(customerId) ?? 0) + total - paid);
        if (daysAgo > 20 && daysAgo < 120) billed.push({ soId: so.id, lineId: line.id, projectId: gr.projectId, customerId, invoiceId: inv.id, rate, grade, at: invoiceDate });
      }
    }
  }

  console.log(`  ${w.label}: open and lost inquiries…`);
  const active = w.customers.filter((c) => !c.dormantSince);
  for (let i = 0; i < 90; i++) {
    const c = pick(active);
    const customerId = custIds.get(c.name)!;
    const daysAgo = int(2, 270);
    const at = ago(daysAgo);
    const grade = c.grades[0]!;
    const gr = grades.get(grade)!;
    const qty = Math.max(500, Math.round((c.scale * 1000 * between(0.5, 1.2)) / 250) * 250);
    const quoted = rand() < 0.6;
    const status = quoted ? SalesInquiryStatus.QUOTED : daysAgo < 12 ? SalesInquiryStatus.OPEN : SalesInquiryStatus.LOST;
    const inq = await prisma.salesInquiry.create({
      data: {
        code: code("INQ", at), status, customerId, projectId: gr.projectId, receivedOn: at, ownerId: sales,
        lostReason: status === SalesInquiryStatus.LOST ? pick(w.lostReasons) : null,
        lines: { create: [{ lineNo: 1, description: `${grade} ${gr.g.name}`, quantityKg: qty }] },
      },
    });
    if (!quoted) continue;
    const accepted = rand() < (daysAgo <= 90 ? 0.2 : 0.45);
    const issued = addDays(at, 4);
    const rate = r2(gr.sell * c.rate);
    await prisma.salesQuotation.create({
      data: {
        code: code("SQ", issued), inquiryId: inq.id, customerId, costSheetId: gr.costSheetId, issuedOn: issued, validUntil: addDays(issued, 30), ownerId: sales,
        status: accepted ? SalesQuotationStatus.ACCEPTED : daysAgo < 20 ? SalesQuotationStatus.UNDER_NEGOTIATION : rand() > 0.5 ? SalesQuotationStatus.REJECTED : SalesQuotationStatus.EXPIRED,
        subtotal: r2(qty * rate), totalValue: r2(qty * rate * 1.18), taxAmount: r2(qty * rate * 0.18),
        lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: r2(qty * rate) }] },
      },
    });
  }

  for (const [name, grade, qty, days, status] of w.forwardOrders) {
    const gr = grades.get(grade)!;
    const c = w.customers.find((x) => x.name === name)!;
    const rate = r2(gr.sell * c.rate);
    const at = ago(days);
    const pending = status === SalesOrderStatus.PENDING_APPROVAL;
    await prisma.salesOrder.create({
      data: {
        code: code("SO", at), customerId: custIds.get(name)!, orderedOn: at, promisedOn: addDays(NOW, 21), status,
        subtotal: r2(qty * rate), taxAmount: r2(qty * rate * 0.18), totalValue: r2(qty * rate * 1.18), raisedById: sales,
        approvedById: pending ? null : md, approvedAt: pending ? null : at, customerPoNo: `PO/${YEAR}/${int(100, 999)}`,
        lines: { create: [{ projectId: gr.projectId, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: r2(qty * rate) }] },
      },
    });
  }

  // ── Purchasing ────────────────────────────────────────────────────────────
  console.log(`  ${w.label}: purchase orders, receipts, lots and bills…`);
  const rejectedNoVrn = new Set([2, 5]);
  const unbilled = new Set<number>();
  const debitable: { grnId: string; grnLineId: string; billId: string; vendorId: string; materialId: string; name: string; rejected: number; rate: number; at: Date }[] = [];
  let grnN = 0;
  let pendingLeft = 2;
  for (let mo = 11; mo >= 0; mo--) {
    for (const m of w.materials) {
      let need = 0;
      for (const g of w.grades.filter((x) => x.sold)) {
        const kgOut = fgMonth.get(`${g.grade}:${mo}`) ?? 0;
        need += kgOut * ((g.parts[m.code] ?? 0) / gradeCost(g, NOW).total);
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
          code: code("PO", orderedOn), vendorId, orderedOn, expectedOn: addDays(orderedOn, 7), status: arrived ? PoStatus.RECEIVED : PoStatus.APPROVED,
          approvalTier: lineTotal > 2500000 ? ApprovalTier.MANAGEMENT : ApprovalTier.HEAD, subtotal: lineTotal, taxAmount: r2(lineTotal * 0.18), totalValue: r2(lineTotal * 1.18),
          raisedById: purchase, approvedById: lineTotal > 2500000 ? md : purchaseHead, approvedAt: orderedOn,
          lines: { create: [{ materialId: matId.get(m.code)!, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal, receivedKg: arrived ? qty : 0 }] },
        },
        include: { lines: true },
      });
      if (!arrived) continue;
      grnN++;
      const age = (NOW.getTime() - receivedOn.getTime()) / DAY;
      const pendingQc = age < 10 && pendingLeft-- > 0;
      const rejected = !pendingQc && age > 6 && age < 120 && grnN % 9 === 2 ? Math.round(qty * 0.04) : 0;
      const accepted = qty - rejected;
      let batchId: string | undefined;
      if (!pendingQc) {
        const remain = age < 30 ? 0.55 : age < 60 ? 0.22 : age < 90 ? 0.08 : m.reorder < 1000 && age < 220 ? 0.38 : 0;
        const available = Math.round(accepted * remain);
        const batch = await prisma.inventoryBatch.create({
          data: {
            batchNo: code("B", receivedOn, 5), materialId: matId.get(m.code)!, status: available > 0 ? BatchStatus.AVAILABLE : BatchStatus.CONSUMED,
            receivedQtyKg: accepted, availableQtyKg: available, ratePerKg: rate, warehouseId: wh[m.warehouse]!, receivedOn, binLocation: `R${int(1, 9)}-${int(1, 20)}`,
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
              purchaseOrderLineId: po.lines[0]!.id, lineNo: 1, challanQtyKg: qty, receivedQtyKg: qty, acceptedQtyKg: pendingQc ? 0 : accepted, rejectedQtyKg: rejected,
              qcResult: pendingQc ? QcResult.PENDING : rejected ? QcResult.CONDITIONAL : QcResult.PASS, qcRemark: rejected ? pick(w.qcRemarks) : null, batchId,
            }],
          },
        },
        include: { lines: true },
      });
      if (rejected && !rejectedNoVrn.has(grnN % 7)) {
        await prisma.vendorRejectionNote.create({
          data: {
            code: code("VRN", receivedOn), status: VrnStatus.DISPATCHED, goodsReceiptId: grn.id, vendorId, raisedById: purchase,
            approvedById: purchaseHead, approvedAt: addDays(receivedOn, 2), dispatchedAt: addDays(receivedOn, 4),
            lines: { create: [{ grnLineId: grn.lines[0]!.id, materialId: matId.get(m.code)!, lineNo: 1, quantityKg: rejected, ratePerKg: rate, reason: grn.lines[0]!.qcRemark }] },
          },
        });
      }
      if (pendingQc) continue;
      if (age > 5 && age < 24 && unbilled.size < 3 && grnN % 2 === 1) { unbilled.add(grnN); continue; }
      if (age < 3) continue;
      const vend = w.vendors[m.vendor]!;
      const billDate = addDays(receivedOn, int(1, 3));
      const due = addDays(billDate, vend.creditDays);
      const billedQty = rejected ? qty : accepted;
      const value = r2(billedQty * rate * 1.18);
      const paidAt = addDays(due, int(-2, 4));
      const isPaid = paidAt < NOW && !rejected;
      const bill = await prisma.vendorBill.create({
        data: {
          code: code("VB", billDate), status: isPaid ? VendorBillStatus.PAID : VendorBillStatus.APPROVED, basis: VendorBillBasis.GRN,
          vendorId, purchaseOrderId: po.id, goodsReceiptId: grn.id, billNo: `VI/${int(1000, 9999)}`, billDate, dueOn: due,
          subtotal: r2(billedQty * rate), taxAmount: r2(billedQty * rate * 0.18), totalValue: value, paidAmount: isPaid ? value : 0, createdById: finance,
        },
      });
      await prisma.ledgerPosting.createMany({
        data: [
          { accountId: acct["5000"]!, side: PostingSide.DEBIT, amount: value, sourceType: PostingSourceType.VENDOR_BILL, sourceId: bill.id, vendorBillId: bill.id, postedAt: billDate, vendorId },
          { accountId: acct["2000"]!, side: PostingSide.CREDIT, amount: value, sourceType: PostingSourceType.VENDOR_BILL, sourceId: bill.id, vendorBillId: bill.id, postedAt: billDate, vendorId },
        ],
      });
      if (rejected) debitable.push({ grnId: grn.id, grnLineId: grn.lines[0]!.id, billId: bill.id, vendorId, materialId: matId.get(m.code)!, name: m.name, rejected, rate, at: billDate });
      if (isPaid) {
        await prisma.ledgerPosting.createMany({
          data: [
            { accountId: acct["2000"]!, side: PostingSide.DEBIT, amount: value, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: paidAt, vendorId },
            { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount: value, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: paidAt, vendorId },
          ],
        });
      }
    }
  }

  console.log(`  ${w.label}: debit notes, returns and credit notes…`);
  for (const d of debitable.slice(0, 3)) {
    const taxable = r2(d.rejected * d.rate);
    const tax = r2(taxable * 0.18);
    await prisma.debitNote.create({
      data: {
        number: code("DN", d.at), date: addDays(d.at, 1), vendorBillId: d.billId, goodsReceiptId: d.grnId, vendorId: d.vendorId,
        reason: "Rejected at incoming QC", taxableValue: taxable, taxAmount: tax, totalValue: taxable + tax, createdById: finance,
        lines: { create: [{ grnLineId: d.grnLineId, materialId: d.materialId, description: d.name, quantity: d.rejected, rate: d.rate, taxableValue: taxable, taxAmount: tax, totalValue: taxable + tax }] },
      },
    });
    await prisma.vendorBill.update({ where: { id: d.billId }, data: { debitedAmount: taxable + tax } });
    await prisma.ledgerPosting.createMany({
      data: [
        { accountId: acct["2000"]!, side: PostingSide.DEBIT, amount: taxable + tax, sourceType: PostingSourceType.DEBIT_NOTE, sourceId: d.billId, vendorBillId: d.billId, postedAt: addDays(d.at, 1), vendorId: d.vendorId },
        { accountId: acct["5000"]!, side: PostingSide.CREDIT, amount: taxable, sourceType: PostingSourceType.DEBIT_NOTE, sourceId: d.billId, vendorBillId: d.billId, postedAt: addDays(d.at, 1), vendorId: d.vendorId },
        { accountId: acct["1500"]!, side: PostingSide.CREDIT, amount: tax, sourceType: PostingSourceType.DEBIT_NOTE, sourceId: d.billId, vendorBillId: d.billId, postedAt: addDays(d.at, 1), vendorId: d.vendorId },
      ],
    });
  }

  const r1 = billed.find((b) => b.grade === w.returns.restockGrade);
  const rp = billed.find((b) => b.grade === w.returns.pendingGrade && b !== r1);
  if (r1) {
    const qty = w.returns.returnQty;
    const at = addDays(r1.at, 12);
    const ret = await prisma.salesReturn.create({
      data: {
        code: code("SRN", at), status: SalesReturnStatus.RESTOCKED, salesOrderId: r1.soId, customerId: r1.customerId, returnedOn: at,
        reason: w.returns.restockReason, customerDcNo: `RDC/${int(100, 999)}`, receivedById: store, inspectedById: store, inspectedAt: addDays(at, 1),
        qcRemark: w.returns.qcRemark, resolution: ReturnResolution.NONE,
        lines: { create: [{ salesOrderLineId: r1.lineId, projectId: r1.projectId, lineNo: 1, quantityKg: qty, restockedKg: qty, qcResult: QcResult.PASS }] },
      },
      include: { lines: true },
    });
    const taxable = r2(qty * r1.rate);
    const tax = r2(taxable * 0.18);
    const g = grades.get(r1.grade)!.g;
    await prisma.creditNote.create({
      data: {
        number: code("CN", addDays(at, 2)), date: addDays(at, 2), salesInvoiceId: r1.invoiceId, salesReturnId: ret.id, customerId: r1.customerId,
        reason: "Return accepted, restocked", taxableValue: taxable, taxAmount: tax, totalValue: taxable + tax, createdById: finance,
        lines: { create: [{ salesReturnLineId: ret.lines[0]!.id, description: `${g.grade} ${g.name}`, quantity: qty, rate: r1.rate, taxableValue: taxable, taxAmount: tax, totalValue: taxable + tax }] },
      },
    });
    await prisma.salesInvoice.update({ where: { id: r1.invoiceId }, data: { creditedAmount: taxable + tax } });
    await prisma.ledgerPosting.createMany({
      data: [
        { accountId: acct["4000"]!, side: PostingSide.DEBIT, amount: taxable, sourceType: PostingSourceType.CREDIT_NOTE, sourceId: ret.id, postedAt: addDays(at, 2), remark: `Credit note for return ${ret.code} (revenue reversal)` },
        { accountId: acct["2100"]!, side: PostingSide.DEBIT, amount: tax, sourceType: PostingSourceType.CREDIT_NOTE, sourceId: ret.id, postedAt: addDays(at, 2), remark: `Credit note for return ${ret.code} (output GST reversal)` },
        { accountId: acct["1100"]!, side: PostingSide.CREDIT, amount: taxable + tax, sourceType: PostingSourceType.CREDIT_NOTE, sourceId: ret.id, postedAt: addDays(at, 2), customerId: r1.customerId, remark: `Credit note for return ${ret.code}` },
      ],
    });
    outstanding.set(r1.customerId, (outstanding.get(r1.customerId) ?? 0) - (taxable + tax));
  }
  if (rp) {
    await prisma.salesReturn.create({
      data: {
        code: code("SRN", ago(2)), status: SalesReturnStatus.PENDING_QC, salesOrderId: rp.soId, customerId: rp.customerId, returnedOn: ago(2),
        reason: w.returns.pendingReason, customerDcNo: `RDC/${int(100, 999)}`, receivedById: store,
        lines: { create: [{ salesOrderLineId: rp.lineId, projectId: rp.projectId, lineNo: 1, quantityKg: w.returns.pendingQty, qcResult: QcResult.PENDING }] },
      },
    });
  }
  for (const [id, amt] of outstanding) await prisma.customer.update({ where: { id }, data: { outstandingAmt: r2(amt) } });

  console.log(`  ${w.label}: packing lists…`);
  const recentLoads = shipped.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 7);
  for (const [n, s] of recentLoads.entries()) {
    const finalised = n > 0;
    const pl = await prisma.packingList.create({
      data: {
        code: code("PKL", s.at), status: finalised ? PackingListStatus.FINAL : PackingListStatus.DRAFT, challanId: s.challanId, createdById: store,
        finalizedById: finalised ? store : null, finalizedAt: finalised ? s.at : null, createdAt: addDays(s.at, -1), remark: s.pack.remark,
      },
    });
    let left = s.qty;
    let pkg = 0;
    while (left > 0) {
      pkg++;
      const net = Math.min(s.pack.perPack, left);
      left -= net;
      await prisma.packingPackage.create({
        data: { packingListId: pl.id, packageNo: pkg, packageType: s.pack.packageType, grossKg: net + s.pack.tare, tareKg: s.pack.tare, lines: { create: [{ challanLineId: s.lineId, quantityKg: net }] } },
      });
    }
  }

  for (const [mc, days, qty, status] of w.overduePOs) {
    const m = mat(mc);
    const at = ago(days + 8);
    const rate = rateOn(m, at);
    const total = r2(qty * rate);
    const pending = status === PoStatus.PENDING_APPROVAL;
    await prisma.purchaseOrder.create({
      data: {
        code: code("PO", at), vendorId: vendorIds[m.vendor]!, orderedOn: at, expectedOn: pending ? addDays(NOW, 10) : ago(days), status,
        approvalTier: total > 2500000 ? ApprovalTier.MANAGEMENT : ApprovalTier.HEAD, subtotal: total, taxAmount: r2(total * 0.18), totalValue: r2(total * 1.18),
        raisedById: purchase, approvedById: pending ? null : purchaseHead, approvedAt: pending ? null : at,
        lines: { create: [{ materialId: matId.get(mc)!, lineNo: 1, quantityKg: qty, ratePerKg: rate, lineTotal: total }] },
      },
    });
  }
  for (const [mc, days, qty, status] of w.requisitions) {
    const at = ago(days);
    const pending = status === RequisitionStatus.PENDING_APPROVAL;
    await prisma.purchaseRequisition.create({
      data: {
        code: code("PR", at), status, purpose: "Production plan replenishment", requiredBy: addDays(NOW, 6), raisedById: store,
        approvedById: pending ? null : purchaseHead, approvedAt: pending ? null : at, createdAt: addDays(at, -1),
        lines: { create: [{ materialId: matId.get(mc)!, lineNo: 1, quantityKg: qty }] },
      },
    });
  }

  console.log(`  ${w.label}: RFQs and vendor quotations…`);
  for (const r of w.rfqs) {
    const at = ago(r.days);
    const inq = await prisma.purchaseInquiry.create({
      data: {
        code: code("PI", at), status: r.status, issuedOn: at, dueOn: addDays(at, 7), raisedById: purchase, terms: r.terms,
        lines: { create: [{ materialId: matId.get(r.mc)!, lineNo: 1, quantityKg: r.qty }] },
        vendors: { create: r.vendors.map(([v, , lead]) => ({ vendorId: vendorIds[v]!, sentAt: at, respondedAt: lead === null ? null : addDays(at, int(1, 4)) })) },
      },
      include: { lines: true },
    });
    const m = mat(r.mc);
    for (const [k, [v, f, lead]] of r.vendors.entries()) {
      if (lead === null) continue;
      const rate = r2(rateOn(m, NOW) * f);
      const sub = r2(r.qty * rate);
      const selected = r.status === InquiryStatus.COMPARED && k === 0;
      await prisma.purchaseQuotation.create({
        data: {
          code: code("PQ", addDays(at, 2)), inquiryId: inq.id, vendorId: vendorIds[v]!, vendorRef: `Q/${int(100, 999)}`,
          status: r.status === InquiryStatus.COMPARED ? (selected ? QuotationStatus.SELECTED : QuotationStatus.REJECTED) : QuotationStatus.SUBMITTED,
          receivedOn: addDays(at, 2), validUntil: addDays(at, 32), paymentTerms: "30 days", deliveryTerms: "Ex-works", leadTimeDays: lead,
          subtotal: sub, taxAmount: r2(sub * 0.18), totalValue: r2(sub * 1.18), selectedById: selected ? purchaseHead : null, selectedAt: selected ? addDays(at, 5) : null,
          decisionNote: r.status === InquiryStatus.COMPARED ? (selected ? "Lowest landed cost and shortest lead time" : "Higher rate") : null,
          lines: { create: [{ materialId: matId.get(r.mc)!, inquiryLineId: inq.lines[0]!.id, lineNo: 1, quantityKg: r.qty, ratePerKg: rate, lineTotal: sub, leadDays: lead }] },
        },
      });
    }
  }

  for (let mo = 11; mo >= 0; mo--) {
    const at = ago(mo * 30.4 + 2);
    for (const [acc, amt] of w.overheads) {
      const amount = r2(amt * between(0.9, 1.1));
      await prisma.ledgerPosting.createMany({
        data: [
          { accountId: acct[acc]!, side: PostingSide.DEBIT, amount, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: `EXP-${mo}-${acc}`, postedAt: at },
          { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: `EXP-${mo}-${acc}`, postedAt: at },
        ],
      });
    }
  }
  await seedJournalVouchers(prisma, acct, w.jvs);

  console.log(`  ${w.label}: planning work orders…`);
  const rmBatches = await prisma.inventoryBatch.findMany({ where: { status: BatchStatus.AVAILABLE, material: { itemType: ItemType.RAW_MATERIAL } }, orderBy: { receivedOn: "desc" }, take: 8 });
  for (const [status, days, grade, qty, allocs, shortage] of w.pwos) {
    const gr = grades.get(grade)!;
    const row = await prisma.planningWorkOrder.create({
      data: {
        code: code("PWO", ago(days)), status, source: PlanningSource.MAKE_TO_ORDER, materialId: gr.fgId, quantityKg: qty,
        requestedById: rnd, approvedById: md, approvedAt: ago(days), createdAt: ago(days), updatedAt: ago(Math.max(1, days - 3)),
      },
    });
    for (const b of rmBatches.splice(0, allocs)) {
      await prisma.planningAllocation.create({ data: { pwoId: row.id, materialId: b.materialId, batchId: b.id, quantityKg: Math.round(Number(b.availableQtyKg) * 0.4), createdAt: ago(days) } });
    }
    if (shortage) {
      const [mc, req, alloc] = shortage;
      await prisma.planningShortage.create({ data: { pwoId: row.id, materialId: matId.get(mc)!, requiredQtyKg: req, allocatedQtyKg: alloc, shortageQtyKg: req - alloc, createdAt: ago(days) } });
    }
  }
}
