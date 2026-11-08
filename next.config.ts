import type { NextConfig } from "next";

// GitHub Pages deploy: STATIC_EXPORT=1 produces a fully static build
// under /forgotten-game/ (project-page base path), in a SEPARATE dist
// dir so the running dev server's .next is never touched.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport
    ? {
        distDir: process.env.NEXT_DIST_DIR || ".next-export",
        basePath: "/forgotten-game",
        assetPrefix: "/forgotten-game",
        images: { unoptimized: true },
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
