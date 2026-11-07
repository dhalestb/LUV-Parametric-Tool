import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolated persistence QA builds must not replace the running recovered-session build.
  distDir: process.env.LUV_BUILD_DIRECTORY || ".next",
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
};

export default nextConfig;
