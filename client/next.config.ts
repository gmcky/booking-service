import type { NextConfig } from "next";

/** Where property photos come from: seed data lives on Unsplash, uploads are
 *  served by the API itself (Hetzner in production, localhost in dev). */
const imageHosts: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "booking-api.gmcky.dev", pathname: "/uploads/**" },
  { protocol: "http", hostname: "localhost", port: "3000", pathname: "/uploads/**" },
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
};

export default nextConfig;
