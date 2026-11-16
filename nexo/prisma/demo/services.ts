/**
 * A services company, as data: departments and grades, clients, engagements
 * planned to the task, service providers, and the documents and journals they
 * keep. One seeder walks any of them: employees and reporting lines, timesheets,
 * attendance, leave and payroll, milestone billing with collections, provider
 * bills, and ledger postings that follow the app's rules so the books balance.
 */
import {
  PrismaClient, Role, Industry, CustomerStatus, ActivityKind, DocumentType, EmploymentStatus, AttendanceStatus,
  LeaveType, LeaveStatus, PayrollStatus, EngagementStatus, TaskStatus, ServiceInvoiceStatus, VendorBillStatus,
  VendorBillBasis, PostingSide, PostingSourceType,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { NOW, DAY, ago, addDays, r2, rng, codes, gstinFor, seedAccounts, seedJournalVouchers, type World } from "./engine";

const dayUtc = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export type Dept = { name: string; roles: [string, string, number, number | null][] };
export type Task = [name: string, startOffset: number, days: number, milestone: boolean];
export type Eng = {
  client: string; name: string; line: string; status: EngagementStatus; startAgo: number; days: number; value: number; hours: number;
  dept: string; tasks: Task[];
};
export type ServicesWorld = {
  label: string;
  seed: number;
  password: string;
  domain: string;
  empPrefix: string;
  offices: string[];
  zone: string;
  /** The first person in depts[0] is the MD; every login linked to an employee names its designation. */
  staff: { email: string; role: Role; jobTitle: string; employee?: string }[];
  fixedNames: Record<string, string>;
  depts: Dept[];
  /** Departments whose people work on client sites full days. */
  siteDepts: string[];
  /** Hours a site person books on a working day, low to high. */
  siteHours?: [number, number];
  teamSize: Record<string, number>;
  clients: { name: string; city: string; state: string; industry: Industry; creditDays: number; creditLimit: number; late: number; contacts: [string, string][] }[];
  clientActs: [string, string];
  extraActs: { client: string; kind: ActivityKind; subject: string; days: number; by: "sales" | "pm" }[];
  /** Engagements on this line bill a monthly fee; the rest bill by milestone. */
  recurringLines: string[];
  slipping: string;
  engagements: Eng[];
  providers: { code: string; name: string; city: string; state: string; contact: string; monthly: number }[];
  providerDocs: string[];
  docs: [string, DocumentType][];
  jvs: World["jvs"];
};

export const FIRST = ["Aarav", "Aditi", "Akash", "Ananya", "Arjun", "Bhavik", "Chetan", "Deepa", "Dhruv", "Divya", "Farah", "Gaurav", "Hetal", "Ishaan", "Jaya", "Karan", "Kavya", "Lalit", "Mansi", "Meera", "Mihir", "Neel", "Nikita", "Omkar", "Pallavi", "Pranav", "Priya", "Rahul", "Rashmi", "Rohit", "Rupal", "Sagar", "Sameer", "Shreya", "Siddhi", "Snehal", "Sunil", "Swati", "Tejas", "Tanvi", "Uday", "Varun", "Vidya", "Vinay", "Yash", "Zoya", "Ketan", "Pooja", "Harsh", "Riya", "Imran", "Asha"];
export const LAST = ["Shah", "Patel", "Iyer", "Desai", "Joshi", "Kulkarni", "Mehta", "Nair", "Pandey", "Rao", "Sawant", "Trivedi", "Vyas", "Bhatt", "Gokhale", "Menon", "Parikh", "Shaikh", "Thakur", "Pillai", "Kadam", "Chauhan", "Dsouza", "Agarwal"];

export async function seedServices(prisma: PrismaClient, w: ServicesWorld) {
  const { rand, int, pick, between } = rng(w.seed);
  const code = codes();
  const L = `  ${w.label}`;
  console.log(`${L}: people, accounts and reporting lines…`);
  const passwordHash = await bcrypt.hash(w.password, 10);
  const acct = await seedAccounts(prisma);

  // ── Employees ─────────────────────────────────────────────────────────────
  type Emp = { id: string; name: string; dept: string; designation: string; ctc: number; rate: number | null; joined: Date };
  const emps: Emp[] = [];
  const usedNames = new Set<string>();
  let n = 0;
  const fixed = w.fixedNames;
  for (const d of w.depts) {
    for (const [designation, grade, ctc, rate] of d.roles) {
      n++;
      let name = fixed[designation];
      while (!name || usedNames.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
      usedNames.add(name);
      const joined = ago(int(90, 2600));
      const status = n % 17 === 5 ? EmploymentStatus.PROBATION : n % 23 === 9 ? EmploymentStatus.NOTICE : EmploymentStatus.ACTIVE;
      const row = await prisma.employee.create({
        data: {
          code: `${w.empPrefix}-${String(1000 + n)}`, name, designation, department: d.name, grade, joinedOn: status === EmploymentStatus.PROBATION ? ago(int(20, 80)) : joined,
          status, monthlyCtc: ctc, billRatePerHour: rate, location: w.siteDepts.includes(d.name) ? "Client site" : w.offices[n % w.offices.length]!,
          email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${w.domain}`, phone: `+91 9${int(100000000, 999999999)}`,
        },
      });
      emps.push({ id: row.id, name, dept: d.name, designation, ctc, rate, joined });
    }
  }
  // Reporting lines: each department reports to its first person; heads report to the MD.
  const md = emps[0]!;
  for (const d of w.depts.slice(1)) {
    const members = emps.filter((e) => e.dept === d.name);
    const head = members[0]!;
    await prisma.employee.update({ where: { id: head.id }, data: { managerId: md.id } });
    for (const m of members.slice(1)) await prisma.employee.update({ where: { id: m.id }, data: { managerId: head.id } });
  }
  // Login accounts tied to their employee records.
  const userBy: Record<string, string> = {};
  const linkTo: Record<string, string> = Object.fromEntries(w.staff.filter((s) => s.employee).map((s) => [s.email, s.employee!]));
  for (const s of w.staff) {
    const emp = linkTo[s.email] ? emps.find((e) => e.designation === linkTo[s.email]) : null;
    const u = await prisma.user.create({
      data: { email: s.email, name: emp?.name ?? "Systems Administrator", role: s.role, jobTitle: s.jobTitle, passwordHash, isVerified: true, isActive: true },
    });
    userBy[s.role] = u.id;
    if (emp) await prisma.employee.update({ where: { id: emp.id }, data: { userId: u.id } });
  }

  // ── Clients ───────────────────────────────────────────────────────────────
  console.log(`${L}: clients, contacts and activity…`);
  const clientId = new Map<string, string>();
  for (const [i, c] of w.clients.entries()) {
    const slug = c.name.toLowerCase().replace(/[^a-z]+/g, "");
    const row = await prisma.customer.create({
      data: {
        code: `CL-${String(i + 1).padStart(4, "0")}`, name: c.name, legalName: `${c.name} Ltd`, industry: c.industry, status: CustomerStatus.ACTIVE,
        city: c.city, state: c.state, gstin: gstinFor(c.state, i + 3), addressLine1: `Plot ${int(5, 300)}, ${w.zone}`, pincode: String(int(380000, 560099)),
        creditDays: c.creditDays, creditLimit: c.creditLimit, paymentTerms: `${c.creditDays} days from invoice`, ownerId: userBy[Role.SALES], createdAt: ago(700),
        contacts: { create: c.contacts.map(([name, role], k) => ({ name, role, isPrimary: k === 0, email: `${name.split(" ").slice(-2)[0]!.toLowerCase().replace(/[^a-z]/g, "")}@${slug}.demo`, phone: `+91 9${int(100000000, 999999999)}` })) },
      },
    });
    clientId.set(c.name, row.id);
    const acts: [ActivityKind, string, number][] = [
      [ActivityKind.MEETING, w.clientActs[0], int(20, 80)],
      [ActivityKind.CALL, w.clientActs[1], int(5, 25)],
    ];
    if (c.late > 30) acts.push([ActivityKind.CALL, "Collections: two invoices past due, payment run promised next week", int(1, 5)]);
    for (const [kind, subject, d] of acts) await prisma.customerActivity.create({ data: { customerId: row.id, kind, subject, occurredAt: ago(d), userId: userBy[Role.SALES] } });
  }
  for (const a of w.extraActs) {
    await prisma.customerActivity.create({ data: { customerId: clientId.get(a.client)!, kind: a.kind, subject: a.subject, occurredAt: ago(a.days), userId: userBy[a.by === "pm" ? Role.PROJECT_MANAGER : Role.SALES] } });
  }

  // ── Engagements, tasks, timesheets ────────────────────────────────────────
  console.log(`${L}: engagements, task plans and timesheets…`);
  const pmoHead = emps.find((e) => e.designation === "Head, PMO")!;
  const pm = emps.find((e) => e.designation === "Project Manager")!;
  type EngRow = { id: string; e: Eng; start: Date; end: Date; tasks: { id: string; start: Date; end: Date; progress: number; isMilestone: boolean; assignee: string }[]; team: Emp[] };
  const engs: EngRow[] = [];
  const busy = new Map<string, number>();
  for (const [i, e] of w.engagements.entries()) {
    const start = ago(e.startAgo);
    const end = addDays(start, e.days);
    const pool = emps.filter((x) => x.dept === e.dept && x.rate).sort((a, b) => (busy.get(a.id) ?? 0) - (busy.get(b.id) ?? 0));
    const team = pool.slice(0, w.teamSize[e.dept] ?? 4);
    if (e.status === EngagementStatus.ACTIVE) for (const t of team) busy.set(t.id, (busy.get(t.id) ?? 0) + 1);
    const lead = team[0] ?? pm;
    const row = await prisma.engagement.create({
      data: {
        code: `ENG-${2026 - (e.startAgo > 300 ? 1 : 0)}-${String(i + 101).padStart(4, "0")}`, name: e.name, customerId: clientId.get(e.client)!, serviceLine: e.line,
        status: e.status, startOn: start, endOn: end, contractValue: e.value, budgetHours: e.hours, managerId: i % 3 === 0 ? pmoHead.id : pm.id === lead.id ? pmoHead.id : pm.id,
        description: `${e.line} for ${e.client}. Fixed price with milestone billing; travel at actuals.`,
      },
    });
    const tasks: EngRow["tasks"] = [];
    const scale = e.days / (Math.max(...e.tasks.map(([, s, d]) => s + d)) || 1);
    const plannedTotal = e.tasks.filter((t) => !t[3]).reduce((s, [, , d]) => s + d, 0) || 1;
    for (const [k, [name, so, dur, milestone]] of e.tasks.entries()) {
      const ts = addDays(start, Math.round(so * scale));
      const te = addDays(ts, Math.max(milestone ? 0 : 1, Math.round(dur * scale)));
      const elapsed = Math.min(1, Math.max(0, (NOW.getTime() - ts.getTime()) / Math.max(DAY, te.getTime() - ts.getTime())));
      let progress = e.status === EngagementStatus.COMPLETED ? 100 : e.status === EngagementStatus.PROPOSED ? 0 : Math.round(elapsed * 100 * between(0.75, 1.05));
      // One engagement is slipping: its work after the first stage is behind the calendar.
      if (e.client === w.slipping && e.status === EngagementStatus.ACTIVE && k >= 1) progress = Math.round(progress * 0.3);
      if (e.status === EngagementStatus.ON_HOLD) progress = Math.min(progress, 45);
      progress = Math.max(0, Math.min(100, progress));
      if (milestone) progress = te < NOW && e.status !== EngagementStatus.ON_HOLD && !(e.client === w.slipping && e.status === EngagementStatus.ACTIVE && k >= 1) ? 100 : 0;
      const status = progress >= 100 ? TaskStatus.DONE : e.status === EngagementStatus.ON_HOLD && ts < NOW ? TaskStatus.BLOCKED : progress > 0 ? TaskStatus.IN_PROGRESS : TaskStatus.NOT_STARTED;
      const assignee = milestone ? lead : team[k % Math.max(1, team.length)] ?? lead;
      const t = await prisma.engagementTask.create({
        data: {
          engagementId: row.id, wbs: `${Math.floor(k / 3) + 1}.${(k % 3) + 1}`, name, assigneeId: assignee.id, status, startOn: ts, endOn: te,
          plannedHours: milestone ? 0 : Math.round((dur / plannedTotal) * e.hours), progressPct: progress, isMilestone: milestone,
        },
      });
      tasks.push({ id: t.id, start: ts, end: te, progress, isMilestone: milestone, assignee: assignee.id });
    }
    engs.push({ id: row.id, e, start, end, tasks, team });
  }

  // Timesheets: weekdays over the last 56 days and through each completed engagement.
  const sheetRows: { employeeId: string; engagementId: string; taskId: string | null; date: Date; hours: number; billable: boolean; approved: boolean; note: string | null }[] = [];
  const internal = engs[0]!;
  for (const g of engs) {
    if (g.e.status === EngagementStatus.PROPOSED) continue;
    const from = g.e.status === EngagementStatus.COMPLETED ? g.start : new Date(Math.max(g.start.getTime(), ago(56).getTime()));
    const to = g.e.status === EngagementStatus.ON_HOLD ? ago(19) : g.e.status === EngagementStatus.COMPLETED ? g.end : ago(1);
    for (let d = dayUtc(from); d <= to; d = new Date(d.getTime() + DAY)) {
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      for (const m of g.team) {
        if (rand() < 0.12) continue;
        const live = g.tasks.filter((t) => !t.isMilestone && t.start <= d && t.end >= d);
        const task = live.find((t) => t.assignee === m.id) ?? live[0] ?? null;
        const [lo, hi] = w.siteDepts.includes(g.e.dept) ? (w.siteHours ?? [7, 8.5]) : [4, 8.5];
        const hrs = Math.round(between(lo, hi) * 2) / 2;
        sheetRows.push({
          employeeId: m.id, engagementId: g.id, taskId: task?.id ?? null, date: d, hours: hrs, billable: rand() > 0.06,
          approved: d < ago(7), note: null,
        });
      }
    }
  }
  // Internal, non-billable time: training and proposals, booked against the first engagement as overhead.
  for (const e of emps.filter((x) => !x.rate && x.dept !== "Management").slice(0, 4)) {
    for (let k = 0; k < 10; k++) {
      sheetRows.push({ employeeId: e.id, engagementId: internal.id, taskId: null, date: dayUtc(ago(int(1, 40))), hours: 2, billable: false, approved: true, note: "Proposal and review support" });
    }
  }
  for (let i = 0; i < sheetRows.length; i += 1000) await prisma.timesheet.createMany({ data: sheetRows.slice(i, i + 1000) });

  // ── Attendance: this month and last ───────────────────────────────────────
  console.log(`${L}: attendance, leave and payroll…`);
  const monthStart = new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth() - 1, 1));
  const today = dayUtc(NOW);
  const leaves: { emp: Emp; from: Date; to: Date; type: LeaveType; status: LeaveStatus; reason: string }[] = [];
  const reasons: Record<LeaveType, string[]> = {
    CASUAL: ["Family function", "Personal work", "Bank and documentation"], SICK: ["Fever", "Viral infection", "Medical appointment"],
    EARNED: ["Family vacation", "Native place visit", "Wedding in the family"], COMP_OFF: ["Weekend shutdown support at client"], UNPAID: ["Extended personal leave"],
  };
  for (let i = 0; i < 34; i++) {
    const emp = pick(emps.slice(1));
    const type = pick([LeaveType.CASUAL, LeaveType.CASUAL, LeaveType.SICK, LeaveType.EARNED, LeaveType.COMP_OFF]);
    const startOff = i < 7 ? -int(2, 14) : int(1, 55);
    const from = dayUtc(ago(startOff));
    const len = type === LeaveType.EARNED ? int(3, 5) : int(1, 2);
    const to = new Date(from.getTime() + (len - 1) * DAY);
    leaves.push({ emp, from, to, type, status: i < 7 ? LeaveStatus.PENDING : i % 11 === 3 ? LeaveStatus.REJECTED : LeaveStatus.APPROVED, reason: pick(reasons[type]) });
  }
  const onLeave = new Set<string>();
  for (const l of leaves.filter((x) => x.status === LeaveStatus.APPROVED)) {
    for (let d = l.from; d <= l.to; d = new Date(d.getTime() + DAY)) onLeave.add(`${l.emp.id}:${d.getTime()}`);
  }
  const att: { employeeId: string; date: Date; status: AttendanceStatus; checkIn: Date | null; checkOut: Date | null }[] = [];
  for (const e of emps) {
    const onSite = w.siteDepts.includes(e.dept);
    for (let d = monthStart; d <= today; d = new Date(d.getTime() + DAY)) {
      if (d.getTime() === today.getTime() && rand() < 0.12) continue; // not yet marked today
      let status: AttendanceStatus;
      if (d.getUTCDay() === 0) status = AttendanceStatus.WEEKLY_OFF;
      else if (onLeave.has(`${e.id}:${d.getTime()}`)) status = AttendanceStatus.LEAVE;
      else {
        const r = rand();
        status = r < 0.015 ? AttendanceStatus.ABSENT : r < 0.04 ? AttendanceStatus.HALF_DAY : r < (onSite ? 0.7 : 0.24) ? AttendanceStatus.WFH : AttendanceStatus.PRESENT;
      }
      const working = status === AttendanceStatus.PRESENT || status === AttendanceStatus.WFH || status === AttendanceStatus.HALF_DAY;
      const inAt = new Date(d.getTime() + (3.5 + rand() * 1.2) * 3600_000);
      att.push({ employeeId: e.id, date: d, status, checkIn: working ? inAt : null, checkOut: working && d < today ? new Date(inAt.getTime() + (status === AttendanceStatus.HALF_DAY ? 4.5 : 9) * 3600_000) : null });
    }
  }
  for (let i = 0; i < att.length; i += 1000) await prisma.attendanceRecord.createMany({ data: att.slice(i, i + 1000) });
  for (const [i, l] of leaves.entries()) {
    await prisma.leaveRequest.create({
      data: {
        code: `LV-${l.from.getUTCFullYear()}-${String(i + 1).padStart(4, "0")}`, employeeId: l.emp.id, type: l.type, fromDate: l.from, toDate: l.to,
        days: (l.to.getTime() - l.from.getTime()) / DAY + 1, reason: l.reason, status: l.status,
        decidedById: l.status === LeaveStatus.PENDING ? null : userBy[Role.HR], decidedAt: l.status === LeaveStatus.PENDING ? null : addDays(l.from, -2),
        createdAt: addDays(l.from, -int(3, 10)),
      },
    });
  }

  // ── Payroll: six months ───────────────────────────────────────────────────
  for (let k = 6; k >= 1; k--) {
    const month = new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth() - k, 1));
    const daysIn = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const latest = k === 1;
    const lines = emps.filter((e) => e.joined < month || k <= 2).map((e) => {
      const paidDays = Math.max(daysIn - (rand() < 0.08 ? int(1, 2) : 0), daysIn - 2);
      const gross = r2((e.ctc * 0.93 * paidDays) / daysIn);
      const basic = r2(gross * 0.5);
      const hra = r2(basic * 0.4);
      const allowances = r2(gross - basic - hra);
      const pf = r2(Math.min(basic, 15000) * 0.12);
      const esi = gross <= 21000 ? r2(gross * 0.0075) : 0;
      const pt = gross > 10000 ? 200 : 0;
      const tds = r2(gross > 100000 ? gross * 0.12 : gross > 60000 ? gross * 0.06 : gross > 45000 ? gross * 0.02 : 0);
      return { employeeId: e.id, paidDays, basic, hra, allowances, gross, pf, esi, professionalTax: pt, tds, net: r2(gross - pf - esi - pt - tds) };
    });
    const gross = r2(lines.reduce((s, l) => s + l.gross, 0));
    const net = r2(lines.reduce((s, l) => s + l.net, 0));
    const processedAt = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1 + 0));
    const paidAt = latest ? null : new Date(processedAt.getTime() + 2 * DAY);
    await prisma.payrollRun.create({
      data: {
        code: `PAY-${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`, month, status: latest ? PayrollStatus.PROCESSED : PayrollStatus.PAID,
        processedAt, paidAt, gross, deductions: r2(gross - net), net, headcount: lines.length, lines: { create: lines },
      },
    });
    const ref = `PAY-${month.getUTCFullYear()}-${month.getUTCMonth() + 1}`;
    await prisma.ledgerPosting.createMany({
      data: [
        { accountId: acct["5700"]!, side: PostingSide.DEBIT, amount: gross, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: ref, postedAt: processedAt, remark: `Payroll ${ref}` },
        { accountId: acct["2300"]!, side: PostingSide.CREDIT, amount: net, sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: ref, postedAt: processedAt, remark: `Net salaries ${ref}` },
        { accountId: acct["2310"]!, side: PostingSide.CREDIT, amount: r2(gross - net), sourceType: PostingSourceType.JOURNAL_ENTRY, sourceId: ref, postedAt: processedAt, remark: `PF, ESI, PT, TDS ${ref}` },
        ...(paidAt
          ? [
              { accountId: acct["2300"]!, side: PostingSide.DEBIT, amount: net, sourceType: PostingSourceType.PAYMENT, sourceId: ref, postedAt: paidAt, remark: `Salaries paid ${ref}` },
              { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount: net, sourceType: PostingSourceType.PAYMENT, sourceId: ref, postedAt: paidAt, remark: `Salaries paid ${ref}` },
            ]
          : []),
      ],
    });
  }

  // ── Billing and collections ───────────────────────────────────────────────
  console.log(`${L}: service invoices, collections and provider bills…`);
  const outstanding = new Map<string, number>();
  for (const g of engs) {
    if (g.e.status === EngagementStatus.PROPOSED) continue;
    const client = w.clients.find((c) => c.name === g.e.client)!;
    const customerId = clientId.get(g.e.client)!;
    const ms = g.tasks.filter((t) => t.isMilestone);
    const recurring = w.recurringLines.includes(g.e.line);
    const points: { at: Date; share: number; what: string }[] = [];
    if (recurring) {
      for (let m = new Date(g.start.getFullYear(), g.start.getMonth() + 1, 1); m < NOW; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        points.push({ at: m, share: 30 / g.e.days, what: `Monthly service fee, ${new Date(m.getFullYear(), m.getMonth() - 1, 1).toLocaleDateString("en-IN", { month: "long" })}` });
      }
    } else {
      points.push({ at: addDays(g.start, 3), share: 0.2, what: "Mobilisation advance, 20%" });
      ms.forEach((t, k) => {
        if (t.progress >= 100) points.push({ at: addDays(t.end, 2), share: 0.8 / ms.length, what: `Milestone ${k + 1} of ${ms.length}` });
      });
    }
    for (const p of points) {
      if (p.at > NOW) continue;
      const subtotal = r2(g.e.value * p.share);
      const tax = r2(subtotal * 0.18);
      const total = r2(subtotal + tax);
      const due = addDays(p.at, client.creditDays);
      const paidOn = addDays(due, client.late + int(-4, 6));
      const paid = paidOn < NOW ? total : client.late > 60 && due < NOW && rand() > 0.5 ? r2(total / 2) : 0;
      const status = paid >= total ? ServiceInvoiceStatus.PAID : paid > 0 ? ServiceInvoiceStatus.PART_PAID : due < NOW ? ServiceInvoiceStatus.OVERDUE : ServiceInvoiceStatus.RAISED;
      const inv = await prisma.serviceInvoice.create({
        data: {
          code: code("SINV", p.at), customerId, engagementId: g.id, invoiceDate: p.at, dueOn: due, description: `${p.what}: ${g.e.name}`,
          subtotal, taxAmount: tax, totalValue: total, paidAmount: paid, status,
        },
      });
      await prisma.ledgerPosting.createMany({
        data: [
          { accountId: acct["1100"]!, side: PostingSide.DEBIT, amount: total, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: p.at, customerId, remark: `Service invoice ${inv.code}` },
          { accountId: acct["4100"]!, side: PostingSide.CREDIT, amount: subtotal, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: p.at, remark: `Service revenue ${inv.code}` },
          { accountId: acct["2100"]!, side: PostingSide.CREDIT, amount: tax, sourceType: PostingSourceType.SALES_INVOICE, sourceId: inv.id, postedAt: p.at, remark: `Output GST ${inv.code}` },
          ...(paid > 0
            ? [
                { accountId: acct["1000"]!, side: PostingSide.DEBIT, amount: paid, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: paid >= total ? paidOn : addDays(due, 3), customerId },
                { accountId: acct["1100"]!, side: PostingSide.CREDIT, amount: paid, sourceType: PostingSourceType.PAYMENT, sourceId: inv.id, postedAt: paid >= total ? paidOn : addDays(due, 3), customerId },
              ]
            : []),
        ],
      });
      outstanding.set(customerId, (outstanding.get(customerId) ?? 0) + total - paid);
    }
  }
  for (const [id, amt] of outstanding) await prisma.customer.update({ where: { id }, data: { outstandingAmt: r2(amt) } });

  // Service providers and their monthly bills.
  for (const [i, p] of w.providers.entries()) {
    const v = await prisma.vendor.create({
      data: {
        code: p.code, name: p.name, legalName: `${p.name} Pvt Ltd`, city: p.city, state: p.state, creditDays: 30, paymentTerms: "30 days from invoice",
        rating: [4.5, 3.5, 4, 4, 3.5, 4.5][i]!, contactName: p.contact, contactEmail: `accounts@${p.name.toLowerCase().replace(/[^a-z]+/g, "")}.demo`, gstin: gstinFor(p.state, i + 60),
      },
    });
    for (let k = 6; k >= 0; k--) {
      const billDate = new Date(NOW.getFullYear(), NOW.getMonth() - k, 5);
      if (billDate > NOW) continue;
      const sub = r2(p.monthly * between(0.85, 1.15));
      const total = r2(sub * 1.18);
      const due = addDays(billDate, 30);
      const isPaid = due < ago(3);
      const bill = await prisma.vendorBill.create({
        data: {
          code: code("VB", billDate), status: isPaid ? VendorBillStatus.PAID : VendorBillStatus.APPROVED, basis: VendorBillBasis.SERVICE, vendorId: v.id,
          billNo: `${p.code.slice(3)}/${int(100, 999)}`, billDate, dueOn: due, subtotal: sub, taxAmount: r2(sub * 0.18), totalValue: total, paidAmount: isPaid ? total : 0,
          createdById: userBy[Role.FINANCE], remark: `${p.name}: ${billDate.toLocaleDateString("en-IN", { month: "long" })} services`,
        },
      });
      await prisma.ledgerPosting.createMany({
        data: [
          { accountId: acct[i === 4 ? "5900" : "5800"]!, side: PostingSide.DEBIT, amount: total, sourceType: PostingSourceType.VENDOR_BILL, sourceId: bill.id, vendorBillId: bill.id, postedAt: billDate, vendorId: v.id },
          { accountId: acct["2000"]!, side: PostingSide.CREDIT, amount: total, sourceType: PostingSourceType.VENDOR_BILL, sourceId: bill.id, vendorBillId: bill.id, postedAt: billDate, vendorId: v.id },
          ...(isPaid
            ? [
                { accountId: acct["2000"]!, side: PostingSide.DEBIT, amount: total, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: addDays(due, -1), vendorId: v.id },
                { accountId: acct["1000"]!, side: PostingSide.CREDIT, amount: total, sourceType: PostingSourceType.PAYMENT, sourceId: bill.id, vendorBillId: bill.id, postedAt: addDays(due, -1), vendorId: v.id },
              ]
            : []),
        ],
      });
    }
    // Their certificates and agreements, on file.
    await prisma.document.create({
      data: {
        code: `DOC-${String(i + 1).padStart(4, "0")}`, title: w.providerDocs[i] ?? `${p.name} service agreement`,
        type: i === 0 ? DocumentType.COA : DocumentType.OTHER, fileName: `${p.code}-agreement.pdf`, issuedOn: ago(300), expiresOn: i === 0 ? ago(-40) : addDays(ago(300), 365), vendorId: v.id, uploadedById: userBy[Role.ADMIN],
      },
    });
  }
  const docTitles = w.docs;
  for (const [k, [title, type]] of docTitles.entries()) {
    await prisma.document.create({
      data: { code: `DOC-${String(w.providers.length + k + 1).padStart(4, "0")}`, title, type, fileName: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf`, issuedOn: ago(int(20, 200)), uploadedById: userBy[Role.PROJECT_MANAGER] },
    });
  }

  await seedJournalVouchers(prisma, acct, w.jvs);
}
