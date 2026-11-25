import type { NextConfig } from "next";

const siteWorkers = [
  "./scripts/*.cjs",
  "./public/experiment-designs/0aef1f14-66a5-45b3-a2ba-a31248841e7f/{input,rule-a}.json",
  "./public/experiment-designs/17cb9692-eb78-4a54-9314-7e3de823daa7/rule-a.json",
  "./vendor/architectural-board/**/*",
  "./vendor/typology-proof-20261121/**/*",
  "./fixtures/inserted-plate/**/*",
  "./public/experiment-inputs/**/*",
  "./public/samples/miami-waterfront.glb",
  "./src/components/polygonExperiment/*.json",
  "./src/components/polygonExperiment/*.ts",
  "./src/components/siteDevelopment/hybridization.ts",
  "./src/components/siteDevelopment/types.ts",
  "./src/components/lattice/types.ts",
  "./src/components/evaluations/descriptorV2.ts",
  "./reports/multi-typology-first-proof-20261121/dependencies.json",
  "./node_modules/{manifold-3d,three,three-mesh-bvh,typescript,sharp,@img,detect-libc,semver}/**/*",
];

const siteWorkerConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/experiment/site-polygon-morphogenesis/{design,orientation,site-rules,shared-site-rules,site-typology-handoff}": siteWorkers,
    "/experiment/site-polygon-morphogenesis/checkpoint": ["./fixtures/site-development-checkpoint/miami-session.json.gz"],
  },
  typescript: { tsconfigPath: "tsconfig.site-integration.json" },
};

const nextConfig: NextConfig = {
  ...siteWorkerConfig,
  serverExternalPackages: ["manifold-3d", "rhino3dm"],
};

export default nextConfig;
