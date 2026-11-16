import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getTenantKey } from "@/lib/tenant-server";
import type { TenantKey } from "@/lib/tenants";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      vendorId: string | null;
      jobTitle: string | null;
      tenant: TenantKey;
    };
  }
  interface User {
    id?: string;
    role: Role;
    vendorId: string | null;
    jobTitle: string | null;
    tenant: TenantKey;
  }
}

/**
 * The JWT payload this app puts on the token. next-auth v5's JWT type is not
 * augmentable from here, so the shape is declared once and asserted at the two
 * points where the token is read and written.
 */
type AppToken = {
  uid: string;
  role: Role;
  vendorId: string | null;
  jobTitle: string | null;
  /** The company the account belongs to. A session is only valid inside it. */
  tenant: TenantKey;
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });

        // Deactivated accounts fail exactly like wrong passwords — no enumeration.
        if (!user || !user.isActive) return null;

        // Ensure user has verified their OTP
        if (!user.isVerified) {
          throw new Error("unverified");
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vendorId: user.vendorId,
          jobTitle: user.jobTitle,
          tenant: await getTenantKey(),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        Object.assign(token, {
          uid: user.id!,
          role: user.role,
          vendorId: user.vendorId,
          jobTitle: user.jobTitle,
          tenant: user.tenant,
        } satisfies AppToken);
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as AppToken;
      if (t && session.user) {
        session.user.id = t.uid;
        session.user.role = t.role;
        session.user.vendorId = t.vendorId;
        session.user.jobTitle = t.jobTitle;
        session.user.tenant = t.tenant;
      }
      return session;
    },
  },
});
