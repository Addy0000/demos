import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email, otp, token, newPassword } = await request.json();
    const finalOtp = otp || token;

    if (!email || !finalOtp || !newPassword) {
      return NextResponse.json(
        { message: "Email, OTP code, and new password are required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({
      where: {
        email: trimmedEmail,
        resetToken: finalOtp,
        resetTokenExpiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Invalid or expired reset OTP" },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashed,
        resetToken: null,
        resetTokenExpiresAt: null,
      },
    });

    return NextResponse.json({
      message: "Password reset successful. Please log in with your new password.",
    });
  } catch (err: any) {
    console.error("Reset Password API Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}
