"use client";

import { useFormStatus } from "react-dom";

const BASE =
  "inline-flex h-[28px] items-center justify-center gap-1 rounded-[2px] px-2.5 text-[12px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1";

const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-pastel text-primary-hover hover:bg-accent-soft",
  outline: "border border-edge bg-surface text-ink hover:bg-faint",
  danger: "border border-danger/40 bg-danger-bg text-danger-text hover:bg-danger/20",
  success: "border border-success/40 bg-success-bg text-success-text hover:bg-success/20",
  ghost: "text-muted hover:bg-faint hover:text-ink",
} as const;

export function Button({
  variant = "outline",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} suppressHydrationWarning {...rest} />;
}

/** Submit button wired to the enclosing form's pending state. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${BASE} ${VARIANTS[variant]} ${className}`} suppressHydrationWarning>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

const FIELD =
  "h-[30px] w-full rounded-[2px] border border-edge bg-surface px-2 text-[12.5px] text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12 disabled:bg-faint disabled:text-muted";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  span,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={span ? "sm:col-span-full" : ""}>
      <label className="mb-1 block text-[11.5px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</p>}
      {error && <p className="mt-0.5 text-[11px] leading-snug text-danger">{error}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD} ${props.className ?? ""}`} suppressHydrationWarning />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-[2px] border border-edge bg-surface px-2 py-1.5 text-[12.5px] leading-relaxed text-ink placeholder:text-muted/70 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/12 ${props.className ?? ""}`}
      suppressHydrationWarning
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD} ${props.className ?? ""}`} suppressHydrationWarning />;
}

export function FormGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 1 | 2 | 3 }) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-3 ${cols}`}>{children}</div>;
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-[2px] border border-danger/35 bg-danger-bg px-2.5 py-2 text-[12px] leading-snug text-ink"
    >
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="rounded-[2px] border border-success/35 bg-success-bg px-2.5 py-2 text-[12px] leading-snug text-ink"
    >
      {message}
    </div>
  );
}
