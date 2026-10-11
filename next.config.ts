import type { NextConfig } from "next";
import { PRIVATE_ROUTE_SOURCES, baseSecurityHeaders } from "./src/server/security/headers";

const isDev = process.env.NODE_ENV !== "production";
const enableStripe = process.env.NEXT_PUBLIC_ENABLE_REAL_PAYMENTS === "true";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Photos are never served through the image optimizer; only first-party brand assets.
  images: {
    remotePatterns: [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: baseSecurityHeaders({ isDev, enableStripe }),
      },
      ...PRIVATE_ROUTE_SOURCES.map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
