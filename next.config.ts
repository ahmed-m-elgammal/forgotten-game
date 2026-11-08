import type { NextConfig } from "next";

// Two static-export flavors, in SEPARATE dist dirs so the running dev
// server's .next is never touched:
//   STATIC_EXPORT=1 → GitHub Pages: built under /forgotten-game/ base path
//   STORE_EXPORT=1  → Capacitor shells (Android/iOS): served from the app
//                     bundle root, so NO base path. This is the webDir.
const isPagesExport = process.env.STATIC_EXPORT === "1";
const isStoreExport = process.env.STORE_EXPORT === "1";
const isExport = isPagesExport || isStoreExport;

// NOTE: the store dist dir must NOT start with a dot — GitHub Actions'
// upload-artifact skips "hidden" files/dirs by default.
const nextConfig: NextConfig = {
  output: isExport ? "export" : "standalone",
  ...(isExport
    ? {
        distDir: isStoreExport
          ? "next-store"
          : process.env.NEXT_DIST_DIR || ".next-export",
        ...(isPagesExport
          ? { basePath: "/forgotten-game", assetPrefix: "/forgotten-game" }
          : {}),
        images: { unoptimized: true },
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
