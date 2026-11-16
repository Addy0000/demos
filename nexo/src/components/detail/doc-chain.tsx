import Link from "next/link";
import { CHAINS, type ChainId, type StageKey } from "@/lib/chain";
import { IconCheck } from "@/components/icons";

export type ChainLink = {
  /** Rendered as the stage's own reference, e.g. PR-2026-0004. */
  code: string;
  href: string;
};

/**
 * The spine.
 *
 * Every record in the procurement chain carries this, so the question an
 * operator actually has — "what came before this, and what is it waiting on" —
 * is answered on the record instead of by hunting three lists in the rail.
 *
 * A stage that exists is a link to the real document. A stage that does not is
 * dimmed, and the one you are on is marked. It is deliberately one line tall:
 * this sits above the working surface all day and must not cost it a row.
 */
export function DocChain({
  chain = "procurement",
  current,
  links = {},
}: {
  chain?: ChainId;
  current: StageKey;
  /** Whichever upstream and downstream documents actually exist for this record. */
  links?: Partial<Record<StageKey, ChainLink>>;
}) {
  const stages = CHAINS[chain];
  const currentIndex = stages.findIndex((s) => s.key === current);

  return (
    <nav
      aria-label={`${chain === "sales" ? "Sales" : "Procurement"} chain`}
      className="flex h-[30px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-edge bg-faint px-3 scroll-thin"
    >
      {stages.map((stage, i) => {
        const link = links[stage.key];
        const isCurrent = stage.key === current;
        const isDone = Boolean(link) && !isCurrent && i < currentIndex;

        // An outcome is an alternative, not a step — mark where the strip stops
        // being a sequence so it does not read as though everything goes through
        // both sides of a fork.
        const startsBranch = Boolean(stage.branch) && !stages[i - 1]?.branch;

        const body = (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            {isDone && <IconCheck size={11} className="shrink-0 text-success" aria-hidden="true" />}
            <span>{stage.label}</span>
            {link && (
              <span className="font-num text-[10.5px] tabular-nums opacity-70">{link.code}</span>
            )}
          </span>
        );

        return (
          <span key={stage.key} className="flex shrink-0 items-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`mx-0.5 shrink-0 select-none text-[10px] ${startsBranch ? "text-edge" : "text-muted/50"}`}
              >
                {startsBranch ? "├" : "›"}
              </span>
            )}

            {isCurrent ? (
              <span
                aria-current="step"
                className="rounded bg-pastel px-1.5 py-[3px] text-[11.5px] font-semibold text-primary"
              >
                {body}
              </span>
            ) : link ? (
              <Link
                href={link.href}
                className="rounded px-1.5 py-[3px] text-[11.5px] text-ink transition-colors duration-150 hover:bg-pastel hover:text-primary"
              >
                {body}
              </Link>
            ) : (
              <span
                className="px-1.5 py-[3px] text-[11.5px] text-muted"
                title={`${stage.document} — not raised for this record`}
              >
                {body}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
