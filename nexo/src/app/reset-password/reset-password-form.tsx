"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconAlert, IconCheck } from "@/components/icons";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    if (!token || !email) {
      setError("Invalid or expired reset link. Please request a new one.");
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          token,
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

  return (
    <form onSubmit={onSubmit} className="mt-7 space-y-4">
      {!token && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-[5px] border border-danger/35 bg-danger-bg px-3 py-2.5 text-[12.5px] leading-snug text-ink"
        >
          <IconAlert size={15} className="mt-px shrink-0 text-danger" />
          <span>Warning: No reset token detected in the URL. Please request a new link.</span>
        </div>
      )}

      <div>
        <label htmlFor="newPassword" className="mb-1.5 block text-[12px] font-medium text-ink">
          New Password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          disabled={!token}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="••••••••"
          className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-faint disabled:cursor-not-allowed"
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
          disabled={!token}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="••••••••"
          className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:bg-faint disabled:cursor-not-allowed"
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
        disabled={busy || !token}
        className="h-10 w-full rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Resetting Password…" : "Reset Password"}
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
