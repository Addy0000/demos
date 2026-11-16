"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAlert, IconCheck } from "@/components/icons";

export function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Verification failed. Try again.");
        return;
      }

      setMessage("Email verified successfully! Redirecting...");
      startTransition(() => {
        router.push("/login?verified=true");
      });
    } catch (err) {
      setError("A connection error occurred. Please try again.");
    }
  }

  async function handleResend() {
    if (!email) {
      setError("Please enter your email to resend OTP.");
      return;
    }
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to resend OTP. Try again.");
        return;
      }

      setMessage("A new 6-digit OTP has been sent to your email.");
      setCooldown(30);
    } catch (err) {
      setError("A connection error occurred. Please try again.");
    }
  }

  const busy = pending;

  return (
    <form onSubmit={onSubmit} className="mt-7 space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          readOnly={!!emailParam}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={`h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 ${
            emailParam ? "bg-faint text-muted cursor-not-allowed" : ""
          }`}
        />
      </div>

      <div>
        <label htmlFor="otp" className="mb-1.5 block text-[12px] font-medium text-ink">
          6-Digit OTP Code
        </label>
        <input
          id="otp"
          name="otp"
          type="text"
          maxLength={6}
          required
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="h-10 w-full text-center tracking-[8px] font-num text-[17px] font-semibold rounded-[5px] border border-edge bg-surface px-3 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
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

      {message && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[5px] border border-success/35 bg-success-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink"
        >
          <IconCheck size={15} className="mt-px shrink-0 text-success" />
          <span>{message}</span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 flex-1 rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Verifying…" : "Verify OTP"}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="h-10 px-4 rounded-[5px] border border-edge bg-surface text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend OTP"}
        </button>
      </div>

      <div className="mt-6 text-center text-[12.5px] text-muted">
        Back to{" "}
        <a href="/login" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
          Sign in
        </a>
      </div>
    </form>
  );
}
