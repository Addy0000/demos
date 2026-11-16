import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || process.env.SMTP_HOST || "sandbox.smtp.mailtrap.io",
  port: parseInt(process.env.MAIL_PORT || process.env.SMTP_PORT || "587", 10),
  auth: {
    user: process.env.MAIL_USER || process.env.SMTP_USER || "",
    pass: process.env.MAIL_PASS || process.env.SMTP_PASSWORD || "",
  },
});

export async function sendOTPEmail(email: string, otp: string) {
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_FROM_EMAIL || "hello@seasonx.in",
    to: email,
    subject: "Verify Your Email - OTP",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">Welcome to ERP System</h2>
        <p>Please verify your email address using the following 6-digit One-Time Password (OTP):</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 4px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1a73e8; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This OTP is valid for 10 minutes. If you did not sign up for an account, please ignore this email.</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

export async function sendResetPasswordOTPEmail(email: string, otp: string) {
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_FROM_EMAIL || "hello@seasonx.in",
    to: email,
    subject: "Reset Your Password - OTP",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #333;">Password Reset OTP</h2>
        <p>You requested to reset your password. Please use the following 6-digit OTP to complete your reset request:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 4px; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1a73e8; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 14px;">This OTP is valid for 15 minutes. If you did not request a password reset, please ignore this email.</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}
