import Link from "next/link";
import { IconChevronRight } from "@/components/icons";

/** A titled region of the working surface. Flat — panels never nest. */
export function Panel({
  title,
  hint,
  href,
  hrefLabel = "Open",
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`}>
      <header className="panel-head">
        <h2 className="truncate text-[12px] font-semibold text-ink">{title}</h2>
        {hint && <span className="truncate text-[11px] text-muted">{hint}</span>}
        <div className="flex-1" />
        {href && (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-0.5 text-[11.5px] font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
          >
            {hrefLabel}
            <IconChevronRight size={12} />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin">{children}</div>
    </section>
  );
}

/** A single actionable line inside a panel. Dense by design. */
export function QueueRow({
  href,
  primary,
  secondary,
  trailing,
  leading,
}: {
  href: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 border-b border-edge/60 px-3 py-2 transition-colors duration-150 last:border-b-0 hover:bg-faint"
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-ink">{primary}</span>
        {secondary && <span className="block truncate text-[11px] text-muted">{secondary}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
      <IconChevronRight size={13} className="shrink-0 text-muted/70" />
    </Link>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-8 text-center text-[12px] text-muted">{children}</p>;
}

/**
 * A labelled figure inside a panel header strip. Deliberately small and inline —
 * this is a reading aid beside real rows, never the page's structure.
 */
export function Figure({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "danger" | "warning" | "success";
}) {
  const colour = {
    ink: "text-ink",
    danger: "text-danger-text",
    warning: "text-warning-text",
    success: "text-success-text",
  }[tone];

  return (
    <div className="flex items-baseline gap-1.5 border-r border-edge px-3 py-1.5 last:border-r-0">
      <span className={`font-num text-[15px] font-semibold tabular-nums leading-none tracking-tight ${colour}`}>
        {value}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}
