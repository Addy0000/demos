import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { IconAlert } from "@/components/icons";

export const metadata: Metadata = { title: "Not permitted" };

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const session = await auth();
  const { need } = await searchParams;
  const roleLabel = session?.user ? ROLE_LABELS[session.user.role] : null;

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6">
      <div className="w-full max-w-[420px]">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-warning-bg text-warning">
          <IconAlert size={20} />
        </span>

        <h1 className="mt-5 text-[19px] font-semibold tracking-tight text-ink">
          You do not have access to this screen
        </h1>

        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {roleLabel ? (
            <>
              Your role is <span className="font-medium text-ink">{roleLabel}</span>, which does not
              include{need ? <> the <code className="rounded bg-faint px-1 py-0.5 font-num text-[12px] text-ink">{need}</code> permission</> : " this permission"}.
            </>
          ) : (
            "Sign in to continue."
          )}
        </p>

        <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
          If you need this for your work, ask an administrator to adjust your role. Access is
          granted by role, not per screen.
        </p>

        <div className="mt-7 flex items-center gap-2">
          <Link
            href="/"
            className="flex h-9 items-center rounded-[5px] bg-primary px-4 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            Back to dashboard
          </Link>
          <Link
            href="/login"
            className="flex h-9 items-center rounded-[5px] border border-edge bg-surface px-4 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-faint"
          >
            Switch account
          </Link>
        </div>
      </div>
    </main>
  );
}
