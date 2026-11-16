/**
 * Kestrel Projects: an EPC contractor of about fifty people doing electrical,
 * mechanical, utility and rooftop-solar installations for factories and
 * warehouses, plus operation-and-maintenance contracts.
 *
 * Projects are planned to the task and billed by milestone (running-account
 * bills) or monthly for O&M; site crews book timesheets, attendance and payroll
 * off one employee record; subcontractors bill against the projects they serve.
 *
 * Every client, subcontractor and person here is invented for the demo.
 */
import { Role, Industry, ActivityKind, DocumentType, EngagementStatus, PostingSide } from "@prisma/client";
import type { Dept, Eng, Task, ServicesWorld } from "./services";

const ELEC = "Electrical Installation";
const MECH = "Mechanical & Utilities";
const DESIGN = "Design & Engineering";

// [designation, grade, monthly CTC, cost-to-bill rate per hour | null for overhead]
const DEPTS: Dept[] = [
  { name: "Management", roles: [["Managing Director", "M1", 450000, null]] },
  {
    name: ELEC,
    roles: [
      ["Electrical Lead", "L3", 135000, 2200], ["Senior Site Engineer, Electrical", "L2", 92000, 1600], ["Senior Site Engineer, Electrical", "L2", 88000, 1600],
      ["Site Engineer, Electrical", "L1", 58000, 1100], ["Site Engineer, Electrical", "L1", 56000, 1100], ["Site Engineer, Electrical", "L1", 54000, 1100],
      ["Electrician Foreman", "T3", 38000, 650], ["Electrician Foreman", "T3", 36000, 650], ["Electrician", "T2", 26000, 420], ["Electrician", "T2", 26000, 420],
      ["Electrician", "T2", 25000, 420], ["Electrician", "T2", 24000, 420], ["Electrician", "T2", 24000, 420], ["Helper", "T1", 18000, 300], ["Helper", "T1", 18000, 300],
      ["Helper", "T1", 17500, 300],
    ],
  },
  {
    name: MECH,
    roles: [
      ["Mechanical Lead", "L3", 128000, 2100], ["Senior Site Engineer, Mechanical", "L2", 88000, 1500], ["Site Engineer, Piping", "L1", 56000, 1050],
      ["Site Engineer, Piping", "L1", 54000, 1050], ["Pipe Fitter Foreman", "T3", 36000, 620], ["Pipe Fitter", "T2", 25000, 400], ["Pipe Fitter", "T2", 25000, 400],
      ["Pipe Fitter", "T2", 24000, 400], ["Welder, IBR certified", "T2", 30000, 480], ["Welder, IBR certified", "T2", 29000, 480], ["Helper", "T1", 18000, 300],
      ["Helper", "T1", 17500, 300],
    ],
  },
  {
    name: DESIGN,
    roles: [
      ["Design Manager", "L3", 140000, 2400], ["Electrical Design Engineer", "L2", 90000, 1700], ["Electrical Design Engineer", "L2", 86000, 1700],
      ["HVAC Design Engineer", "L2", 88000, 1700], ["Draughtsman, AutoCAD", "L0", 38000, 800], ["Draughtsman, AutoCAD", "L0", 36000, 800],
    ],
  },
  {
    name: "QA/QC & Safety",
    roles: [["QA/QC Engineer", "L1", 62000, 1000], ["QA/QC Engineer", "L1", 60000, 1000], ["Safety Officer", "L1", 55000, 900], ["Safety Officer", "L1", 52000, 900]],
  },
  { name: "PMO", roles: [["Head, PMO", "L3", 170000, null], ["Project Manager", "L2", 125000, 2000], ["Project Manager", "L2", 120000, 2000], ["Planning Engineer", "L1", 70000, null]] },
  { name: "Business Development", roles: [["Business Development Manager", "L2", 130000, null], ["Estimation Engineer", "L1", 72000, null]] },
  { name: "HR & Admin", roles: [["HR Manager", "L2", 90000, null], ["Site Admin Executive", "L0", 30000, null]] },
  { name: "Finance", roles: [["Finance Manager", "L2", 110000, null], ["Accounts Executive", "L0", 36000, null]] },
];

