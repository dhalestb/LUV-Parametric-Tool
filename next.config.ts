import type { NextConfig } from "next";
import path from "node:path";

// Child processes resolve these files from disk, outside the server bundle.
const manifoldRuntime = [
  "./node_modules/manifold-3d/package.json",
  "./node_modules/manifold-3d/manifold.js",
  "./node_modules/manifold-3d/manifold.wasm",
];
const geometryWorkerRuntime = [
  ...manifoldRuntime,
  "./node_modules/typescript/package.json",
  "./node_modules/typescript/lib/typescript.js",
  "./node_modules/three/package.json",
  "./node_modules/three/build/{three.cjs,three.module.js,three.core.js}",
  "./node_modules/three-mesh-bvh/package.json",
  "./node_modules/three-mesh-bvh/build/index.umd.cjs",
  "./node_modules/sharp/package.json",
  "./node_modules/sharp/dist/**/*",
  "./node_modules/@img/colour/**/*",
  "./node_modules/@img/sharp-*/**/*",
  "./node_modules/detect-libc/**/*",
  "./node_modules/semver/**/*",
];
const sharedWorkerSources = [
  "./proof/{input.json,field-config.cjs,render.cjs,rule-amphitheater.cjs,rule-validation.cjs,abstract-validation.cjs}",
  "./scripts/{amphitheater-interactive-worker,amphitheater-interactive-organization,ts-test-register}.cjs",
  "./scripts/source-*.cjs",
  "./scripts/{experimental-opening-profile,anchored-room,live-perimeter-room,room-contour-plan,seal-curved-walls,join-v-flanks,full-corner-joints,corner-pier,join-curved-neighbors,perimeter-letter-panels,join-level-plates,suspended-polygon-room,full-perimeter-lofts,upright-opening-profile,room-edge-platforms}.cjs",
  "./src/components/{officeWorkspaceGeometry,letterGeometry3d,architecturalLetterSizing,letterVolumeLayout}.ts",
  "./src/components/workspace-rules/*.geometry.ts",
  "./src/components/workspace-rules/{open-hall-workspace,void-edge-workspace.rules,void-edge-planar}.ts",
];

const nextConfig: NextConfig = {
  distDir: process.env.LUV_NEXT_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/api/amphitheater": [...geometryWorkerRuntime, ...sharedWorkerSources],
    "/api/lobby-generate": [...geometryWorkerRuntime, "./vendor/lobby-bf7fc3c/**/*", "./vendor/lobby-bfce854/**/*"],
    "/api/gathering-preserved": [
      ...geometryWorkerRuntime,
      "./vendor/gathering-preserved/**/*",
      "./scripts/gathering-plate-closure-validator.cjs",
      "./scripts/gathering-plate-level-receivers.cjs",
    ],
    "/api/lobby-final-studies": ["./data/lobby-final-studies/v1/**/*"],
    "/api/presentation-review": ["./data/presentation-review/v1/**/*", "./data/lobby-final-studies/v1/**/*"],
    "/api/amphitheater/gallery-clearance": [...manifoldRuntime, "./src/server/presentation-gallery-clearance.cjs", "./data/presentation-review/v1/**/*"],
  },
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
  // A package-lock.json in the user home directory was being treated as the
  // workspace root, so the dev server never emitted the app routes.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
