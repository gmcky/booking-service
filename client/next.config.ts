import type { NextConfig } from "next";

/** Where property photos come from: seed data lives on Unsplash, uploads are
 *  served by the API itself (Hetzner in production, localhost in dev). */
const imageHosts: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "booking-api.gmcky.dev", pathname: "/uploads/**" },
  { protocol: "http", hostname: "localhost", port: "3000", pathname: "/uploads/**" },
];

/**
 * Deliberately no `default-src`, `script-src` or `connect-src`. Next injects
 * inline bootstrap scripts, and the app pulls in Stripe, Google Identity
 * Services, OpenFreeMap tiles and Unsplash photos at runtime — covering that
 * with a source list needs per-request nonces from a proxy, which is a bigger
 * change than this app earns, and a half-written source list is worse than
 * none because it fails silently in production.
 *
 * What's left is enforced rather than report-only, because every directive
 * here is exact: nothing may frame the site, inject a <base>, post its forms
 * elsewhere, or load a plugin.
 */
const CSP = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  // frame-ancestors already says this; kept for browsers that predate CSP 2.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Geolocation stays on for the search pill's "Nearby" shortcut.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), interest-cohort=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imageHosts,
    // Trimmed from the defaults: this layout tops out around a 1200px hero and
    // the rest are cards, so the wider breakpoints only ever cost transforms.
    deviceSizes: [390, 640, 828, 1080, 1200, 1600],
    imageSizes: [64, 96, 128, 160, 256, 384],
    // Photos are immutable once uploaded, and seed URLs never change.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
