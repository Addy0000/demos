/**
 * Raj Enterprises: a services firm of about fifty people doing validation,
 * compliance, calibration and facility work for pharma and FMCG plants.
 *
 * Clients and their contacts; engagements planned to the task; consultants
 * whose timesheets, attendance, leave and payroll all hang off one employee
 * record; service providers and their bills; and milestone billing with
 * collections. Ledger postings follow the app's rules so the books balance.
 *
 * Client and provider names are illustrative for the demo.
 */
import { Role, Industry, ActivityKind, DocumentType, EngagementStatus, PostingSide } from "@prisma/client";
import type { Dept, Eng, Task, ServicesWorld } from "./services";


const STAFF_USERS: ServicesWorld["staff"] = [
  { email: "admin@raj.demo", role: Role.ADMIN, jobTitle: "IT & Systems" },
  { email: "director@raj.demo", role: Role.MANAGEMENT, jobTitle: "Managing Director", employee: "Managing Director" },
  { email: "pmo@raj.demo", role: Role.PROJECT_MANAGER, jobTitle: "Head, PMO", employee: "Head, PMO" },
  { email: "hr@raj.demo", role: Role.HR, jobTitle: "HR Manager", employee: "HR Manager" },
  { email: "finance@raj.demo", role: Role.FINANCE, jobTitle: "Finance Manager", employee: "Finance Manager" },
  { email: "bd@raj.demo", role: Role.SALES, jobTitle: "Business Development Manager", employee: "Business Development Manager" },
];

// [designation, grade, monthly CTC, bill rate per hour | null for overhead]
const DEPTS: Dept[] = [
  { name: "Management", roles: [["Managing Director", "M1", 425000, null]] },
  {
    name: "Validation Services",
    roles: [
      ["Validation Lead", "L3", 145000, 2400], ["Senior Validation Engineer", "L2", 98000, 1800], ["Senior Validation Engineer", "L2", 94000, 1800],
      ["Validation Engineer", "L1", 62000, 1300], ["Validation Engineer", "L1", 60000, 1300], ["Validation Engineer", "L1", 58000, 1300],
      ["Validation Engineer", "L1", 56000, 1300], ["Associate Engineer", "L0", 36000, 900], ["Associate Engineer", "L0", 34000, 900],
      ["Associate Engineer", "L0", 33000, 900], ["HVAC Test Technician", "T2", 32000, 750], ["HVAC Test Technician", "T2", 30000, 750],
    ],
  },
  {
    name: "Regulatory & QA Consulting",
    roles: [
      ["Principal Consultant", "L3", 175000, 3200], ["Senior QA Consultant", "L2", 115000, 2200], ["QA Consultant", "L1", 78000, 1600],
      ["QA Consultant", "L1", 74000, 1600], ["CSV Specialist", "L2", 105000, 2100], ["Regulatory Associate", "L0", 42000, 1000],
      ["Documentation Specialist", "L0", 38000, 850], ["Data Integrity Analyst", "L1", 68000, 1500], ["Audit Associate", "L0", 40000, 950],
    ],
  },
  {
    name: "Calibration",
    roles: [
      ["Calibration Manager", "L2", 92000, 1500], ["Metrology Engineer", "L1", 52000, 1000], ["Calibration Technician", "T2", 31000, 650],
      ["Calibration Technician", "T2", 29000, 650], ["Calibration Technician", "T1", 26000, 600], ["Calibration Technician", "T1", 25000, 600],
    ],
  },
  {
    name: "Facility & Utility Services",
    roles: [
      ["Facility Services Manager", "L2", 96000, 1400], ["Site Supervisor", "T3", 42000, 700], ["Site Supervisor", "T3", 40000, 700],
      ["Utility Technician", "T2", 28000, 450], ["Utility Technician", "T2", 27000, 450], ["Utility Technician", "T2", 27000, 450],
      ["Utility Technician", "T1", 24000, 420], ["Utility Technician", "T1", 23000, 420], ["Utility Technician", "T1", 23000, 420],
      ["Housekeeping Supervisor", "T2", 26000, 400], ["Pest Control Technician", "T1", 22000, 380],
    ],
  },
  { name: "PMO", roles: [["Head, PMO", "L3", 165000, null], ["Project Manager", "L2", 118000, 1900], ["Project Coordinator", "L0", 45000, null]] },
  { name: "Business Development", roles: [["Business Development Manager", "L2", 120000, null], ["Proposal Engineer", "L1", 64000, null]] },
  { name: "HR & Admin", roles: [["HR Manager", "L2", 88000, null], ["Admin Executive", "L0", 32000, null]] },
  { name: "Finance", roles: [["Finance Manager", "L2", 102000, null], ["Accounts Executive", "L0", 36000, null]] },
];


