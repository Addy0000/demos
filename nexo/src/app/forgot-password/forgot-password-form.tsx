"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconCheck } from "@/components/icons";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [step, setStep] = useState(1); // 1 = Request OTP, 2 = Verify OTP & Reset Password
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to send reset OTP. Try again.");
        return;
      }

      setMessage(data.message || "If that email exists, a password reset OTP has been sent.");
      setStep(2);
    } catch (err) {
      setError("A connection error occurred. Please try again.");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to reset password. Try again.");
        return;
      }

      setMessage("Password reset successful! Redirecting to sign in...");
      startTransition(() => {
        setTimeout(() => {
          router.push("/login?reset=true");
        }, 1500);
      });
    } catch (err) {
      setError("A connection error occurred. Please try again.");
    }
  }

  const busy = pending;

  if (step === 1) {
    return (
      <form onSubmit={handleRequestOtp} className="mt-7 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
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

        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Sending OTP…" : "Request Reset OTP"}
        </button>

        <div className="mt-6 text-center text-[12.5px] text-muted">
          Back to{" "}
          <a href="/login" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
            Sign in
          </a>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleResetPassword} className="mt-7 space-y-4">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-ink">
          Email address
        </label>
        <input
          type="email"
          readOnly
          value={email}
          className="h-10 w-full rounded-[5px] border border-edge bg-faint px-3 text-[13px] text-muted cursor-not-allowed"
        />
      </div>

      <div>
        <label htmlFor="otp" className="mb-1.5 block text-[12px] font-medium text-ink">
          6-Digit Reset OTP
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
          className="h-10 w-full text-center tracking-[4px] font-num text-[15px] font-semibold rounded-[5px] border border-edge bg-surface px-3 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-[12px] font-medium text-ink">
          New Password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1.5 block text-[12px] font-medium text-ink">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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

      {message && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-[5px] border border-success/35 bg-success-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink"
        >
          <IconCheck size={15} className="mt-px shrink-0 text-success" />
          <span>{message}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="h-10 w-full rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Resetting Password…" : "Reset Password"}
      </button>

      <div className="mt-6 text-center text-[12.5px] text-muted">
        Remembered your password?{" "}
        <a href="/login" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
          Sign in
        </a>
      </div>
    </form>
  );
}
