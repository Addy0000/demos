import Link from "next/link";

/**
 * A plan drawn against the calendar. Rows are tasks or engagements; each bar is
 * filled to its progress, milestones are diamonds, and a single line marks
 * today. Positioned in percentages so it reflows to any width and prints.
 */
export type GanttRow = {
  id: string;
  label: string;
  sub?: string;
  start: string;
  end: string;
  progress: number;
  milestone?: boolean;
  tone: "on" | "late" | "done" | "blocked" | "idle";
  href?: string;
  group?: string;
};

const DAY = 86_400_000;

const BAR: Record<GanttRow["tone"], { track: string; fill: string }> = {
  on: { track: "bg-primary/18", fill: "bg-primary" },
  late: { track: "bg-warning/25", fill: "bg-warning" },
  done: { track: "bg-success/25", fill: "bg-success" },
  blocked: { track: "bg-danger/20", fill: "bg-danger" },
  idle: { track: "bg-muted/15", fill: "bg-muted/50" },
};

export function Gantt({ rows, from, to, today = new Date(), labelWidth = 260 }: { rows: GanttRow[]; from: Date; to: Date; today?: Date; labelWidth?: number }) {
  const span = Math.max(1, to.getTime() - from.getTime());
  const pos = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - from.getTime()) / span) * 100));

  // Month boundaries, and week ticks when the window is short enough to read them.
  const months: { at: number; label: string }[] = [];
  const m = new Date(from.getFullYear(), from.getMonth(), 1);
  while (m <= to) {
    if (m >= from) months.push({ at: pos(m), label: m.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
    m.setMonth(m.getMonth() + 1);
  }
  const weeks: number[] = [];
  if (span / DAY <= 140) {
    const w = new Date(from);
    w.setDate(w.getDate() + ((8 - w.getDay()) % 7));
    while (w <= to) {
      weeks.push(pos(w));
      w.setDate(w.getDate() + 7);
    }
  }
  const t = pos(today);
  const heads = rows.map((r, i) => (r.group && r.group !== rows[i - 1]?.group ? r.group : null));

  return (
    <div className="overflow-x-auto scroll-thin">
      <div className="min-w-[760px]">
        {/* Calendar header */}
        <div className="grid border-b border-edge bg-faint" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
          <div className="px-3 py-1.5 text-[10.5px] font-semibold text-muted">Plan</div>
          <div className="relative h-[34px]">
            {months.map((mo) => (
              <span key={mo.at} className="absolute top-0 h-full border-l border-edge pl-1.5 pt-1.5 font-num text-[10.5px] text-muted" style={{ left: `${mo.at}%` }}>
                {mo.label}
              </span>
            ))}
            {t > 0 && t < 100 && (
              <span className="absolute -translate-x-1/2 rounded-sm bg-danger px-1 py-px font-num text-[9px] font-semibold leading-tight text-white" style={{ left: `${t}%`, top: 19 }}>
                Today
              </span>
            )}
          </div>
        </div>

        {/* Rows */}
        <ul>
          {rows.map((r, i) => {
            const s = pos(new Date(r.start));
            const e = pos(new Date(r.end));
            const bar = BAR[r.tone];
            const head = heads[i];
            const label = (
              <>
                <span className="block truncate text-[12px] text-ink">{r.label}</span>
                {r.sub && <span className="block truncate text-[10.5px] text-muted">{r.sub}</span>}
              </>
            );
            return (
              <li key={r.id}>
                {head && <p className="border-b border-edge/60 bg-canvas px-3 py-1 text-[10.5px] font-semibold text-muted">{head}</p>}
                <div className="grid border-b border-edge/60 hover:bg-faint/60" style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
                  <div className="min-w-0 px-3 py-1.5">
                    {r.href ? (
                      <Link href={r.href} className="block min-w-0 hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </div>
                  <div className="relative min-h-[34px]">
                    {weeks.map((w) => (
                      <span key={w} className="absolute inset-y-0 border-l border-edge/40" style={{ left: `${w}%` }} />
                    ))}
                    {months.map((mo) => (
                      <span key={mo.at} className="absolute inset-y-0 border-l border-edge" style={{ left: `${mo.at}%` }} />
                    ))}
                    {r.milestone ? (
                      <span
                        className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${r.tone === "done" ? "bg-success" : r.tone === "late" ? "bg-warning" : "bg-ink"}`}
                        style={{ left: `${e}%` }}
                        title={`Milestone ${new Date(r.end).toLocaleDateString("en-IN")}`}
                      />
                    ) : (
                      <span
                        className={`absolute top-1/2 h-[12px] -translate-y-1/2 overflow-hidden rounded-[3px] ${bar.track}`}
                        style={{ left: `${s}%`, width: `${Math.max(0.6, e - s)}%` }}
                        title={`${new Date(r.start).toLocaleDateString("en-IN")} – ${new Date(r.end).toLocaleDateString("en-IN")} · ${r.progress}%`}
                      >
                        <span className={`block h-full ${bar.fill}`} style={{ width: `${r.progress}%` }} />
                      </span>
                    )}
                    {t > 0 && t < 100 && <span className="absolute inset-y-0 w-px bg-danger/70" style={{ left: `${t}%` }} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** On track, late or blocked: progress against the share of time already gone. */
export function toneFor(start: Date, end: Date, progress: number, status: string, now = new Date()): GanttRow["tone"] {
  if (status === "DONE" || status === "COMPLETED" || progress >= 100) return "done";
  if (status === "BLOCKED" || status === "ON_HOLD") return "blocked";
  if (now < start) return "idle";
  const elapsed = Math.min(1, (now.getTime() - start.getTime()) / Math.max(1, end.getTime() - start.getTime()));
  return progress / 100 + 0.12 < elapsed ? "late" : "on";
}
