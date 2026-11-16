import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthAside } from "@/components/auth-aside";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot Password" };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,44%)_1fr] lg:grid-rows-1">
      <AuthAside />

      <div className="grid place-items-center bg-canvas px-6 py-12">
        <div className="w-full max-w-[368px]">
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">Reset Password</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            Request an OTP code via email to securely reset your password.
          </p>

          <ForgotPasswordForm />

          <p className="mt-8 border-t border-edge pt-3 text-[11px] leading-relaxed text-muted">
            Demonstration environment. All customer, vendor, project and pricing records are
            synthetic.
          </p>
        </div>
      </div>
    </main>
  );
}