const CLIENTS: { name: string; city: string; state: string; industry: Industry; creditDays: number; creditLimit: number; late: number; contacts: [string, string][] }[] = [
  { name: "Sunrise Pharma Labs", city: "Ahmedabad", state: "Gujarat", industry: Industry.PHARMA, creditDays: 45, creditLimit: 6000000, late: 12, contacts: [["Dr. Nitin Sheth", "Head, Quality Assurance"], ["Kiran Vora", "Engineering Manager"]] },
  { name: "Kaveri Formulations", city: "Bengaluru", state: "Karnataka", industry: Industry.PHARMA, creditDays: 60, creditLimit: 5000000, late: 34, contacts: [["Anitha Rao", "QA Manager"], ["Prakash Gowda", "Plant Head"]] },
  { name: "Navjeevan Healthcare", city: "Mumbai", state: "Maharashtra", industry: Industry.PHARMA, creditDays: 45, creditLimit: 5000000, late: 6, contacts: [["Dr. Swati Kelkar", "Director, Quality"]] },
  { name: "Ojas Biologics", city: "Hyderabad", state: "Telangana", industry: Industry.PHARMA, creditDays: 60, creditLimit: 7000000, late: 18, contacts: [["Ravi Teja", "Validation Head"], ["Sravani K", "Purchase"]] },
  { name: "Medicure Injectables", city: "Baddi", state: "Himachal Pradesh", industry: Industry.PHARMA, creditDays: 45, creditLimit: 4000000, late: 72, contacts: [["Harish Thakur", "Plant Manager"]] },
  { name: "GreenLeaf Foods", city: "Pune", state: "Maharashtra", industry: Industry.FMCG, creditDays: 30, creditLimit: 3000000, late: 3, contacts: [["Sonal Bhide", "Facilities Head"]] },
  { name: "Swastik Home Care", city: "Vapi", state: "Gujarat", industry: Industry.FMCG, creditDays: 30, creditLimit: 2500000, late: 10, contacts: [["Paresh Modi", "Operations Manager"]] },
  { name: "Amrit Dairy Products", city: "Anand", state: "Gujarat", industry: Industry.FMCG, creditDays: 30, creditLimit: 2500000, late: 4, contacts: [["Jayesh Patel", "QA & Food Safety"]] },
  { name: "Coastal Nutraceuticals", city: "Verna", state: "Goa", industry: Industry.PHARMA, creditDays: 45, creditLimit: 3000000, late: 9, contacts: [["Leanne Fernandes", "QA Lead"]] },
  { name: "Vedic Personal Care", city: "Haridwar", state: "Uttarakhand", industry: Industry.FMCG, creditDays: 30, creditLimit: 2000000, late: 15, contacts: [["Ankur Saini", "Plant Head"]] },
];

const PROVIDERS = [
  { code: "SP-0001", name: "Precision Calibration Labs", city: "Mumbai", state: "Maharashtra", contact: "Ajit Phadke", monthly: 180000 },
  { code: "SP-0002", name: "Skyline Manpower Services", city: "Ahmedabad", state: "Gujarat", contact: "Neha Chokshi", monthly: 420000 },
  { code: "SP-0003", name: "CleanAir Test Instruments", city: "Pune", state: "Maharashtra", contact: "Rohan Apte", monthly: 95000 },
  { code: "SP-0004", name: "Unitech Lab Testing", city: "Hyderabad", state: "Telangana", contact: "Sridevi M", monthly: 130000 },
  { code: "SP-0005", name: "SafeRoute Travel Desk", city: "Mumbai", state: "Maharashtra", contact: "Imran Khan", monthly: 160000 },
  { code: "SP-0006", name: "DataSafe IT Services", city: "Mumbai", state: "Maharashtra", contact: "Kunal Shah", monthly: 65000 },
];

