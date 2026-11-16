import type { DocKind } from "@/components/report/report-context";
import type { TenantKey } from "@/lib/tenants";

/**
 * The guided journeys, one per company, each told in that company's own trade.
 *
 * The manufacturers follow one order end to end: requirement, development,
 * costing, quotation, order; materials bought, received and inspected; the
 * batch made, despatched and invoiced; the money in and the books closed. Raj
 * Enterprises sells people's time, so its journey follows a client engagement
 * from the plan to the timesheet to the invoice, and the people behind it.
 *
 * Every stop names the paper it leaves behind. Stops on screens the signed-in
 * role cannot open are dropped at runtime.
 */

export type ChapterId =
  | "orient" | "develop" | "clients" | "sell" | "deliver" | "buy" | "make" | "ship" | "people" | "money" | "configure" | "control";

export const CHAPTERS: { id: ChapterId; label: string }[] = [
  { id: "orient", label: "Get oriented" },
  { id: "develop", label: "Customer & product" },
  { id: "clients", label: "Clients" },
  { id: "sell", label: "Win the order" },
  { id: "deliver", label: "Plan and deliver" },
  { id: "buy", label: "Buy the materials" },
  { id: "make", label: "Make the batch" },
  { id: "ship", label: "Ship and bill" },
  { id: "people", label: "People" },
  { id: "money", label: "Get paid, close the books" },
  { id: "configure", label: "Make it yours" },
  { id: "control", label: "Control" },
];

export type TourStep = {
  id: string;
  chapter: ChapterId;
  title: string;
  body: string;
  route?: string;
  openFirst?: boolean;
  target?: string;
  who?: string;
  doc?: string;
  docKind?: DocKind;
};

