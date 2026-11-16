import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { sendOTPEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    const trimmedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });

    if (existing) {
      return NextResponse.json(
        { message: "Email already registered" },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await prisma.user.create({
      data: {
        name,
        email: trimmedEmail,
        passwordHash: hashed,
        role: Role.SALES, // Default role for self-signup
        isVerified: false,
        isActive: true,
        otp,
        otpExpiresAt,
      },
    });

    // Send email
    await sendOTPEmail(user.email, otp);

    return NextResponse.json(
      {
        message: "Registration successful. Please verify your email with the OTP sent.",
        email: user.email,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Register API Error:", err);
    return NextResponse.json(
      { message: "Server error", error: err.message },
      { status: 500 }
    );
  }
}