// tasks: [name, start offset in days, duration in days, milestone]
const VAL_TASKS: Task[] = [
  ["Kick-off and URS review", 0, 6, false], ["Validation master plan", 4, 10, false], ["Milestone: VMP approved by client QA", 14, 0, true],
  ["IQ protocol and execution", 14, 18, false], ["OQ protocol and execution", 28, 22, false], ["Milestone: IQ/OQ reports signed", 50, 0, true],
  ["PQ runs, three consecutive", 48, 26, false], ["Final report and handover", 74, 10, false], ["Milestone: Summary report approved", 84, 0, true],
];
const HVAC_TASKS: Task[] = [
  ["Site survey and test plan", 0, 5, false], ["Airflow velocity and ACPH", 5, 12, false], ["HEPA filter integrity (DOP/PAO)", 12, 14, false],
  ["Milestone: Grade B/C areas cleared", 26, 0, true], ["Particle count and recovery", 24, 16, false], ["Microbial monitoring support", 30, 18, false],
  ["Report and certificate", 46, 8, false], ["Milestone: Requalification certificate issued", 54, 0, true],
];
const QA_TASKS: Task[] = [
  ["Gap assessment against Schedule M", 0, 14, false], ["Milestone: Gap report presented", 14, 0, true], ["SOP rewrite, quality systems", 12, 30, false],
  ["CAPA and change control set-up", 26, 24, false], ["Data integrity remediation", 30, 34, false], ["Mock regulatory audit", 64, 8, false],
  ["Milestone: Audit-ready sign-off", 74, 0, true],
];
const FM_TASKS: Task[] = [
  ["Mobilisation and induction", 0, 7, false], ["Utility O&M, purified water and HVAC", 7, 150, false], ["Preventive maintenance schedule", 7, 150, false],
  ["Milestone: Quarter 1 service review", 90, 0, true], ["Housekeeping and pest control", 7, 150, false], ["Milestone: Contract renewal review", 157, 0, true],
];
const CAL_TASKS: Task[] = [
  ["Instrument inventory and schedule", 0, 6, false], ["In-house calibration, pressure and temperature", 6, 30, false], ["NABL lab calibrations", 10, 30, false],
  ["Milestone: Calibration certificates issued", 42, 0, true], ["Calibration status labelling and database", 36, 10, false],
];
const CSV_TASKS: Task[] = [
  ["System inventory and GxP assessment", 0, 10, false], ["Validation plan, LIMS and SCADA", 8, 12, false], ["Milestone: CSV plan approved", 20, 0, true],
  ["Risk assessment and test scripts", 20, 20, false], ["Test execution and deviations", 38, 24, false], ["Traceability matrix and report", 60, 10, false],
  ["Milestone: Systems released for GxP use", 70, 0, true],
];

const ENGAGEMENTS: Eng[] = [
  { client: "Sunrise Pharma Labs", name: "Oral solid dosage block: equipment qualification", line: "Equipment qualification (IQ/OQ/PQ)", status: EngagementStatus.ACTIVE, startAgo: 48, days: 86, value: 3800000, hours: 1900, dept: "Validation Services", tasks: VAL_TASKS },
  { client: "Ojas Biologics", name: "Aseptic fill line: cleanroom requalification", line: "Cleanroom & HVAC validation", status: EngagementStatus.ACTIVE, startAgo: 30, days: 56, value: 2200000, hours: 1100, dept: "Validation Services", tasks: HVAC_TASKS },
  { client: "Kaveri Formulations", name: "Schedule M readiness and SOP overhaul", line: "Regulatory & QA consulting", status: EngagementStatus.ACTIVE, startAgo: 55, days: 76, value: 2900000, hours: 1300, dept: "Regulatory & QA Consulting", tasks: QA_TASKS },
  { client: "Navjeevan Healthcare", name: "LIMS and SCADA computer system validation", line: "CSV & data integrity", status: EngagementStatus.ACTIVE, startAgo: 26, days: 72, value: 2600000, hours: 1150, dept: "Regulatory & QA Consulting", tasks: CSV_TASKS },
  { client: "GreenLeaf Foods", name: "Facility management, Chakan plant", line: "Facility management", status: EngagementStatus.ACTIVE, startAgo: 70, days: 160, value: 4800000, hours: 5200, dept: "Facility & Utility Services", tasks: FM_TASKS },
  { client: "Swastik Home Care", name: "Utility O&M and housekeeping, Vapi", line: "Facility management", status: EngagementStatus.ACTIVE, startAgo: 40, days: 160, value: 3100000, hours: 4100, dept: "Facility & Utility Services", tasks: FM_TASKS },
  { client: "Medicure Injectables", name: "Annual calibration, QC and production", line: "Calibration services", status: EngagementStatus.ACTIVE, startAgo: 22, days: 46, value: 950000, hours: 520, dept: "Calibration", tasks: CAL_TASKS },
  { client: "Amrit Dairy Products", name: "Calibration and metrology, dairy plant", line: "Calibration services", status: EngagementStatus.ACTIVE, startAgo: 12, days: 46, value: 680000, hours: 380, dept: "Calibration", tasks: CAL_TASKS },
  { client: "Coastal Nutraceuticals", name: "Warehouse temperature mapping and HVAC", line: "Cleanroom & HVAC validation", status: EngagementStatus.ACTIVE, startAgo: 8, days: 56, value: 1150000, hours: 560, dept: "Validation Services", tasks: HVAC_TASKS },
  { client: "Medicure Injectables", name: "Media fill support and HVAC requalification", line: "Cleanroom & HVAC validation", status: EngagementStatus.COMPLETED, startAgo: 135, days: 56, value: 1900000, hours: 950, dept: "Validation Services", tasks: HVAC_TASKS },
  { client: "Kaveri Formulations", name: "Warehouse and cold room temperature mapping", line: "Cleanroom & HVAC validation", status: EngagementStatus.COMPLETED, startAgo: 105, days: 40, value: 1250000, hours: 600, dept: "Validation Services", tasks: HVAC_TASKS },
  { client: "Ojas Biologics", name: "Data integrity remediation, QC lab", line: "CSV & data integrity", status: EngagementStatus.ON_HOLD, startAgo: 60, days: 72, value: 1800000, hours: 800, dept: "Regulatory & QA Consulting", tasks: CSV_TASKS },
  { client: "Sunrise Pharma Labs", name: "Injectable block: cleanroom qualification", line: "Cleanroom & HVAC validation", status: EngagementStatus.COMPLETED, startAgo: 150, days: 56, value: 2100000, hours: 1050, dept: "Validation Services", tasks: HVAC_TASKS },
  { client: "Kaveri Formulations", name: "Process validation, three products", line: "Equipment qualification (IQ/OQ/PQ)", status: EngagementStatus.COMPLETED, startAgo: 190, days: 86, value: 3300000, hours: 1700, dept: "Validation Services", tasks: VAL_TASKS },
  { client: "Vedic Personal Care", name: "GMP gap assessment, Haridwar", line: "Regulatory & QA consulting", status: EngagementStatus.COMPLETED, startAgo: 120, days: 76, value: 1400000, hours: 650, dept: "Regulatory & QA Consulting", tasks: QA_TASKS },
  { client: "Navjeevan Healthcare", name: "New oncology block: validation master plan", line: "Equipment qualification (IQ/OQ/PQ)", status: EngagementStatus.PROPOSED, startAgo: -20, days: 86, value: 5600000, hours: 2600, dept: "Validation Services", tasks: VAL_TASKS },
];