const CLIENTS: ServicesWorld["clients"] = [
  { name: "Oragadam Auto Castings", city: "Chennai", state: "Tamil Nadu", industry: Industry.AUTOMOTIVE, creditDays: 45, creditLimit: 30000000, late: 14, contacts: [["S. Raghavan", "Head, Projects"], ["Priya Venkat", "Purchase Manager"]] },
  { name: "Southern Electronics Assembly", city: "Sriperumbudur", state: "Tamil Nadu", industry: Industry.ELECTRICAL, creditDays: 60, creditLimit: 25000000, late: 28, contacts: [["Jason Thomas", "Facilities Director"]] },
  { name: "Bidadi Food Processing", city: "Bengaluru", state: "Karnataka", industry: Industry.FMCG, creditDays: 45, creditLimit: 18000000, late: 9, contacts: [["Anand Rao", "Engineering Head"], ["Sowmya K", "Accounts Payable"]] },
  { name: "Nelamangala Logistics Park", city: "Bengaluru", state: "Karnataka", industry: Industry.INFRASTRUCTURE, creditDays: 45, creditLimit: 22000000, late: 41, contacts: [["Rohit Bansal", "Development Manager"]] },
  { name: "Hosur Precision Gears", city: "Hosur", state: "Tamil Nadu", industry: Industry.ENGINEERING, creditDays: 45, creditLimit: 40000000, late: 6, contacts: [["K. Murali", "Plant Head"]] },
  { name: "Hyderabad Data Centre Campus", city: "Hyderabad", state: "Telangana", industry: Industry.INFRASTRUCTURE, creditDays: 30, creditLimit: 20000000, late: 4, contacts: [["Sandeep Reddy", "Critical Facilities Lead"]] },
  { name: "Mysuru Pharma Formulations", city: "Mysuru", state: "Karnataka", industry: Industry.PHARMA, creditDays: 45, creditLimit: 12000000, late: 12, contacts: [["Dr. Kavitha Shenoy", "Head, Engineering & QA"]] },
  { name: "Coimbatore Pump Works", city: "Coimbatore", state: "Tamil Nadu", industry: Industry.ENGINEERING, creditDays: 30, creditLimit: 10000000, late: 3, contacts: [["P. Senthil", "Managing Partner"]] },
  { name: "Kochi Cold Chain", city: "Kochi", state: "Kerala", industry: Industry.INFRASTRUCTURE, creditDays: 45, creditLimit: 14000000, late: 8, contacts: [["Joseph Kurian", "Director"]] },
  { name: "Tumakuru Solar Parks", city: "Tumakuru", state: "Karnataka", industry: Industry.ENERGY, creditDays: 60, creditLimit: 15000000, late: 63, contacts: [["Vinay Gowda", "Project Director"]] },
];

const ELEC_TASKS: Task[] = [
  ["Survey, load study and single-line diagram", 0, 10, false], ["Milestone: Drawings approved by client", 10, 0, true], ["Cable trays and earthing", 10, 24, false],
  ["HT and LT panel erection", 20, 20, false], ["Milestone: Panels energised", 42, 0, true], ["Cabling, terminations and lighting", 30, 30, false],
  ["Testing and commissioning", 60, 12, false], ["Milestone: Handover with as-built drawings", 74, 0, true],
];
const UTIL_TASKS: Task[] = [
  ["Site survey and P&ID", 0, 8, false], ["Milestone: P&ID approved", 8, 0, true], ["Pipe fabrication and supports", 8, 22, false],
  ["Equipment erection: chillers and compressors", 18, 18, false], ["Milestone: Mechanical completion", 40, 0, true], ["Hydro test and insulation", 36, 14, false],
  ["Commissioning and performance test", 50, 10, false], ["Milestone: Performance guarantee met", 60, 0, true],
];
const HVAC_TASKS: Task[] = [
  ["Heat-load calculation and duct design", 0, 10, false], ["Milestone: HVAC design approved", 10, 0, true], ["Ducting and AHU installation", 10, 24, false],
  ["Cleanroom panels and HEPA boxes", 20, 18, false], ["Milestone: Mechanical completion", 40, 0, true], ["Testing, adjusting and balancing", 38, 12, false],
  ["Milestone: Room classification certified", 52, 0, true],
];
const SOLAR_TASKS: Task[] = [
  ["Structural survey of the roof", 0, 8, false], ["Milestone: Design and load approval", 8, 0, true], ["Module mounting structure", 8, 20, false],
  ["Modules, inverters and DC cabling", 22, 18, false], ["Milestone: Grid synchronisation", 42, 0, true], ["Net-metering liaison", 36, 16, false],
  ["Milestone: Commissioning certificate", 54, 0, true],
];
const OM_TASKS: Task[] = [
  ["Mobilisation and site induction", 0, 7, false], ["Operation of substation, DG and UPS", 7, 150, false], ["Preventive maintenance schedule", 7, 150, false],
  ["Milestone: Quarter 1 service review", 90, 0, true], ["Breakdown response, 4-hour SLA", 7, 150, false], ["Milestone: Contract renewal review", 157, 0, true],
];

