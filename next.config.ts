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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
