import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/amphitheater': [
      './scripts/*.cjs','./proof/*.cjs','./proof/input.json',
      './src/components/*.ts','./node_modules/typescript/lib/**','./node_modules/typescript/package.json',
      './node_modules/manifold-3d/**','./node_modules/three/**','./node_modules/three-mesh-bvh/**'
    ]
  },
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
  // A package-lock.json in the user home directory was being treated as the
  // workspace root, so the dev server never emitted the app routes.
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