export function targetSelector(target: string): string {
  return target === "main" || /^[[.#]/.test(target) ? target : `[data-tour="${target}"]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared opening and close
// ─────────────────────────────────────────────────────────────────────────────

function orientation(company: string, journey: string): TourStep[] {
  return [
    {
      id: "welcome",
      chapter: "orient",
      title: `${company}, end to end`,
      body: `${journey} Each stop opens the real screen with ${company}'s own data, says who works there, and shows the document it produces. Arrow keys move, Esc leaves, and the tour remembers where you stopped.`,
    },
    {
      id: "dashboard",
      chapter: "orient",
      route: "/",
      target: "main",
      title: "Today: what is waiting on you",
      body: "The dashboard opens on work, not greetings: approvals that are yours to sign, money that is late, things running short. Every figure links to the list behind it.",
      who: "Everyone, scoped to their role",
      doc: "Daily position printout",
      docKind: "page",
    },
    {
      id: "navigator",
      chapter: "orient",
      target: "sidebar",
      title: "The navigator follows the work",
      body: `Modules are arranged the way work moves through ${company}. The counts beside an entry are documents waiting at that stage now, counted for what your role can act on.`,
    },
    {
      id: "palette",
      chapter: "orient",
      target: "palette",
      title: "Jump anywhere with Ctrl K",
      body: "Search finds people, customers, orders and records by name or code, and every screen by its title. Press / from anywhere outside a field to open it.",
    },
    {
      id: "generate",
      chapter: "orient",
      target: "generate",
      title: "Every screen generates its paper",
      body: `Generate turns the screen you are on into a numbered document on ${company}'s letterhead. On a list it is a report of every row in the filter, not only those on screen, as a PDF or a CSV for Excel. On a record it is that record's document.`,
      doc: "PDF or CSV of the current screen",
      docKind: "page",
    },
    {
      id: "appearance",
      chapter: "orient",
      target: "button[title='Theme']",
      title: "Twelve palettes, four styles",
      body: `${company} opens in its own palette and style. Theme switches to any of twelve palettes, four styles (Classic, Compact for long lists, Soft, Editorial) and light, dark or system, remembered per company. Generated documents always print in the house letterhead.`,
    },
  ];
}

function closing(company: string, summary: string): TourStep[] {
  return [
    {
      id: "users",
      chapter: "control",
      route: "/admin/users",
      target: "main",
      title: "Roles decide what each person sees",
      body: "Every screen and every action is gated by role. The navigator and this tour both shrink to what a role is allowed to touch, so each person sees their own version of the system.",
      who: "Administrator",
      doc: "User and role register",
      docKind: "page",
    },
    {
      id: "finish",
      chapter: "control",
      target: "tour-launch",
      title: `That is ${company} on one system`,
      body: `${summary} Reopen this tour from Tour in the top bar at any time, or jump to a chapter from its journey map.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Manufacturers: one builder, each company's words
// ─────────────────────────────────────────────────────────────────────────────

type MfgWords = {
  company: string;
  journey: string;
  product: string;
  develop: { projects: string; specs: string; docs: string; items: string };
  sell: { costSheet: string; quotation: string; order: string };
  buy: { requisition: string; rfq: string; grn: string; rejections: string; inventory: string; vendors: string };
  make: { planning: string; production: string };
  ship: { despatch: string; packing: string; packingDoc: string };
  money: { costing: string; costingTitle: string };
  summary: string;
};

function manufacturing(w: MfgWords, extra: TourStep[] = []): TourStep[] {
  return [
    ...orientation(w.company, w.journey),
    {
      id: "customers", chapter: "develop", route: "/customers", target: "grid",
      title: "Customers carry their credit and tax identity",
      body: "Each customer holds its GSTIN, addresses, payment terms and a credit limit. The limit is enforced later: an order that would take exposure past it cannot be confirmed without a written override.",
      who: "Sales", doc: "Customer register", docKind: "report",
    },
    {
      id: "projects", chapter: "develop", route: "/projects", target: "grid",
      title: w.develop.projects.split("|")[0]!, body: w.develop.projects.split("|")[1]!,
      who: "R&D and Sales", doc: "Development register", docKind: "report",
    },
    {
      id: "formulations", chapter: "develop", route: "/projects/formulations", target: "grid",
      title: w.develop.specs.split("|")[0]!, body: w.develop.specs.split("|")[1]!,
      who: "R&D", doc: "Specification register", docKind: "report",
    },
    {
      id: "documents", chapter: "develop", route: "/documents", target: "grid",
      title: w.develop.docs.split("|")[0]!, body: w.develop.docs.split("|")[1]!,
      who: "Quality", doc: "Document register with expiries", docKind: "report",
    },
    {
      id: "items", chapter: "develop", route: "/items", target: "main",
      title: "The item master and its bills of material", body: w.develop.items,
      who: "Planning", doc: "Item master listing", docKind: "page",
    },
    {
      id: "sales-flow", chapter: "sell", route: "/sales/flow", target: "main",
      title: "The sales chain on one map",
      body: `Inquiry, cost sheet, quotation, order, despatch, invoice, return: drawn as the chain they are, with what is sitting at each stage for ${w.company} right now. Where a document is missing, the map shows value leaking out.`,
      who: "Sales head", doc: "Pipeline snapshot", docKind: "page",
    },
    {
      id: "inquiries", chapter: "sell", route: "/sales/inquiries", target: "list-new",
      title: "It starts with an inquiry",
      body: `Log the customer, the ${w.product} they asked for and the quantity, with any target rate. The inquiry stays open until it is quoted, won or lost, and lost ones keep their reason.`,
      who: "Sales", doc: "Inquiry register", docKind: "report",
    },
    {
      id: "cost-sheet", chapter: "sell", route: "/sales/cost-sheets", openFirst: true, target: "record-header",
      title: "The cost sheet sets the floor", body: w.sell.costSheet,
      who: "Sales prepares, Finance approves", doc: "Cost sheet", docKind: "document",
    },
    {
      id: "quotation", chapter: "sell", route: "/sales/quotations", openFirst: true, target: "record-header",
      title: "A quotation that cannot undercut its cost", body: w.sell.quotation,
      who: "Sales", doc: "Quotation and proforma invoice", docKind: "document",
    },
    {
      id: "sales-order", chapter: "sell", route: "/sales/orders", openFirst: true, target: "record-header",
      title: "The order passes the credit gate", body: w.sell.order,
      who: "Sales raises, Management confirms", doc: "Sales order acknowledgement", docKind: "document",
    },
    {
      id: "procurement-flow", chapter: "buy", route: "/procurement/flow", target: "main",
      title: "Procurement as a chain of signatures",
      body: "Demand enters as a requisition and leaves as stock, or goes back to the vendor. Each stage is a document that must be signed before the next one can exist.",
      who: "Purchase head", doc: "Procurement snapshot", docKind: "page",
    },
    {
      id: "requisitions", chapter: "buy", route: "/procurement/requisitions", target: "grid",
      title: "Requisitions ask for material", body: w.buy.requisition,
      who: "Stores and Planning", doc: "Requisition register", docKind: "report",
    },
    {
      id: "rfq", chapter: "buy", route: "/procurement/inquiries", target: "grid",
      title: "One inquiry, several vendors", body: w.buy.rfq,
      who: "Purchase", doc: "Comparative statement", docKind: "report",
    },
    {
      id: "purchase-order", chapter: "buy", route: "/procurement/orders", openFirst: true, target: "record-header",
      title: "The purchase order, approved by value",
      body: "Orders within the Purchase Head's limit are signed there; above it they escalate to Management automatically. Vendors see only their own orders, through their own login.",
      who: "Purchase raises, Head or Management approves", doc: "Purchase order", docKind: "document",
    },
    {
      id: "grn", chapter: "buy", route: "/procurement/grn", openFirst: true, target: "record-header",
      title: "Goods are received, then inspected", body: w.buy.grn,
      who: "Stores receives, QC inspects", doc: "Goods receipt note", docKind: "document",
    },
    {
      id: "rejections", chapter: "buy", route: "/procurement/rejections", target: "grid",
      title: "What failed goes back on paper", body: w.buy.rejections,
      who: "QC and Purchase", doc: "Rejection note register", docKind: "report",
    },
    {
      id: "inventory", chapter: "buy", route: "/procurement/inventory", target: "grid",
      title: "Stock, lot by lot", body: w.buy.inventory,
      who: "Stores", doc: "Stock statement", docKind: "report",
    },
    {
      id: "vendors", chapter: "buy", route: "/procurement/vendors", target: "grid",
      title: "Vendors maintain their own prices", body: w.buy.vendors,
      who: "Purchase and Finance", doc: "Vendor register", docKind: "report",
    },
    {
      id: "planning", chapter: "make", route: "/planning", target: "main",
      title: "Work orders schedule the batch", body: w.make.planning,
      who: "Planning", doc: "Production plan", docKind: "page",
    },
    {
      id: "production", chapter: "make", route: "/production", target: "main",
      title: "The production console", body: w.make.production,
      who: "Production", doc: "Shift production report", docKind: "page",
    },
    {
      id: "despatch", chapter: "ship", route: "/sales/dispatch", openFirst: true, target: "record-header",
      title: "Despatch moves allocated stock", body: w.ship.despatch,
      who: "Stores and Logistics", doc: "Delivery challan", docKind: "document",
    },
    {
      id: "packing", chapter: "ship", route: "/sales/packing-lists", target: "grid",
      title: "Packing lists travel with the load", body: w.ship.packing,
      who: "Stores", doc: w.ship.packingDoc, docKind: "report",
    },
    {
      id: "invoice", chapter: "ship", route: "/sales/invoices", openFirst: true, target: "record-header",
      title: "The invoice posts itself to the ledger",
      body: "Raising the tax invoice from a challan computes GST line by line and posts the receivable, revenue and output tax in the same step. Returned quantity is netted off first.",
      who: "Finance", doc: "Tax invoice", docKind: "document",
    },
    {
      id: "returns", chapter: "ship", route: "/sales/returns", target: "grid",
      title: "Returns are inspected before they count",
      body: "Returned goods wait for QC. What is restocked becomes a fresh lot, what is scrapped is written off, and the two must add up to what came back. A settled return issues a credit note under Section 34 of the CGST Act.",
      who: "QC and Stores", doc: "Returns register", docKind: "report",
    },
    {
      id: "receivable", chapter: "money", route: "/finance/receivable", target: "main",
      title: "Receivables, aged",
      body: "Every open invoice by customer and by how overdue it is. Recording a receipt settles the invoice and posts the bank entry.",
      who: "Finance", doc: "Receivables ageing report", docKind: "page",
    },
    {
      id: "payable", chapter: "money", route: "/finance/payable", target: "main",
      title: "Payables, matched to what arrived",
      body: "Vendor bills are matched against the order and the goods receipt before they can be paid, net of debit notes raised for rejected material.",
      who: "Finance", doc: "Payables statement", docKind: "page",
    },
    {
      id: "journal", chapter: "money", route: "/finance/journal", target: "main",
      title: "Journal vouchers close the books",
      body: "Adjustments the system cannot post on its own go in as balanced vouchers. A posted voucher is never edited: it is reversed by a second one, so the audit trail stays whole.",
      who: "Finance", doc: "Journal voucher", docKind: "page",
    },
    {
      id: "costing", chapter: "money", route: "/finance/costing", target: "main",
      title: w.money.costingTitle, body: w.money.costing,
      who: "Finance and Management", doc: "Costing statement", docKind: "page",
    },
    ...extra,
    ...closing(w.company, w.summary),
  ];
}

const TANGENT = manufacturing({
  company: "Tangent",
  journey: "This tour follows one order for a calcium-zinc one-pack: from a pipe maker's inquiry, through the stearic acid and zinc oxide it is blended from, to the receipt in the bank and the journal that closes the month.",
  product: "stabiliser, lubricant or ESO grade",
  develop: {
    projects: "A customer's problem becomes a development project|A pipe or profile extruder asks for a stabiliser that runs cleaner or costs less. The request opens a project against the customer with the standard it must meet, and samples and approvals hang off it.",
    specs: "Blends, versioned by weight|Each product is a blend held in parts by weight, versioned, and costed live against approved material rates. The version a customer approved is the version the cost sheet freezes.",
    docs: "TDS, SDS and certificates in one register|Technical and safety data sheets, certificates of analysis and RoHS / REACH declarations, attached to the product, material or vendor they cover. One REACH declaration has already lapsed: the register shows it.",
    items: "Finished grades and the raw materials they consume are items; the standard BOM says what one tonne of TS-CZ 610 draws from the stores.",
  },
  sell: {
    costSheet: "Material cost from the blend at today's approved rates, plus conversion, overhead and margin, gives the lowest rate Sales may quote. Someone other than the preparer must approve it. One for the new foam-board grade is waiting now.",
    quotation: "The quoted rate is checked against the approved cost sheet. The quotation carries its validity date, and its proforma invoice prints from here for the customer's purchase team.",
    order: "Accepting a quotation raises the order. Confirming it checks the customer's total exposure against their credit limit, and the person who raised it cannot be the one who confirms it. Two are waiting for the MD.",
  },
  buy: {
    requisition: "Stores or planning raises a requisition for stearic acid, zinc oxide, hydrotalcite or waxes. Approved requisitions are what inquiries and orders are allowed to answer.",
    rfq: "One inquiry for zinc oxide went to three vendors; their quotes came back into the same record and were compared on landed rate and lead time before one was selected.",
    grn: "The goods receipt note records what arrived. Nothing is usable until QC passes it on acid value, moisture or melt point; accepted quantity becomes a traceable lot, rejected quantity goes to a rejection note.",
    rejections: "A rejection note sends failed material back, and the debit note takes its value off the vendor's bill.",
    inventory: "Every receipt is a lot with its QC result, its warehouse (racked store, tank farm, hazardous shed) and what is free versus allocated. Material under its reorder level is flagged here and on the navigator.",
    vendors: "Gujarat Oleochem and Western Waxes submit price changes from their own portal. Finance approves them before any cost sheet can use them; two are waiting now.",
  },
  make: {
    planning: "A confirmed order becomes a blending work order with the grade and quantity. Material it is short of, like zinc oxide this week, shows as a shortage against it.",
    production: "The blending hall's view: ribbon blenders and the epoxidation reactor, what is running, what is queued, and who is operating it.",
  },
  ship: {
    despatch: "Only allocated stock can leave. The delivery challan records the vehicle and the exact lots loaded, so every bag at the customer traces back to a blend.",
    packing: "25 kg bags forty to a pallet, or 200 kg drums four to a pallet for ESO, with net and gross weight per package.",
    packingDoc: "Packing list",
  },
  money: {
    costingTitle: "Product costing, on today's rates",
    costing: "What every grade costs to make at the currently approved material prices: the number that tells you whether last quarter's quotations still make money after the stearic acid increase.",
  },
  summary: "Inquiry to invoice to journal, with a document at every stop.",
});

const DUPLAST = manufacturing(
  {
    company: "Duplast",
    journey: "This tour follows one DOTP order across Duplast's two plants: from a cable compounder's inquiry, through the 2-ethylhexanol and PTA it is esterified from, to the payment and the books. It ends on how the system bends to Duplast rather than the other way round.",
    product: "plasticiser or stabiliser grade",
    develop: {
      projects: "Technical service opens development projects|A compounder asks for a phthalate-free plasticiser or a tin-free stabiliser. The request opens a project with its standard and target price; trials and approvals hang off it.",
      specs: "Recipes, versioned and costed|Every grade is a recipe held by weight, versioned, and costed live against approved material rates. The approved version is what the cost sheet freezes.",
      docs: "TDS, SDS and declarations in one register|Data sheets, COAs, RoHS and REACH declarations, attached to the grade, material or vendor they cover, with revision and expiry tracked.",
      items: "Plasticisers, stabilisers and their intermediates are items; the standard BOM says what one tonne of each grade draws from stores at either plant.",
    },
    sell: {
      costSheet: "Material cost at today's approved rates, plus conversion, overhead and margin, gives the floor Sales may quote. A second person approves it.",
      quotation: "The quoted rate is checked against the cost sheet; the proforma prints from here.",
      order: "Confirming an order checks the customer's exposure against their credit limit, with four eyes on every confirmation.",
    },
    buy: {
      requisition: "Each plant raises its own requisitions: 2-EH and PTA at Vapi, stearic acid and zinc oxide at Silvassa.",
      rfq: "One inquiry, several vendors, compared on landed rate and lead time before one is selected.",
      grn: "Tankers and bags are received against the order and held until QC passes them on acid value, colour and moisture. Accepted quantity becomes a lot; rejected quantity goes back.",
      rejections: "A rejection note sends failed material back and raises the debit note against the vendor's bill.",
      inventory: "Lots across both plants' stores and tank farms, with what is free and what is allocated.",
      vendors: "Vendors submit price changes from their own portal; Finance approves them before costing uses them.",
    },
    make: {
      planning: "Orders become work orders at the plant that makes the grade, with material shortages shown against them.",
      production: "Reactors and blenders at both plants: what is running, queued and who is on shift.",
    },
    ship: {
      despatch: "Allocated stock leaves on a delivery challan with the lots loaded, tanker or pallet.",
      packing: "200 kg drums, 1 tonne IBCs or 25 kg bags, with net and gross weight per package.",
      packingDoc: "Packing list",
    },
    money: {
      costingTitle: "Grade costing, on today's rates",
      costing: "What every grade costs at the currently approved rates, so pricing follows 2-EH and PTA rather than lagging them.",
    },
    summary: "Two plants, one set of books, and a system shaped to Duplast.",
  },
  [
    {
      id: "multi-tenant", chapter: "configure", target: "sidebar",
      title: "One platform, many companies",
      body: "This instance runs eight companies side by side. Each has its own database schema, so their records never share a table, plus its own modules, labels, roles, letterhead and theme. Duplast's subsidiaries or plants could each be one.",
    },
    {
      id: "settings", chapter: "configure", route: "/admin/settings", target: "main",
      title: "Configuration without code",
      body: "This screen shows what each module holds and the audit trail of changes. What makes each company different, its modules, the names it uses for them, its roles, letterhead, palette and style, is configuration kept apart from the screens, so a new company or plant is added without touching the ones already running.",
      who: "Administrator", doc: "Configuration printout", docKind: "page",
    },
  ],
);

const TRIDENT = manufacturing({
  company: "Trident",
  journey: "This tour follows one order for M12 class 10.9 hex bolts: from an auto OEM's schedule, through the wire rod, heat treatment and zinc plating they need, to the receipt in the bank. Every box stays traceable to its heat lot.",
  product: "bolt, nut, stud or washer",
  develop: {
    projects: "New part development, to PPAP|An OEM sends a drawing for a new flange bolt. It opens a development project with the standard it must meet (IS 1367, ISO 898-1), the PPAP stage it has reached, and the samples sent.",
    specs: "Part specifications, by weight per piece|Each part's specification lists the wire rod grade, plating and consumables per unit of output, versioned. The approved version is what the cost sheet freezes.",
    docs: "Drawings, PPAP and test certificates|Customer drawings, control plans, PPAP submissions and mill test certificates for every wire rod heat, attached to the part, material or vendor they cover, with expiry tracked.",
    items: "Finished parts and the wire rod, plating chemicals and cartons they consume are items; the standard BOM says what one tonne of M12 bolts draws from stores.",
  },
  sell: {
    costSheet: "Wire rod at today's approved rate, plus forging, threading, heat treatment, plating, overhead and margin, gives the floor Sales may quote. A second person approves it.",
    quotation: "The quoted rate per kg is checked against the approved cost sheet; the proforma prints from here for the OEM's purchase team.",
    order: "OEM schedules and distributor orders are confirmed against each customer's credit limit, with four eyes on every confirmation.",
  },
  buy: {
    requisition: "Planning raises requisitions for wire rod by grade (10B21, SCM435, EN8) and for zinc and passivation chemicals.",
    rfq: "One inquiry for boron steel wire rod went to the mills; their quotes were compared on rate and lead time before one was selected.",
    grn: "Wire rod coils are received against the order with the mill's heat number and held until incoming QC checks chemistry and hardness. Accepted coils become a heat lot; rejects go back.",
    rejections: "A rejection note sends failed coils back and raises the debit note against the mill's bill.",
    inventory: "Every coil is a lot with its heat number and QC result, so a bolt in the field traces back to the heat it was forged from.",
    vendors: "Mills and plating chemical suppliers submit price changes; Finance approves them before costing uses them.",
  },
  make: {
    planning: "Orders become work orders through cold forging, threading, heat treatment and plating, with wire rod shortages shown against them.",
    production: "The shop floor: headers, thread rollers, the hardening furnace and the plating line, what is running and who is operating it.",
  },
  ship: {
    despatch: "Only inspected, allocated boxes leave. The challan records the vehicle and heat lots loaded, so every box traces back.",
    packing: "25 kg cartons, forty to a pallet, with net and gross weight per pallet.",
    packingDoc: "Packing list",
  },
  money: {
    costingTitle: "Part costing, on today's rates",
    costing: "What every part costs at the currently approved wire rod and zinc rates, so a steel price rise shows up in margin the day it is approved.",
  },
  summary: "Drawing to forging to box to invoice, every box traceable to its heat.",
});

const HARVEST = manufacturing({
  company: "Harvest Grove",
  journey: "This tour follows one order for garam masala: from a modern-trade buyer's purchase order, through the coriander, cumin and pepper it is blended from, to the cartons that leave with a batch and best-before on every label, and the receipt in the bank.",
  product: "masala, mix or seasoning",
  develop: {
    projects: "Product development, from brief to shelf|A retailer asks for a private-label soup premix. The brief opens a development project with its target price, claims and shelf life; trial batches and tastings hang off it.",
    specs: "Recipes, by weight and versioned|Every SKU is a recipe held by weight, pouch film and carton included, versioned and costed live on approved ingredient rates. The approved version is what the cost sheet freezes.",
    docs: "FSSAI licences, lab reports and specifications|Product specifications, certificates of analysis, aflatoxin and micro reports and shelf-life studies, attached to the SKU, ingredient or supplier they cover, with expiry tracked.",
    items: "Finished SKUs and the spices, oils, film and cartons they consume are items; the standard BOM says what one tonne of each blend draws from stores.",
  },
  sell: {
    costSheet: "Ingredients at today's approved rates, plus blending, packing, overhead and margin, give the floor Sales may quote. A cumin price rise reaches the floor the day it is approved.",
    quotation: "The quoted rate per kg is checked against the approved cost sheet; the proforma prints from here for the buyer's category team.",
    order: "Distributor and modern-trade orders are confirmed against each customer's credit limit, with four eyes on every confirmation.",
  },
  buy: {
    requisition: "Planning raises requisitions for whole spices by origin and grade, and for pouch film and shipper cartons.",
    rfq: "One inquiry for Unjha cumin went to three traders; their quotes were compared on landed rate, lead time and residue certificates before one was chosen.",
    grn: "Spice lots are received against the order and held until QC checks moisture, aflatoxin and extraneous matter. Accepted quantity becomes a lot; rejected quantity goes back.",
    rejections: "A rejection note sends a failed lot back and raises the debit note against the trader's bill.",
    inventory: "Every lot with its origin, QC result and age, so the oldest stock is issued first and a recall traces to the bag.",
    vendors: "Spice traders submit price changes from their own portal; Finance approves them before costing uses them.",
  },
  make: {
    planning: "Orders become blending and packing work orders, with ingredient and film shortages shown against them.",
    production: "Blenders and form-fill-seal lines: what is running, which batch, and who is on shift.",
  },
  ship: {
    despatch: "Only released batches leave, the earliest best-before first. The challan records the vehicle and batches loaded.",
    packing: "Shipper cartons of retail pouches, sixty to a pallet, with batch and best-before per carton.",
    packingDoc: "Packing list",
  },
  money: {
    costingTitle: "Recipe costing, on today's rates",
    costing: "What every SKU costs at the currently approved ingredient rates, so a chilli crop failure shows up in margin the day prices move.",
  },
  summary: "Recipe to batch to carton to invoice, every carton traceable to its batch.",
});

const MERIDIAN = manufacturing({
  company: "Meridian",
  journey: "This tour follows one order from a supermarket chain: Sona Masoori rice bought by the truck from a mill, repacked into 1 kg packs, and delivered on a route, with the credit limit checked before it leaves and the margin known on every line.",
  product: "rice, dal, sugar, oil or atta",
  develop: {
    projects: "|",
    specs: "|",
    docs: "Lab reports and FSSAI records|Moisture, broken-grain and FFA reports for every lot, and the licences and declarations each mill and refinery must keep current, with expiry tracked.",
    items: "Every pack size sold and the bulk stock it comes from are items; the standard BOM says how much bulk rice and how many pouches one tonne of 1 kg packs uses.",
  },
  sell: {
    costSheet: "Landed cost at today's approved buying rate, plus repacking, freight and margin, gives the floor Sales may quote. On a 9% margin business, a stale rate is a loss.",
    quotation: "The quoted rate per kg is checked against the margin sheet before it goes to the buyer.",
    order: "Every order is checked against the customer's credit limit and overdue bills before it can be confirmed. An override needs a second signature.",
  },
  buy: {
    requisition: "Branches raise requisitions when bulk stock falls below its reorder level.",
    rfq: "One inquiry for toor dal went to three mills; their quotes were compared on landed rate and moisture before one was chosen.",
    grn: "Trucks are weighed and received against the order and held until QC checks moisture, brokens and infestation. Accepted bags become a lot; rejected bags go back on the same truck.",
    rejections: "A rejection note sends the failed bags back and raises the debit note against the mill's bill.",
    inventory: "Bulk stock across the Pune and Hyderabad godowns and the oil tanks, with what is free, what is allocated and how old it is.",
    vendors: "Mills and refineries submit rate changes from their own portal; Finance approves them before margin sheets use them.",
  },
  make: {
    planning: "Confirmed orders become repacking jobs, with pouch and bottle shortages shown against them.",
    production: "The repacking floor: weigh-fill lines and the oil filler, what is running and who is on shift.",
  },
  ship: {
    despatch: "Packed stock leaves by route, with the vehicle and lots on the challan.",
    packing: "Bales of 30 × 1 kg packs, 50 kg sacks and oil cartons, with net and gross weight per package.",
    packingDoc: "Packing list",
  },
  money: {
    costingTitle: "Landed cost and margin, on today's rates",
    costing: "What every pack costs to land and repack at the currently approved buying rates, so a margin that has gone negative is visible before the next order is taken.",
  },
  summary: "Mill to godown to pack to route to cash, with margin known on every line.",
});

const LOOMCRAFT = manufacturing({
  company: "Loomcraft",
  journey: "This tour follows one order for navy poplin: from a garment exporter's purchase order, through the cotton bales and reactive dye it is spun, woven and dyed from, to the rolls that leave tagged by shade and lot, and the payment in the bank.",
  product: "yarn count or fabric quality",
  develop: {
    projects: "Sampling and development|An exporter's buyer wants a recycled-cotton knitting yarn. The brief opens a development project with the count, blend and target price; lab spins, knitting trials and approvals hang off it.",
    specs: "Constructions, versioned and costed|Every quality is a construction held by weight: fibre mixing, yarn, sizing, dyes and chemicals, versioned and costed live on approved rates. The approved version is what the cost sheet freezes.",
    docs: "Test reports and certificates|Fastness, strength and count reports, bale HVI reports and buyer certificates, attached to the quality, fibre or supplier they cover, with expiry tracked.",
    items: "Yarns, fabrics and the fibre, dyes and chemicals they consume are items; the standard BOM says what one tonne of each quality draws from the bale godown and dye store.",
  },
  sell: {
    costSheet: "Cotton at today's approved rate, plus spinning, weaving, processing, overhead and margin, give the floor Sales may quote. A cotton price move reaches the floor the day it is approved.",
    quotation: "The quoted rate per kg is checked against the approved cost sheet; the proforma prints from here for the exporter's merchandiser.",
    order: "Exporter and converter orders are confirmed against each customer's credit limit, with four eyes on every confirmation.",
  },
  buy: {
    requisition: "Planning raises requisitions for cotton by station and staple, polyester fibre, and dyes by shade.",
    rfq: "One inquiry for Shankar-6 cotton went to three ginners; their quotes were compared on rate, HVI results and lead time before one was chosen.",
    grn: "Bales are received against the order with their HVI report and held until the lab checks staple, micronaire and trash. Accepted bales become a lot; rejected bales go back.",
    rejections: "A rejection note sends failed bales back and raises the debit note against the ginner's bill.",
    inventory: "Bales, yarn and dyes as lots with their test results, so a shade complaint traces back to the dye lot and the bale mixing.",
    vendors: "Ginners and dye makers submit price changes from their own portal; Finance approves them before costing uses them.",
  },
  make: {
    planning: "Orders become spinning, weaving and dyeing work orders, with fibre and dye shortages shown against them; outside dye houses appear as job work.",
    production: "Ring frames, looms and soft-flow machines: what is running, which lot, and who is on shift.",
  },
  ship: {
    despatch: "Only inspected rolls and bags leave. The challan records the vehicle and the lots and shades loaded.",
    packing: "Yarn in 50 kg bags and fabric in 100 kg rolls, with net and gross weight per package and shade per roll.",
    packingDoc: "Packing list",
  },
  money: {
    costingTitle: "Fabric costing, on today's rates",
    costing: "What every yarn and fabric costs at the currently approved cotton and dye rates, so a cotton rally shows up in margin the day it is approved.",
  },
  summary: "Bale to yarn to fabric to roll to invoice, every roll traceable to its lot.",
});

// ─────────────────────────────────────────────────────────────────────────────
// Raj Enterprises: services, people and planning
// ─────────────────────────────────────────────────────────────────────────────

type SvcWords = {
  company: string;
  journey: string;
  clients: string;
  contacts: string;
  activity: string;
  engagements: [title: string, body: string];
  plan: string;
  timeline: string;
  timesheets: string;
  people: [title: string, body: string];
  attendance: string;
  leave: string;
  payroll: string;
  billing: [title: string, body: string];
  providers: [title: string, body: string];
  providerBills: [title: string, body: string];
  journal: string;
  summary: string;
  nouns: { engagement: string; provider: string; staff: string };
};

function services(w: SvcWords): TourStep[] {
  return [
    ...orientation(w.company, w.journey),
    {
      id: "clients", chapter: "clients", route: "/customers", target: "grid",
      title: "Clients, with their terms and exposure", body: w.clients,
      who: "Business development", doc: "Client register", docKind: "report",
    },
    {
      id: "contacts", chapter: "clients", route: "/customers/contacts", target: "grid",
      title: "The people on the client side", body: w.contacts,
      who: "Business development", doc: "Contact list", docKind: "report",
    },
    {
      id: "activity", chapter: "clients", route: "/customers/activity", target: "grid",
      title: "Every conversation on record", body: w.activity,
      who: "Business development and project managers", doc: "Client activity log", docKind: "report",
    },
    {
      id: "engagements", chapter: "deliver", route: "/engagements", target: "grid",
      title: w.engagements[0], body: w.engagements[1],
      who: "Project managers", doc: `${w.nouns.engagement} register`, docKind: "report",
    },
    {
      id: "engagement", chapter: "deliver", route: "/engagements", openFirst: true, target: "record-header",
      title: "The plan, to the task", body: w.plan,
      who: "Project manager", doc: `${w.nouns.engagement} status report`, docKind: "document",
    },
    {
      id: "timeline", chapter: "deliver", route: "/engagements/timeline", target: "main",
      title: `Every ${w.nouns.engagement.toLowerCase()} on one timeline`, body: w.timeline,
      who: "Director and PMO", doc: "Portfolio plan", docKind: "page",
    },
    {
      id: "timesheets", chapter: "deliver", route: "/engagements/timesheets", target: "grid",
      title: "Timesheets feed cost and billing", body: w.timesheets,
      who: `Every ${w.nouns.staff}; approved by the project manager`, doc: "Timesheet report", docKind: "report",
    },
    {
      id: "people", chapter: "people", route: "/people", target: "grid",
      title: w.people[0], body: w.people[1],
      who: "HR", doc: "Employee register", docKind: "report",
    },
    {
      id: "attendance", chapter: "people", route: "/people/attendance", target: "main",
      title: "Attendance, at a glance", body: w.attendance,
      who: "HR", doc: "Monthly attendance register", docKind: "page",
    },
    {
      id: "leave", chapter: "people", route: "/people/leave", target: "grid",
      title: "Leave, applied and approved", body: w.leave,
      who: "Managers and HR", doc: "Leave register", docKind: "report",
    },
    {
      id: "payroll", chapter: "people", route: "/people/payroll", openFirst: true, target: "record-header",
      title: "Payroll, from attendance to payslip", body: w.payroll,
      who: "HR and Finance", doc: "Payroll register", docKind: "document",
    },
    {
      id: "billing", chapter: "money", route: "/billing", target: "grid",
      title: w.billing[0], body: w.billing[1],
      who: "Finance", doc: "Billing register", docKind: "report",
    },
    {
      id: "providers", chapter: "money", route: "/procurement/vendors", target: "grid",
      title: w.providers[0], body: w.providers[1],
      who: "Operations and Finance", doc: `${w.nouns.provider} register`, docKind: "report",
    },
    {
      id: "provider-bills", chapter: "money", route: "/finance/payable", target: "main",
      title: w.providerBills[0], body: w.providerBills[1],
      who: "Finance", doc: "Payables statement", docKind: "page",
    },
    {
      id: "journal", chapter: "money", route: "/finance/journal", target: "main",
      title: "Journal vouchers close the month", body: w.journal,
      who: "Finance", doc: "Journal voucher", docKind: "page",
    },
    ...closing(w.company, w.summary),
  ];
}

const RAJ = services({
  company: "Raj Enterprises",
  journey: "This tour follows one client engagement: a cleanroom validation for a pharma plant, from the client record and the task plan to the people who staff it, their timesheets, attendance and payroll, and the invoice that bills it.",
  clients: "Every pharma and FMCG client with its GSTIN, payment terms and credit limit, and what is outstanding against it.",
  contacts: "QA heads, plant managers and purchase contacts at every client, so the right person gets the protocol, the report and the invoice.",
  activity: "Calls, site visits, proposals and complaints, logged against the client, so a hand-over loses nothing.",
  engagements: ["Engagements: what was sold, and how it is going", "Each engagement carries the client, service line, contract value, budget hours and the hours burnt so far, so an overrun shows before it becomes a loss."],
  plan: "Every engagement is planned as tasks with owners, dates and milestones, drawn as a timeline with today's line through it. Progress is set against time elapsed, and hours booked against hours planned.",
  timeline: "The whole portfolio across the quarter: what starts, what ends, and which milestones are due this week. Resourcing clashes are visible before they happen.",
  timesheets: "Consultants book hours to engagement tasks, billable or not. Approved hours drive utilisation, engagement cost and time-and-material invoices.",
  people: ["About fifty people, one record each", "Each employee with department, grade, reporting line, location, cost and bill rate. The same record links their attendance, leave, payslips and timesheets."],
  attendance: "The month for everyone in one grid: present, at a client site from home, on leave or absent. Gaps show at once, and the month feeds paid days in payroll.",
  leave: "Requests by type with balance and reason. Approving one marks the days on attendance; several are waiting now.",
  payroll: "Each month's run computes basic, HRA and allowances on paid days, and deducts PF, ESI, professional tax and TDS. The run prints as a register; each line is a payslip.",
  billing: ["Billing and collections", "Milestone and monthly invoices per engagement, with what is paid, what is part-paid and what is overdue. Each invoice posts the receivable, revenue and GST."],
  providers: ["Service providers you depend on", "Calibration labs, manpower agencies, testing partners and transport, each with terms and rating. Their service orders and bills are tracked against the engagements they support."],
  providerBills: ["Provider bills, matched before they are paid", "Bills from service providers are matched to the service order before payment, so subcontracted work is paid once and on time."],
  journal: "Payroll accruals, depreciation and provisions go in as balanced vouchers; a posted voucher is reversed, never edited.",
  summary: "Client to plan to people to invoice, in one system.",
  nouns: { engagement: "Engagement", provider: "Service provider", staff: "consultant" },
});

const KESTREL = services({
  company: "Kestrel Projects",
  journey: "This tour follows one site project: an 11 kV substation and LT distribution for a foundry, from the client and the task plan to the crews on site, their timesheets and payroll, the running-account bills that invoice each milestone, and the subcontractors who helped build it.",
  clients: "Factories, warehouses, data centres and solar parks, each with its GSTIN, payment terms and credit limit, and what is outstanding on running-account bills.",
  contacts: "Project heads, facilities directors and accounts-payable contacts at every client, so drawings go to engineering and bills go to the person who certifies them.",
  activity: "Progress reviews, site inspections, tenders and complaints, logged against the client, so the next project manager starts with the whole history.",
  engagements: ["Projects: what was won, and how it is going", "Each project carries its client, line of work (electrical, utility, HVAC, solar, O&M), contract value, budget hours and hours burnt so far, so a site that is eating its margin shows before handover."],
  plan: "Every project is planned as tasks with owners, dates and milestones: drawings approved, panels energised, handover. Each milestone is what a running-account bill is raised against, and progress is set against the calendar.",
  timeline: "Every site across the quarter on one schedule: which projects start, which hand over, and which milestones are due this week. A crew double-booked across two sites shows here first.",
  timesheets: "Engineers, foremen and electricians book hours to project tasks every day from site. Approved hours drive crew utilisation and project cost against budget.",
  people: ["About fifty people, office and site", "Each person with department, grade, reporting line, site, cost and rate. Electricians, fitters and welders sit on the same record system as engineers, so payroll and timesheets agree."],
  attendance: "The month for every crew in one grid: on site, in office, on leave or absent. It feeds paid days into payroll, so site attendance and wages never disagree.",
  leave: "Leave by type with balance and reason, approved by the site lead. Approved days mark attendance and show up on the project schedule as capacity lost.",
  payroll: "Each month's run computes wages on paid days and deducts PF, ESI, professional tax and TDS for office staff and site crews alike. The run prints as a register; each line is a payslip.",
  billing: ["Running-account bills and collections", "A mobilisation advance, then one RA bill per milestone and a monthly fee for O&M contracts, with what is paid, part-paid and overdue. Each bill posts the receivable, revenue and GST."],
  providers: ["Subcontractors on every site", "Cable-laying gangs, scaffolding, cranes, insulation and testing partners, each with its licences, insurance and rating, and the projects it supports."],
  providerBills: ["Subcontractor bills, checked before they are paid", "Each subcontractor bill is matched to the work it covers before payment, so a cable gang is paid once, for the metres actually laid."],
  journal: "Depreciation on test kits and scaffolding, insurance and site accruals go in as balanced vouchers; a posted voucher is reversed, never edited.",
  summary: "Tender to site plan to crew to RA bill, in one system.",
  nouns: { engagement: "Project", provider: "Subcontractor", staff: "engineer and crew member" },
});

export const STEPS_BY_TENANT: Record<TenantKey, TourStep[]> = {
  tangent: TANGENT,
  duplast: DUPLAST,
  trident: TRIDENT,
  raj: RAJ,
  harvest: HARVEST,
  meridian: MERIDIAN,
  kestrel: KESTREL,
  loomcraft: LOOMCRAFT,
};
