import * as THREE from "three";
import type { SiteLayerInfo, SiteLayerKind } from "./types";

export type SiteSurfaceSample = {
  y: number;
  ok: boolean;
  layerName: string | null;
  reason: string;
};

export type SiteSurfaceSampler = {
  sample: (x: number, z: number) => SiteSurfaceSample;
  datumY: number;
  layerNames: string[];
  uncertain: boolean;
};

const FOUNDATION_KINDS: SiteLayerKind[] = ["suggested-development"];
const LATTICE_LIKE = 20;
/** Thin Site pads are treated as a planar walking surface at pad-top elevation. */
const PLANAR_PAD_RANGE_FT = 10;
/** Search radius when the height grid has holes (sparse Site mesh verts). */
const NEAREST_SAMPLE_FT = 160;

type HeightCell = { sum: number; count: number; max: number };

/**
 * Build a lightweight Site/gold surface height sampler.
 * Avoids cloning the full GLB (which freezes generation on large Miami models).
 * Surrounding buildings, roads, and water are ignored for foundation elevation.
 *
 * Site meshes are often boundary-sparse (verts along edges only). Empty interior
 * cells fall back to nearest Site sample, then to planar pad-top when the Site
 * height range is thin.
 */
export function createSiteSurfaceSampler(
  siteRoot: THREE.Object3D | null,
  feetPerModel: number,
  layers: SiteLayerInfo[] = [],
): SiteSurfaceSampler {
  const empty: SiteSurfaceSampler = {
    sample: () => ({
      y: 0,
      ok: false,
      layerName: null,
      reason: "No site surface mesh is available. Elevation defaults to 0 ft until a Site GLB layer is loaded.",
    }),
    datumY: 0,
    layerNames: [],
    uncertain: true,
  };
  if (!siteRoot || !Number.isFinite(feetPerModel) || feetPerModel <= 0) return empty;

  const preferredNames = new Set(
    layers
      .filter((layer) => FOUNDATION_KINDS.includes(layer.kind) || layer.suggestedDevelopment)
      .map((layer) => layer.name),
  );
  if (!preferredNames.size) {
    return {
      sample: () => ({
        y: 0,
        ok: false,
        layerName: null,
        reason: "No classified Site/gold surface layer found. Foundation elevation is uncertain.",
      }),
      datumY: 0,
      layerNames: [],
      uncertain: true,
    };
  }

  siteRoot.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  const samples: Array<{ x: number; y: number; z: number; layer: string }> = [];
  const layerNames: string[] = [];

  siteRoot.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    let node: THREE.Object3D | null = mesh;
    let matched: string | null = null;
    while (node) {
      if (node.name && preferredNames.has(node.name)) {
        matched = node.name;
        break;
      }
      node = node.parent;
    }
    // Also accept gold/site materials nested under differently named parents.
    if (!matched) {
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const matName = (material?.name ?? "").toLowerCase();
      if (matName.includes("site") || matName.includes("gold") || matName.includes("parcel")) {
        matched = [...preferredNames][0] ?? "Site";
      }
    }
    if (!matched) return;
    if (!layerNames.includes(matched)) layerNames.push(matched);
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) return;
    // Dense enough for waterfront pads; still far cheaper than cloning 700+ meshes.
    const stride = Math.max(1, Math.floor(positions.count / 8000));
    for (let i = 0; i < positions.count; i += stride) {
      world.fromBufferAttribute(positions, i);
      mesh.localToWorld(world);
      samples.push({
        x: world.x * feetPerModel,
        y: world.y * feetPerModel,
        z: world.z * feetPerModel,
        layer: matched,
      });
    }
  });

  if (!samples.length) {
    return {
      sample: () => ({
        y: 0,
        ok: false,
        layerName: null,
        reason: "Site/gold layer has no sampleable mesh positions.",
      }),
      datumY: 0,
      layerNames: [...preferredNames],
      uncertain: true,
    };
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const sample of samples) {
    minX = Math.min(minX, sample.x); maxX = Math.max(maxX, sample.x);
    minZ = Math.min(minZ, sample.z); maxZ = Math.max(maxZ, sample.z);
    minY = Math.min(minY, sample.y); maxY = Math.max(maxY, sample.y);
  }
  const spanX = Math.max(LATTICE_LIKE, maxX - minX);
  const spanZ = Math.max(LATTICE_LIKE, maxZ - minZ);
  const yRange = maxY - minY;
  const planarPad = yRange <= PLANAR_PAD_RANGE_FT;
  // Walking surface = top of Site pad (not underside / global min).
  const padTopY = maxY;
  const datumY = planarPad ? padTopY : minY;
  const primaryLayer = layerNames[0] ?? "Site";
  const margin = Math.max(24, Math.min(spanX, spanZ) * 0.04);

  const res = Math.max(12, Math.min(64, Math.round(Math.max(spanX, spanZ) / 10)));
  const cells: HeightCell[] = Array.from({ length: res * res }, () => ({ sum: 0, count: 0, max: -Infinity }));
  const toIndex = (x: number, z: number) => {
    const ix = Math.max(0, Math.min(res - 1, Math.floor(((x - minX) / spanX) * res)));
    const iz = Math.max(0, Math.min(res - 1, Math.floor(((z - minZ) / spanZ) * res)));
    return iz * res + ix;
  };
  for (const sample of samples) {
    const cell = cells[toIndex(sample.x, sample.z)];
    cell.sum += sample.y;
    cell.count += 1;
    cell.max = Math.max(cell.max, sample.y);
  }

  const nearestSampleY = (x: number, z: number): { y: number; dist: number } | null => {
    let best: { y: number; dist: number } | null = null;
    for (const sample of samples) {
      const dx = sample.x - x;
      const dz = sample.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > NEAREST_SAMPLE_FT) continue;
      if (!best || dist < best.dist) best = { y: sample.y, dist };
    }
    return best;
  };

  const insidePlan = (x: number, z: number) =>
    x >= minX - margin && x <= maxX + margin && z >= minZ - margin && z <= maxZ + margin;

  return {
    datumY,
    layerNames,
    uncertain: false,
    sample(x: number, z: number): SiteSurfaceSample {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return { y: datumY, ok: false, layerName: null, reason: "Non-finite plan coordinates for foundation sample." };
      }
      if (!insidePlan(x, z)) {
        return {
          y: datumY,
          ok: false,
          layerName: primaryLayer,
          reason: `Plan point (${x.toFixed(1)}, ${z.toFixed(1)}) is outside the Site surface sampling bounds.`,
        };
      }

      // Nearly-flat Site pad: place foundations on pad top everywhere inside the Site AABB.
      if (planarPad) {
        return {
          y: padTopY,
          ok: true,
          layerName: primaryLayer,
          reason: `Foundation on planar ${primaryLayer} pad top at Y ${padTopY.toFixed(2)} ft (range ${yRange.toFixed(2)} ft).`,
        };
      }

      const cell = cells[toIndex(x, z)];
      if (cell.count && Number.isFinite(cell.max)) {
        return {
          y: cell.max,
          ok: true,
          layerName: primaryLayer,
          reason: `Foundation on ${primaryLayer} at Y ${cell.max.toFixed(2)} ft.`,
        };
      }

      // Sparse mesh: walk neighbor cells, then nearest vertex sample.
      const ix = Math.max(0, Math.min(res - 1, Math.floor(((x - minX) / spanX) * res)));
      const iz = Math.max(0, Math.min(res - 1, Math.floor(((z - minZ) / spanZ) * res)));
      let found: HeightCell | null = null;
      for (let radius = 1; radius <= 8 && !found; radius += 1) {
        for (let dz = -radius; dz <= radius; dz += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = ix + dx;
            const nz = iz + dz;
            if (nx < 0 || nz < 0 || nx >= res || nz >= res) continue;
            const neighbor = cells[nz * res + nx];
            if (neighbor.count) {
              found = neighbor;
              break;
            }
          }
          if (found) break;
        }
      }
      if (found && Number.isFinite(found.max)) {
        return {
          y: found.max,
          ok: true,
          layerName: primaryLayer,
          reason: `Foundation on ${primaryLayer} at Y ${found.max.toFixed(2)} ft (neighbor cell).`,
        };
      }

      const nearest = nearestSampleY(x, z);
      if (nearest) {
        return {
          y: nearest.y,
          ok: true,
          layerName: primaryLayer,
          reason: `Foundation on ${primaryLayer} at Y ${nearest.y.toFixed(2)} ft (nearest Site sample ${nearest.dist.toFixed(1)} ft away).`,
        };
      }

      return {
        y: datumY,
        ok: false,
        layerName: primaryLayer,
        reason: `No Site-surface sample near (${x.toFixed(1)}, ${z.toFixed(1)}). Using datum ${datumY.toFixed(2)} ft.`,
      };
    },
  };
}

/** Relative stack height for vertical hybridization — never a substitute for site-surface foundation. */
export function verticalHybridOffsetFeet(
  typologyIndex: number,
  floorToFloorFeet: number,
): number {
  return Math.max(0, typologyIndex) * Math.max(0, floorToFloorFeet);
}
