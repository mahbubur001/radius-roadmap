import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev badge covered the public site's logo, Sign in or phone dock in
  // every corner; errors still pop up without it (Next 16 docs).
  devIndicators: false,
  experimental: {
    // The dev cache reused across restarts went stale here and sent the
    // browser into a reload loop (2026-11-03); start each dev run fresh.
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
