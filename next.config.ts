import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/amphitheater": [
      "./scripts/proto-form-worker.cjs",
      "./scripts/ts-test-register.cjs",
      "./src/components/workspace-rules/**/*",
      "./src/components/letterGeometry3d.ts",
      "./node_modules/typescript/**/*",
      "./node_modules/manifold-3d/**/*",
      "./node_modules/three/**/*",
    ],
  },
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
};

export default nextConfig;
