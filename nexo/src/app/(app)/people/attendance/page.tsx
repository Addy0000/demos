import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Section } from "@/components/detail/record";

export const metadata: Metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

const CELL: Record<string, { cls: string; label: string; short: string }> = {
  PRESENT: { cls: "bg-success/80", label: "Present", short: "P" },
  WFH: { cls: "bg-info/70", label: "Client site / remote", short: "R" },
  HALF_DAY: { cls: "bg-success/35", label: "Half day", short: "½" },
  LEAVE: { cls: "bg-special/70", label: "On leave", short: "L" },
  ABSENT: { cls: "bg-danger/80", label: "Absent", short: "A" },
  WEEKLY_OFF: { cls: "bg-faint", label: "Weekly off", short: "" },
  HOLIDAY: { cls: "bg-warning/50", label: "Holiday", short: "H" },
};

/**
 * The month for everyone in one grid. A cell per person per day, so a run of
 * absences or a department short on a given day is visible without a filter.
 */
export default async function AttendancePage() {
  await requirePermission("hr:read");
  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const days = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).getUTCDate();
  const today = now.getDate();

  const [people, records] = await Promise.all([
    prisma.employee.findMany({ where: { status: { not: "EXITED" } }, orderBy: [{ department: "asc" }, { name: "asc" }], select: { id: true, name: true, department: true, code: true } }),
    prisma.attendanceRecord.findMany({ where: { date: { gte: from } }, select: { employeeId: true, date: true, status: true } }),
  ]);
  const map = new Map(records.map((r) => [`${r.employeeId}:${r.date.getUTCDate()}`, r.status]));
  const todayCounts = Object.fromEntries(Object.keys(CELL).map((k) => [k, 0])) as Record<string, number>;
  for (const p of people) {
    const s = map.get(`${p.id}:${today}`);
    if (s) todayCounts[s] = (todayCounts[s] ?? 0) + 1;
  }
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="text-[14px] font-semibold tracking-tight text-ink">Attendance</h1>
        <span className="font-num text-[11.5px] text-muted">{now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
        <span className="ml-auto hidden items-center gap-3 text-[11.5px] text-muted md:flex">
          Today:
          {(["PRESENT", "WFH", "LEAVE", "ABSENT"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`h-2 w-2 rounded-[2px] ${CELL[k]!.cls}`} />
              <span className="font-num font-semibold text-ink">{todayCounts[k]}</span> {CELL[k]!.label.toLowerCase()}
            </span>
          ))}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <Section title="Month register" hint={`${people.length} people · one cell a day`} padded={false}>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="border-b border-edge bg-faint">
                  <th className="sticky left-0 z-10 w-[200px] bg-faint px-3 py-1.5 text-left text-[10.5px] font-semibold text-muted">Employee</th>
                  {dayNums.map((d) => {
                    const wd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), d)).getUTCDay();
                    return (
                      <th key={d} className={`w-[26px] px-0 py-1.5 text-center font-num text-[10px] font-medium ${d === today ? "text-danger-text" : wd === 0 ? "text-muted/60" : "text-muted"}`}>
                        {d}
                      </th>
                    );
                  })}
                  <th className="px-2 py-1.5 text-right text-[10.5px] font-semibold text-muted">Paid days</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => {
                  const head = p.department !== people[i - 1]?.department;
                  const paid = dayNums.reduce((s, d) => {
                    const st = map.get(`${p.id}:${d}`);
                    return s + (!st || st === "ABSENT" ? 0 : st === "HALF_DAY" ? 0.5 : 1);
                  }, 0);
                  return [
                    head ? (
                      <tr key={`h-${p.department}`} className="border-b border-edge/60 bg-canvas">
                        <td colSpan={days + 2} className="px-3 py-1 text-[10.5px] font-semibold text-muted">{p.department}</td>
                      </tr>
                    ) : null,
                    <tr key={p.id} className="border-b border-edge/50 hover:bg-faint/60">
                      <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-[12px] text-ink">
                        <span className="block truncate">{p.name}</span>
                      </td>
                      {dayNums.map((d) => {
                        const s = map.get(`${p.id}:${d}`);
                        const c = s ? CELL[s] : null;
                        return (
                          <td key={d} className="p-[2px] text-center">
                            {c ? (
                              <span title={`${d}: ${c.label}`} className={`mx-auto grid h-[18px] w-[20px] place-items-center rounded-[3px] font-num text-[9px] font-semibold text-white ${c.cls}`}>
                                {c.short}
                              </span>
                            ) : (
                              <span className="mx-auto block h-[18px] w-[20px] rounded-[3px] border border-dashed border-edge/70" />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 text-right font-num text-[12px] text-ink">{paid}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-edge px-3 py-2 text-[11px] text-muted">
            {Object.entries(CELL).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-[2px] ${c.cls}`} />
                {c.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] border border-dashed border-edge" />
              Not yet marked
            </span>
          </div>
        </Section>
      </div>
    </div>
  );
}
