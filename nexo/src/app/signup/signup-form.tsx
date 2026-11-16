"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlert } from "@/components/icons";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Registration failed. Try again.");
        return;
      }

      startTransition(() => {
        router.push(`/verify-otp?email=${encodeURIComponent(email.trim())}`);
      });
    } catch (err: any) {
      setError("A connection error occurred. Please try again.");
    }
  }

  const busy = pending;

  return (
    <form onSubmit={onSubmit} className="mt-7 space-y-4">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-[12px] font-medium text-ink">
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          className="h-10 w-full rounded-[5px] border border-edge bg-surface px-3 text-[13px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

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
          placeholder="you@company.com"
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
          autoComplete="new-password"
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

      <button
        type="submit"
        disabled={busy}
        className="h-10 w-full rounded-[5px] bg-primary text-[13px] font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <div className="mt-6 text-center text-[12.5px] text-muted">
        Already have an account?{" "}
        <a href="/login" className="underline text-primary hover:text-primary-hover transition-colors font-medium">
          Sign in
        </a>
      </div>
    </form>
  );
}
