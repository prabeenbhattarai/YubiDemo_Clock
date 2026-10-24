import type { NextConfig } from "next";

// Security headers applied to every response. Kept deliberately safe for this
// app: camera + geolocation are allowed for the site's own origin (worker
// clock-in needs the selfie camera and GPS), and the CSP only locks framing
// (`frame-ancestors`) so it can't break Firebase, Google sign-in, or map tiles.
// A full resource-restricting CSP would need careful testing against those and
// is intentionally left out for now.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), browsing-topics=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework/version.
  poweredByHeader: false,
  // Baked in at build time so pages can show which version is live (handy for
  // confirming a worker's app actually picked up the latest deploy).
  env: {
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_REV: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
