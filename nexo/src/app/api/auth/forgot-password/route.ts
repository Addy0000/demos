import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendResetPasswordOTPEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json(
        { message: "Email required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    const successResponse = {
      message: "If that email exists, a password reset OTP has been sent.",
      email: trimmedEmail,
    };

    // Return success to avoid email enumeration
    if (!user) {
      return NextResponse.json(successResponse);
    }

    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetOtp,
        resetTokenExpiresAt,
      },
    });

    await sendResetPasswordOTPEmail(user.email, resetOtp);

    return NextResponse.json(successResponse);
  } catch (err: any) {
    console.error("Forgot Password API Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}
