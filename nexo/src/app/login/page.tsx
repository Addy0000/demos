import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { ThemePicker } from "@/components/theme-picker";
import { LoginForm } from "./login-form";
import { AuthAside } from "@/components/auth-aside";

export const metadata: Metadata = { title: "Sign in" };

/**
 * A sign-in screen for people who already work here.
 *
 * Split left/right, and the split is not decorative: the left panel is the same
 * dark rail the operator is about to work in, against the light working surface on
 * the right. Signing in walks straight into that composition rather than cutting to
 * an unrelated screen. The rail carries the mark and nothing else — there is no
 * value proposition to make and nobody to persuade. What an operator needs at 7am
 * is the form, and on a narrow screen the rail shrinks to a bar to get out of its
 * way.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; verified?: string; reset?: string }>;
}) {
  if (await currentSession()) redirect("/");
  const { next, error, verified, reset } = await searchParams;

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,44%)_1fr] lg:grid-rows-1">
      <AuthAside />

      <div className="relative grid place-items-center bg-canvas px-6 py-12">
        <div className="absolute right-4 top-4">
          <ThemePicker tone="light" />
        </div>
        <div className="w-full max-w-[368px]">
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Use your work account. Vendors sign in here too.
          </p>

          <LoginForm nextPath={next} initialError={error} verified={verified} reset={reset} />

          <p className="mt-8 border-t border-edge pt-3 text-[11px] leading-relaxed text-muted">
            Demonstration environment. Every record is synthetic.{" "}
            <a href="/select" className="ref-link">
              Choose another company
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
