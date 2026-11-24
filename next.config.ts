import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.LUV_NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {"/api/lobby-generate":["./vendor/lobby-bf7fc3c/**/*","./vendor/lobby-bfce854/**/*"],"/api/gathering-preserved":["./vendor/gathering-preserved/**/*"],"/api/lobby-final-studies": ["./data/lobby-final-studies/v1/**/*"],"/api/presentation-review":["./data/presentation-review/v1/**/*","./data/lobby-final-studies/v1/**/*"],"/api/amphitheater/gallery-clearance":["./src/server/presentation-gallery-clearance.cjs","./data/presentation-review/v1/**/*"]},
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
  // A package-lock.json in the user home directory was being treated as the
  // workspace root, so the dev server never emitted the app routes.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
