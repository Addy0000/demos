import Link from "next/link";
import { CHAINS, trunkOf, branchesOf, type ChainId, type Stage, type StageKey } from "@/lib/chain";
import { money } from "@/lib/format";
import { IconArrowRight, IconCheck, IconAlert } from "@/components/icons";

export type Counts = {
  primary: number; primaryLabel: string;
  secondary?: number; secondaryLabel?: string;
  tertiary?: number; tertiaryLabel?: string;
};

/**
 * A chain drawn as it actually runs: top to bottom, one stage per row, with what
 * is sitting at each.
 *
 * The rail down the left is the connection made visible — the thing the separate
 * lists in the nav never showed. It forks where a chain stops being one thing:
 * at QC on the inward side, at the return on the outward one.
 */
export function FlowMap({
  chain,
  title,
  intro,
  counts,
  canSee,
  footnote,
  forkAfter,
  forkNote,
}: {
  chain: ChainId;
  title: string;
  intro: string;
  counts: Record<string, Counts>;
  canSee: Record<string, boolean>;
  /** One line under the fork, for money or material the chain is still holding. */
  footnote?: { value: number; text: string; stageKey: StageKey };
  /** Stage the fork hangs off, so the split is explained where it happens. */
  forkAfter?: StageKey;
  forkNote?: string;
}) {
  const stages = CHAINS[chain];
  const trunk = trunkOf(stages);
  const branches = branchesOf(stages);
  const totalWaiting = trunk.reduce((a, s) => a + (canSee[s.key] ? counts[s.key]!.primary : 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <h1 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h1>
        <span className="rounded-sm border border-edge bg-surface px-1.5 py-[1px] font-num text-[11px] tabular-nums text-muted">
          {stages.length} stages
        </span>
        <div className="flex-1" />
        <span className="text-[11.5px] text-muted">
          <span className="font-num font-semibold tabular-nums text-ink">{totalWaiting}</span> items waiting across the chain
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto scroll-thin bg-canvas p-3">
        <div className="mx-auto max-w-[880px]">
          <p className="mb-3 max-w-[68ch] text-[12px] leading-relaxed text-muted">{intro}</p>

          <ol className="relative">
            {/* The rail. Sits behind the nodes and stops at the fork. */}
            <span
              aria-hidden="true"
              className="absolute left-[15px] top-4 w-px bg-edge"
              style={{ height: `calc(100% - ${branches.length > 0 ? 132 : 40}px)` }}
            />

            {trunk.map((stage, i) => {
              const visible = canSee[stage.key];
              const c = counts[stage.key]!;
              const isFork = branches.length > 0 && stage.key === (forkAfter ?? trunk[trunk.length - 1]!.key);

              return (
                <li key={stage.key} className="relative mb-2 pl-9">
                  <span
                    aria-hidden="true"
                    className={`absolute left-[9px] top-[13px] flex h-[13px] w-[13px] items-center justify-center rounded-full border-2 ${
                      visible && c.primary > 0
                        ? "border-primary bg-primary"
                        : "border-edge bg-surface"
                    }`}
                  />

                  <StageCard
                    stage={stage}
                    counts={c}
                    visible={visible}
                    index={i + 1}
                  />

                  {isFork && forkNote && (
                    <p className="mb-1 mt-2 pl-1 text-[11px] text-muted">{forkNote}</p>
                  )}
                </li>
              );
            })}

            {/* The fork. Indented so the split reads structurally, not as more steps. */}
            {branches.length > 0 && (
              <li className="relative pl-9">
                <div className={`grid gap-2 ${branches.length > 1 ? "sm:grid-cols-2" : ""}`}>
                  {branches.map((stage) => {
                    const visible = canSee[stage.key];
                    const c = counts[stage.key]!;
                    const accept = stage.branch === "accept";
                    return (
                      <div key={stage.key} className="relative">
                        <span
                          className={`mb-1 flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide ${
                            accept ? "text-success-text" : "text-danger-text"
                          }`}
                        >
                          {accept ? <IconCheck size={11} /> : <IconAlert size={11} />}
                          {accept ? "Accepted" : "Comes back"}
                        </span>
                        <StageCard stage={stage} counts={c} visible={visible} tone={accept ? "success" : "danger"} />
                      </div>
                    );
                  })}
                </div>

                {footnote && footnote.value > 0 && canSee[footnote.stageKey] && (
                  <p className="mt-2 text-[11.5px] text-muted">
                    <span className="font-num font-semibold tabular-nums text-ink">{money(footnote.value)}</span>{" "}
                    {footnote.text}
                  </p>
                )}
              </li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

function StageCard({
  stage,
  counts,
  visible,
  index,
  tone,
}: {
  stage: Stage;
  counts: Counts;
  visible: boolean;
  index?: number;
  tone?: "success" | "danger";
}) {
  const border =
    tone === "success" ? "border-success/40" : tone === "danger" ? "border-danger/40" : "border-edge";

  const body = (
    <>
      <div className="flex h-[32px] items-center gap-2 border-b border-edge bg-faint px-3">
        <h2 className="truncate text-[11.5px] font-semibold text-ink">{stage.document}</h2>
        <span className="shrink-0 rounded-sm border border-edge bg-surface px-1 py-[1px] font-num text-[10px] tabular-nums text-muted">
          {stage.prefix}
        </span>
        <div className="flex-1" />
        {visible && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted transition-colors duration-150 group-hover:text-primary">
            Open
            <IconArrowRight size={11} />
          </span>
        )}
      </div>

      <div className="px-3 py-2">
        <p className="text-[12px] leading-relaxed text-ink">{stage.blurb}</p>

        {visible ? (
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
            <Metric value={counts.primary} label={counts.primaryLabel} emphasise />
            {counts.secondary !== undefined && counts.secondaryLabel && (
              <Metric value={counts.secondary} label={counts.secondaryLabel} />
            )}
            {counts.tertiary !== undefined && counts.tertiaryLabel && (
              <Metric value={counts.tertiary} label={counts.tertiaryLabel} />
            )}
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted">Your role cannot see this stage.</p>
        )}

        {(stage.gate || stage.approver) && (
          <p className="mt-1.5 border-t border-edge/60 pt-1.5 text-[11px] text-muted">
            {stage.approver ? (
              <>
                Signed by <span className="text-ink">{stage.approver}</span>
                {stage.gate && ` · ${stage.gate}`}
              </>
            ) : (
              stage.gate
            )}
          </p>
        )}
      </div>
    </>
  );

  const className = `group block border ${border} bg-surface transition-colors duration-150`;

  if (!visible) return <div className={className}>{body}</div>;

  return (
    <Link href={stage.href} className={`${className} hover:border-primary/50`}>
      {body}
    </Link>
  );
}

function Metric({ value, label, emphasise }: { value: number; label: string; emphasise?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className={`font-num tabular-nums ${
          emphasise
            ? value > 0
              ? "text-[15px] font-semibold text-ink"
              : "text-[15px] font-semibold text-muted"
            : "text-[12.5px] text-ink"
        }`}
      >
        {value}
      </span>
      <span className="text-[11px] text-muted">{label}</span>
    </span>
  );
}
