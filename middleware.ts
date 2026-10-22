import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Any visitor to /dashboard who isn't signed in is sent to the Google login.
export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"], // only the dashboard is gated
};
