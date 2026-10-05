import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  env: {
    // Identifies this build to the service worker, so a new deploy changes
    // /sw.js and installed copies notice there's an update.
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36),
  },
};

export default nextConfig;
