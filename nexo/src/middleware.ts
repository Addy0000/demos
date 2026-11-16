import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/denied", "/signup", "/verify-otp", "/forgot-password", "/reset-password"];
const TENANTS = ["tangent", "duplast", "trident", "raj", "harvest", "meridian", "kestrel", "loomcraft"];

/**
 * Edge gate: presence of a session cookie only. Role and permission checks run in
 * the server components and actions via requirePermission()/assertPermission(),
 * where the Prisma client and the full JWT payload are available.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.startsWith("/select")) {
    return NextResponse.next();
  }

  // Which company is this demo for? Nothing else makes sense until that is chosen.
  const tenant = req.cookies.get("tenant")?.value;
  if (!tenant || !TENANTS.includes(tenant)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No company selected" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/select";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/api/auth") || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token =
    req.cookies.get("authjs.session-token")?.value ??
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
