"use client";

import { useState, useTransition } from "react";
import { useTenant } from "@/components/appearance";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { IconAlert, IconChevronDown, IconCheck } from "@/components/icons";


export function LoginForm({
  nextPath,
  initialError,
  verified,
  reset,
}: {
  nextPath?: string;
  initialError?: string;
  verified?: string;
  reset?: string;
}) {
  const router = useRouter();
  const company = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    initialError
      ? initialError === "unverified"
        ? "Your account is not verified yet. Please check your email for the verification OTP."
        : "That sign-in did not go through. Check the address and password."
      : null
  );
  const [successMsg, setSuccessMsg] = useState<string | null>(
    verified === "true"
      ? "Email verified successfully! Please sign in below."
      : reset === "true"
      ? "Password reset successful! Please sign in with your new password."
      : null
  );
  const [showAccounts, setShowAccounts] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });

    if (!res || res.error) {
      setError("We could not match that email and password. Check both and try again.");
      return;
    }
    startTransition(() => {
      router.replace(nextPath && nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    });
  }

  function useAccount(addr: string) {
    setEmail(addr);
    setPassword(company.demoPassword);
    setError(null);
  }

  const busy = pending;

  return (
    <>
      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${company.demoAccounts[0]![0].split("@")[1]}`}
            className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-[12px] font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[5px] border border-danger/35 bg-danger-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink"
          >
            <IconAlert size={15} className="mt-px shrink-0 text-danger" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-[5px] border border-success/35 bg-success-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink"
          >
            <IconCheck size={15} className="mt-px shrink-0 text-success" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex items-center justify-between text-[12.5px] pt-1">
          <a href="/forgot-password" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
            Forgot password?
          </a>
          <a href="/signup" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
            Create account
          </a>
        </div>
      </form>

      <div className="mt-7 rounded-[5px] border border-edge bg-surface">
        <button
          type="button"
          onClick={() => setShowAccounts((s) => !s)}
          aria-expanded={showAccounts}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] font-medium text-ink transition-colors duration-150 hover:bg-faint"
        >
          <span>Demonstration accounts</span>
          <IconChevronDown
            size={15}
            className={`text-muted transition-transform duration-200 ease-out ${showAccounts ? "rotate-180" : ""}`}
          />
        </button>

        {showAccounts && (
          <div className="border-t border-edge">
            <p className="px-3 pb-1.5 pt-2.5 text-[11.5px] leading-snug text-muted">
              Password for every account is{" "}
              <code className="rounded bg-faint px-1 py-0.5 font-num text-[11px] text-ink">
                {company.demoPassword}
              </code>
              . Select one to fill the form.
            </p>
            <ul className="max-h-60 overflow-y-auto scroll-thin pb-1">
              {company.demoAccounts.map(([addr, role, scope]) => (
                <li key={addr}>
                  <button
                    type="button"
                    onClick={() => useAccount(addr)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-faint"
                  >
                    <span className="text-[12px] font-medium text-primary">{role}</span>
                    <span className="font-num text-[11px] text-muted">{addr}</span>
                    <span className="text-[11px] text-muted">{scope}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
