"use client";

import { useEffect } from "react";
import { IconAlert, IconRefresh } from "@/components/icons";
import { Button } from "@/components/ui/form";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[erp]", error);
  }, [error]);

  return (
    <div className="grid min-h-0 flex-1 place-items-center bg-canvas p-6">
      <div className="max-w-[440px]">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-danger-bg text-danger">
          <IconAlert size={20} />
        </span>

        <h1 className="mt-4 text-[17px] font-semibold tracking-tight text-ink">
          This screen could not be loaded
        </h1>

        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Something failed while fetching the records for this page. Nothing you were working on has
          been lost — the failure happened on read, not on save.
        </p>

        {error.digest && (
          <p className="mt-3 rounded border border-edge bg-surface px-2.5 py-1.5 font-num text-[11.5px] text-muted">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          <Button variant="primary" onClick={reset}>
            <IconRefresh size={13} />
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>
            Back to dashboard
          </Button>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          If it keeps failing, check that the database container is running — <code className="rounded bg-faint px-1 py-0.5 font-num">docker compose up -d</code>.
        </p>
      </div>
    </div>
  );
}
