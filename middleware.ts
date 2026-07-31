import { auth } from "@/auth";

// Protect everything: unauthenticated users are bounced to /login.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLogin = pathname === "/login";

  if (!req.auth && !isLogin) {
    const url = new URL("/login", req.nextUrl.origin);
    return Response.redirect(url);
  }
  // Already signed in but sitting on /login → send to the app.
  if (req.auth && isLogin) {
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  // Run on all paths except Next internals, static files, and /api/* — API routes
  // authenticate themselves (session cookie or x-api-key) and must answer with
  // JSON 401s rather than a redirect to the login page.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
