import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  AUTH_COOKIE_NAME,
  getAuthSecret,
  getJwtIssuer,
  getJwtAudience,
  type AuthTokenPayload,
} from "./lib/auth";
import { isPrelaunchMode } from "./lib/prelaunch";

const GUEST_ONLY_ROUTES = ["/login", "/register"];

const PROTECTED_ROUTES = [
  "/dashboard",
  "/timer",
  "/social",
  "/system",
  "/goals",
  "/quests",
  "/locker",
  "/settings",
  "/inventory",
  "/calendar",
  "/profile",
  "/focus",
  "/notes",
];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isGuestRoute = GUEST_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const isOnboardingRoute = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  // Prelaunch exposes only the landing page, including for existing sessions.
  // Preserve API handlers (especially /api/waitlist) and public/Next assets.
  const isResourceRequest =
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|json|txt|xml|webmanifest|mp4|webm|ogg|mp3|wav|pdf)$/i.test(pathname);

  if (isPrelaunchMode() && pathname !== "/" && !isResourceRequest) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 1. Extract session token from cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  let session: AuthTokenPayload | null = null;
  if (token) {
    try {
      const secret = getAuthSecret();
      // S3: issuer + audience validated here as well (UX layer; API routes
      // enforce the full session through lib/auth-server).
      const { payload } = await jwtVerify(token, secret, {
        issuer: getJwtIssuer(),
        audience: getJwtAudience(),
      });
      session = payload as AuthTokenPayload;
    } catch {
      // Token is expired or invalid — clear it so the user isn't trapped
      session = null;
      if (isGuestRoute) {
        // Let them access the login/register page and clear the bad cookie
        const response = NextResponse.next();
        response.cookies.set({
          name: AUTH_COOKIE_NAME,
          value: "",
          maxAge: 0,
          path: "/",
        });
        return response;
      }
    }
  }

  // 2. Unauthenticated User Accessing Protected Area
  if (!session) {
    if (isProtectedRoute || isOnboardingRoute) {
      const redirectUrl = new URL("/login", request.url);
      if (pathname !== "/dashboard" && pathname !== "/") {
        redirectUrl.searchParams.set("redirect", `${pathname}${search}`);
      }
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // 3. Authenticated User Accessing Guest Routes (/login, /register)
  if (isGuestRoute) {
    const destination = session.hasCompletedOnboarding === false ? "/onboarding" : "/dashboard";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // 4. Authenticated User Onboarding Enforcement (Stateless via JWT)
  if (session.hasCompletedOnboarding === false && !isOnboardingRoute && isProtectedRoute) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (session.hasCompletedOnboarding === true && isOnboardingRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Backwards compatibility alias for middleware
export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico, .woff, .woff2)
     * - api/auth routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$|api/auth).*)",
  ],
};
