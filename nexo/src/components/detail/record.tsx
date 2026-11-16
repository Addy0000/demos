import Link from "next/link";
import { IconChevronLeft } from "@/components/icons";
import { GenerateMenu } from "@/components/report/generate-menu";

/**
 * Record header. `view-transition-name: record-title` is what the grid row morphs
 * into — see the ::view-transition rules in globals.css.
 */
export function RecordHeader({
  backHref,
  backLabel,
  code,
  title,
  status,
  actions,
  meta,
}: {
  backHref: string;
  backLabel: string;
  code: string;
  title: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: { label: string; value: React.ReactNode }[];
}) {
  return (
    <header className="shrink-0 border-b border-edge bg-surface" data-tour="record-header">
      <div className="flex h-[42px] items-center gap-2 border-b border-edge bg-faint px-3">
        <Link
          href={backHref}
          data-print-hide
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-[12px] text-muted transition-colors duration-150 hover:bg-pastel hover:text-primary"
        >
          <IconChevronLeft size={14} />
          {backLabel}
        </Link>
        <span className="h-4 w-px shrink-0 bg-edge print:hidden" />
        <span data-doc-code className="shrink-0 font-num text-[12px] font-medium tabular-nums text-muted">{code}</span>
        <h1
          className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight text-ink"
          style={{ viewTransitionName: "record-title" }}
        >
          {title}
        </h1>
        {status}
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5" data-tour="record-actions">
            {actions}
          </div>
        )}
        <GenerateMenu kind="document" />
      </div>

      {meta && meta.length > 0 && (
        <dl className="flex flex-wrap items-center">
          {meta.map((m) => (
            <div key={m.label} className="border-r border-edge px-3 py-1.5 last:border-r-0">
              <dt className="text-[10.5px] text-muted">{m.label}</dt>
              <dd className="mt-0.5 text-[12.5px] font-medium text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/** Two-column label/value block for record fields. */
export function FieldGrid({
  fields,
  columns = 2,
}: {
  fields: { label: string; value: React.ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
}) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-0 ${cols}`}>
      {fields.map((f) => (
        <div
          key={f.label}
          className={`flex items-baseline gap-3 border-b border-edge/60 py-1.5 ${f.span ? "sm:col-span-full" : ""}`}
        >
          <dt className="w-[42%] shrink-0 text-[11.5px] text-muted">{f.label}</dt>
          <dd className="min-w-0 flex-1 text-[12.5px] text-ink">{f.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
  padded = true,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="border border-edge bg-surface">
      <header className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
        <h2 className="truncate text-[11.5px] font-semibold text-ink">{title}</h2>
        {hint && <span className="truncate text-[11px] text-muted">{hint}</span>}
        <div className="flex-1" />
        {actions}
      </header>
      <div className={padded ? "px-3 py-2" : ""}>{children}</div>
    </section>
  );
}

/** Dense read-only table used inside record sections. */
export function MiniTable({
  head,
  children,
  empty,
}: {
  head: { label: string; align?: "left" | "right"; width?: string }[];
  children: React.ReactNode;
  empty?: string;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (!hasRows && empty) {
    return <p className="px-3 py-6 text-center text-[12px] text-muted">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[520px]">
        <thead>
          <tr className="border-b border-edge bg-faint">
            {head.map((h) => (
              <th
                key={h.label}
                style={h.width ? { width: h.width } : undefined}
                className={`px-2.5 py-1.5 text-[10.5px] font-semibold text-muted ${h.align === "right" ? "text-right" : "text-left"}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  align = "left",
  num = false,
  muted = false,
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  num?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={[
        "px-2.5 py-1.5 text-[12px]",
        align === "right" ? "text-right" : "",
        num ? "font-num tabular-nums" : "",
        muted ? "text-muted" : "text-ink",
        className,
      ].join(" ")}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-b border-edge/60 last:border-b-0 hover:bg-faint">{children}</tr>;
}

/** Layout for record pages: main column plus a narrower aside. */
export function RecordBody({
  main,
  aside,
}: {
  main: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
      <div className={`grid gap-3 ${aside ? "xl:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        <div className="flex min-w-0 flex-col gap-3">{main}</div>
        {aside && <div className="flex flex-col gap-3">{aside}</div>}
      </div>
    </div>
  );
}
