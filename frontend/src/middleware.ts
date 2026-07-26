import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk middleware only attaches auth context here — it deliberately does NOT
// redirect protected routes.
//
// Why: a redirect returned from middleware is issued to Next.js client-side
// navigations and <Link> prefetches, not just full page loads. During an
// App-Router client navigation the router cannot reconcile a 3xx to a *different*
// route (here "/") with the URL it requested (/plan, /trips, ...), so it retries
// endlessly — the page flickers / continuously reloads when reached from a
// prefetched navbar or home-page link. Direct URL access doesn't loop because the
// browser follows the redirect once. The RSC header that would let us special-case
// those requests is stripped before middleware runs (verified: it reads as null),
// and Clerk itself now recommends resource-based checks over middleware path
// matching, so middleware is the wrong layer to enforce this.
//
// Auth is still enforced where it matters:
//   - the FastAPI backend rejects any data request without a valid Clerk token;
//   - protected pages (e.g. /trips) redirect to "/" on a 401/403 from the API;
//   - signed-out users are not shown links to protected routes in the nav.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Clerk proxy matcher
    '/__clerk/:path*'
  ],
};