const ENGAGEMENTS: Eng[] = [
  { client: "Oragadam Auto Castings", name: "Foundry expansion: 11 kV substation and LT distribution", line: "Electrical EPC", status: EngagementStatus.ACTIVE, startAgo: 52, days: 96, value: 28500000, hours: 11000, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Southern Electronics Assembly", name: "SMT hall: HVAC and ISO 7 cleanroom", line: "HVAC & cleanroom", status: EngagementStatus.ACTIVE, startAgo: 34, days: 70, value: 18600000, hours: 6200, dept: MECH, tasks: HVAC_TASKS },
  { client: "Bidadi Food Processing", name: "Chilled water and compressed air network", line: "Mechanical & utility EPC", status: EngagementStatus.ACTIVE, startAgo: 46, days: 72, value: 14200000, hours: 5800, dept: MECH, tasks: UTIL_TASKS },
  { client: "Nelamangala Logistics Park", name: "Warehouse power, lighting and fire alarm", line: "Electrical EPC", status: EngagementStatus.ACTIVE, startAgo: 24, days: 84, value: 21800000, hours: 8800, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Hosur Precision Gears", name: "1.2 MWp rooftop solar", line: "Rooftop solar EPC", status: EngagementStatus.ACTIVE, startAgo: 30, days: 60, value: 45000000, hours: 4200, dept: ELEC, tasks: SOLAR_TASKS },
  { client: "Hyderabad Data Centre Campus", name: "Electrical O&M: substation, DG sets and UPS", line: "Operation & maintenance", status: EngagementStatus.ACTIVE, startAgo: 72, days: 160, value: 9600000, hours: 7600, dept: ELEC, tasks: OM_TASKS },
  { client: "Mysuru Pharma Formulations", name: "Utility O&M: purified water, HVAC, compressors", line: "Operation & maintenance", status: EngagementStatus.ACTIVE, startAgo: 40, days: 160, value: 7200000, hours: 6400, dept: MECH, tasks: OM_TASKS },
  { client: "Coimbatore Pump Works", name: "Test-bay power and 500 kVA DG set", line: "Electrical EPC", status: EngagementStatus.ACTIVE, startAgo: 14, days: 60, value: 8400000, hours: 3200, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Kochi Cold Chain", name: "Cold store refrigeration piping and insulation", line: "Mechanical & utility EPC", status: EngagementStatus.ACTIVE, startAgo: 8, days: 72, value: 12600000, hours: 5000, dept: MECH, tasks: UTIL_TASKS },
  { client: "Oragadam Auto Castings", name: "Melting shop: compressed air ring main", line: "Mechanical & utility EPC", status: EngagementStatus.COMPLETED, startAgo: 150, days: 60, value: 6800000, hours: 2600, dept: MECH, tasks: UTIL_TASKS },
  { client: "Southern Electronics Assembly", name: "Phase 1: LT panels and busduct", line: "Electrical EPC", status: EngagementStatus.COMPLETED, startAgo: 190, days: 84, value: 16400000, hours: 6600, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Bidadi Food Processing", name: "Packing hall HVAC", line: "HVAC & cleanroom", status: EngagementStatus.COMPLETED, startAgo: 125, days: 60, value: 9800000, hours: 3600, dept: MECH, tasks: HVAC_TASKS },
  { client: "Tumakuru Solar Parks", name: "Inverter room and evacuation line", line: "Electrical EPC", status: EngagementStatus.ON_HOLD, startAgo: 64, days: 84, value: 11200000, hours: 4400, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Hosur Precision Gears", name: "Heat-treatment shop: power distribution", line: "Electrical EPC", status: EngagementStatus.COMPLETED, startAgo: 110, days: 70, value: 7600000, hours: 3000, dept: ELEC, tasks: ELEC_TASKS },
  { client: "Mysuru Pharma Formulations", name: "OSD block: HVAC design review", line: "HVAC & cleanroom", status: EngagementStatus.COMPLETED, startAgo: 160, days: 40, value: 3200000, hours: 1200, dept: DESIGN, tasks: HVAC_TASKS },
  { client: "Hyderabad Data Centre Campus", name: "Phase 2: 33 kV substation and UPS rooms", line: "Electrical EPC", status: EngagementStatus.PROPOSED, startAgo: -25, days: 120, value: 64000000, hours: 22000, dept: ELEC, tasks: ELEC_TASKS },
];

export const KESTREL: ServicesWorld = {
  label: "Kestrel",
  seed: 0x6b35,
  password: "Kestrel@2026",
  domain: "kestrel.demo",
  empPrefix: "KP",
  offices: ["Chennai", "Bengaluru", "Chennai"],
  zone: "Industrial Estate",
  staff: [
    { email: "admin@kestrel.demo", role: Role.ADMIN, jobTitle: "IT & Systems" },
    { email: "director@kestrel.demo", role: Role.MANAGEMENT, jobTitle: "Managing Director", employee: "Managing Director" },
    { email: "pm@kestrel.demo", role: Role.PROJECT_MANAGER, jobTitle: "Head, PMO", employee: "Head, PMO" },
    { email: "hr@kestrel.demo", role: Role.HR, jobTitle: "HR Manager", employee: "HR Manager" },
    { email: "finance@kestrel.demo", role: Role.FINANCE, jobTitle: "Finance Manager", employee: "Finance Manager" },
    { email: "bd@kestrel.demo", role: Role.SALES, jobTitle: "Business Development Manager", employee: "Business Development Manager" },
  ],
  fixedNames: {
    "Managing Director": "Ravichandran Iyer", "Head, PMO": "Deepa Krishnan", "HR Manager": "Fathima Rahman",
    "Finance Manager": "Venkatesh Rao", "Business Development Manager": "Nikhil Hegde",
  },
  depts: DEPTS,
  siteDepts: [ELEC, MECH, "QA/QC & Safety"],
  siteHours: [5, 7.5],
  teamSize: { [ELEC]: 7, [MECH]: 6, [DESIGN]: 3, "QA/QC & Safety": 2 },
  clients: CLIENTS,
  clientActs: ["Monthly progress review with the client's engineering team", "Discussed the next milestone, inspection dates and site access"],
  extraActs: [
    { client: "Hyderabad Data Centre Campus", kind: ActivityKind.QUOTE_SENT, subject: "Tender submitted: Phase 2 substation and UPS rooms, ₹6.4 crore", days: 5, by: "sales" },
    { client: "Tumakuru Solar Parks", kind: ActivityKind.COMPLAINT, subject: "Inverter room work paused: client's land-lease approval pending", days: 21, by: "pm" },
  ],
  recurringLines: ["Operation & maintenance"],
  slipping: "Nelamangala Logistics Park",
  engagements: ENGAGEMENTS,
  providers: [
    { code: "SP-0001", name: "Ravi Cable Laying Contractors", city: "Chennai", state: "Tamil Nadu", contact: "Ravi Shankar", monthly: 640000 },
    { code: "SP-0002", name: "Deccan Scaffolding & Access", city: "Bengaluru", state: "Karnataka", contact: "Mohammed Irfan", monthly: 280000 },
    { code: "SP-0003", name: "Marina Crane Services", city: "Chennai", state: "Tamil Nadu", contact: "Arul Doss", monthly: 210000 },
    { code: "SP-0004", name: "Noyyal Insulation Works", city: "Coimbatore", state: "Tamil Nadu", contact: "Bala Subramani", monthly: 360000 },
    { code: "SP-0005", name: "Precision Testing & Commissioning", city: "Bengaluru", state: "Karnataka", contact: "Shreyas Bhat", monthly: 190000 },
    { code: "SP-0006", name: "Hosur Site Labour Supply", city: "Hosur", state: "Tamil Nadu", contact: "Gopi Nathan", monthly: 520000 },
  ],
  providerDocs: ["Electrical contractor licence, Grade A", "Scaffolding inspection certificate and insurance", "Crane fitness certificate and operator licences"],
  docs: [
    ["Method statement: HT cable termination", DocumentType.SPEC_SHEET], ["Inspection and test plan: LT panels", DocumentType.SPEC_SHEET],
    ["Hydro test report, chilled water line, Bidadi", DocumentType.TEST_REPORT], ["Commissioning report, Phase 1 LT panels", DocumentType.TEST_REPORT],
    ["Earth pit resistance test report, Oragadam", DocumentType.TEST_REPORT], ["As-built drawings, melting shop air ring main", DocumentType.DRAWING],
    ["HSE plan and permit-to-work procedure", DocumentType.OTHER], ["Site induction and toolbox talk register", DocumentType.OTHER],
  ],
  jvs: [
    { days: 70, remark: "Depreciation on test kits, welding sets and scaffolding, Q2", lines: [["5300", PostingSide.DEBIT, 238000], ["1610", PostingSide.CREDIT, 238000]] },
    { days: 42, remark: "Contractor's all-risk insurance, prepaid for 12 months", lines: [["1300", PostingSide.DEBIT, 396000], ["1000", PostingSide.CREDIT, 396000]] },
    { days: 41, remark: "Insurance expensed for the month", lines: [["5500", PostingSide.DEBIT, 33000], ["1300", PostingSide.CREDIT, 33000]] },
    { days: 18, remark: "Site accommodation and travel accrued, Bengaluru projects", lines: [["5900", PostingSide.DEBIT, 186000], ["2200", PostingSide.CREDIT, 186000]] },
    { days: 6, remark: "Gratuity provision for site crews, half year", lines: [["5700", PostingSide.DEBIT, 264000], ["2200", PostingSide.CREDIT, 264000]] },
  ],
};