export const RAJ: ServicesWorld = {
  label: "Raj",
  seed: 0x4a1e,
  password: "Raj@2026",
  domain: "raj.demo",
  empPrefix: "RE",
  offices: ["Ahmedabad", "Mumbai", "Mumbai"],
  zone: "Pharma Zone",
  staff: STAFF_USERS,
  fixedNames: {
    "Managing Director": "Rajendra Iyer", "Head, PMO": "Sunanda Kulkarni", "HR Manager": "Farzana Shaikh",
    "Finance Manager": "Mukund Parikh", "Business Development Manager": "Abhishek Menon",
  },
  depts: DEPTS,
  siteDepts: ["Facility & Utility Services", "Calibration"],
  teamSize: { "Facility & Utility Services": 6, Calibration: 3 },
  clients: CLIENTS,
  clientActs: ["Quarterly service review with QA and engineering", "Discussed audit calendar and upcoming requalifications"],
  extraActs: [
    { client: "Navjeevan Healthcare", kind: ActivityKind.QUOTE_SENT, subject: "Proposal: oncology block VMP and qualification, ₹56 lakh", days: 6, by: "sales" },
    { client: "Ojas Biologics", kind: ActivityKind.COMPLAINT, subject: "QC lab DI project paused pending client's LIMS vendor upgrade", days: 19, by: "pm" },
  ],
  recurringLines: ["Facility management"],
  slipping: "Navjeevan Healthcare",
  engagements: ENGAGEMENTS,
  providers: PROVIDERS,
  providerDocs: ["NABL accreditation certificate", "Manpower supply agreement and PF compliance"],
  docs: [
    ["Cleanroom qualification protocol template, Grade A–D", DocumentType.SPEC_SHEET], ["Equipment IQ/OQ protocol template", DocumentType.SPEC_SHEET],
    ["HVAC requalification report, Sunrise injectable block", DocumentType.TEST_REPORT], ["Process validation summary, Kaveri", DocumentType.TEST_REPORT],
    ["GMP gap assessment report, Vedic Personal Care", DocumentType.TEST_REPORT], ["Master SOP: document control", DocumentType.OTHER],
    ["Master SOP: deviation and CAPA handling", DocumentType.OTHER], ["Data integrity policy (ALCOA+)", DocumentType.OTHER],
  ],
  jvs: [
    { days: 68, remark: "Depreciation on test instruments and particle counters, Q2", lines: [["5300", PostingSide.DEBIT, 145000], ["1610", PostingSide.CREDIT, 145000]] },
    { days: 35, remark: "Gratuity provision for the half year", lines: [["5700", PostingSide.DEBIT, 212000], ["2200", PostingSide.CREDIT, 212000]] },
    { days: 20, remark: "Office rent accrued, Andheri and Ahmedabad", lines: [["9000", PostingSide.DEBIT, 285000], ["2200", PostingSide.CREDIT, 285000]] },
    { days: 7, remark: "Site travel reclassified to engagements, recoverable at actuals", lines: [["1100", PostingSide.DEBIT, 64000], ["5900", PostingSide.CREDIT, 64000]] },
  ],
};
