/** Skeleton in the shape of the grid it replaces, so the layout never jumps. */
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading">
      <div className="flex h-[42px] shrink-0 items-center gap-2 border-b border-edge bg-faint px-3">
        <span className="h-[13px] w-32 animate-pulse rounded-sm bg-edge" />
        <span className="h-[18px] w-10 animate-pulse rounded-sm bg-edge/70" />
        <span className="ml-1 h-[26px] w-24 animate-pulse rounded bg-edge/70" />
        <span className="ml-1 h-[26px] w-56 animate-pulse rounded bg-edge/50" />
      </div>

      <div className="h-[30px] shrink-0 border-b border-edge bg-surface" />

      <div className="min-h-0 flex-1 bg-surface">
        <div className="h-[30px] border-b border-edge bg-faint" />
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="flex h-row items-center gap-4 border-b border-edge/60 px-3"
            style={{ opacity: 1 - i * 0.045 }}
          >
            <span className="h-[9px] w-16 animate-pulse rounded-sm bg-accent-soft/60" />
            <span className="h-[9px] w-52 animate-pulse rounded-sm bg-accent-soft/60" />
            <span className="h-[9px] w-20 animate-pulse rounded-sm bg-accent-soft/60" />
            <span className="h-[9px] w-28 animate-pulse rounded-sm bg-accent-soft/60" />
            <span className="h-[9px] w-24 animate-pulse rounded-sm bg-accent-soft/60" />
            <span className="ml-auto h-[9px] w-20 animate-pulse rounded-sm bg-accent-soft/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
