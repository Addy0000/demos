import Link from "next/link";
import { IconSearch } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-canvas p-6">
      <div className="max-w-[420px]">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-info-bg text-info">
          <IconSearch size={20} />
        </span>

        <h1 className="mt-4 text-[17px] font-semibold tracking-tight text-ink">
          That record does not exist
        </h1>

        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          It may have been deleted, or the link may be pointing at an identifier from a different
          environment. Search will find it if it is still on the system.
        </p>

        <div className="mt-5 flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex h-8 items-center rounded bg-primary px-3 text-[12.5px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            Back to dashboard
          </Link>
          <span className="text-[11.5px] text-muted">
            or press{" "}
            <kbd className="rounded border border-edge bg-surface px-1 py-0.5 font-num text-[11px]">Ctrl</kbd>{" "}
            <kbd className="rounded border border-edge bg-surface px-1 py-0.5 font-num text-[11px]">K</kbd>{" "}
            to search
          </span>
        </div>
      </div>
    </div>
  );
}
