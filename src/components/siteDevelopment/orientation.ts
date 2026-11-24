/**
 * Site Development orientation search — independent of the Lattice assembly solver.
 * Reuses Lattice discrete rotation constants only; placement logic stays here.
 */
import { ROTATIONS, type Rotation } from "../lattice/types";
import type { OrientationMode, SiteTypologyId } from "./types";

export const SITE_YAW_COARSE_DEG: readonly number[] = [...ROTATIONS];
export const SITE_YAW_FINE_45_DEG: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
export const SITE_YAW_FINE_15_DEG: readonly number[] = Array.from({ length: 24 }, (_, i) => i * 15);

export type OrientationSearchOptions = {
  mode: OrientationMode;
  preferredYawDeg: number;
  /** When true, only the preferred yaw is considered (locked composition). */
  lockPreferredYaw?: boolean;
  /** Optional typology-specific allowed yaws. Empty / missing = all candidates. */
  allowedYawByTypology?: Partial<Record<SiteTypologyId, number[]>>;
  typology?: SiteTypologyId | null;
  /** Include 45° steps after coarse set fails (automatic / hybrid only). */
  enableFine45?: boolean;
  /** Hard budget of yaw evaluations per placement attempt. */
  maxYawTests?: number;
};

function normalizeYaw(deg: number) {
  const n = ((deg % 360) + 360) % 360;
  return Math.abs(n - 360) < 1e-9 ? 0 : n;
}

function uniqueYaws(values: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    const yaw = Math.round(normalizeYaw(value) * 1000) / 1000;
    if (seen.has(yaw)) continue;
    seen.add(yaw);
    out.push(yaw);
  }
  return out;
}

/**
 * Deterministic ordered yaw candidates for one placement attempt.
 * Preferred yaw is always first when present in the permitted set.
 */
export function resolveYawCandidates(options: OrientationSearchOptions): number[] {
  const preferred = normalizeYaw(options.preferredYawDeg);
  const mode = options.mode ?? "fixed";
  const maxTests = Math.max(1, options.maxYawTests ?? 12);

  if (options.lockPreferredYaw || mode === "fixed") {
    return [preferred];
  }

  const typologyAllowed = options.typology && options.allowedYawByTypology?.[options.typology];
  const basePool = typologyAllowed?.length
    ? typologyAllowed.map(normalizeYaw)
    : [...SITE_YAW_COARSE_DEG];

  let ordered: number[] = [];
  if (mode === "hybrid" || mode === "automatic") {
    ordered.push(preferred);
  }
  // Prefer angles near preferred, then remaining discrete set.
  const scored = uniqueYaws(basePool)
    .filter((yaw) => Math.abs(normalizeYaw(yaw - preferred)) > 1e-6)
    .sort((a, b) => {
      const da = Math.min(Math.abs(a - preferred), 360 - Math.abs(a - preferred));
      const db = Math.min(Math.abs(b - preferred), 360 - Math.abs(b - preferred));
      return da - db || a - b;
    });
  ordered = uniqueYaws([...ordered, ...scored]);

  if (options.enableFine45 && ordered.length < maxTests) {
    const fine = SITE_YAW_FINE_45_DEG
      .map(normalizeYaw)
      .filter((yaw) => !ordered.some((item) => Math.abs(item - yaw) < 1e-6))
      .sort((a, b) => {
        const da = Math.min(Math.abs(a - preferred), 360 - Math.abs(a - preferred));
        const db = Math.min(Math.abs(b - preferred), 360 - Math.abs(b - preferred));
        return da - db || a - b;
      });
    ordered = uniqueYaws([...ordered, ...fine]);
  }

  return ordered.slice(0, maxTests);
}

export function yawDeviatesFromPreferred(actualYawDeg: number, preferredYawDeg: number, toleranceDeg = 0.5) {
  const delta = Math.abs(normalizeYaw(actualYawDeg) - normalizeYaw(preferredYawDeg));
  return Math.min(delta, 360 - delta) > toleranceDeg;
}

export function isOrientationMode(value: unknown): value is OrientationMode {
  return value === "fixed" || value === "automatic" || value === "hybrid";
}

export function normalizeOrientationMode(value: unknown): OrientationMode {
  return isOrientationMode(value) ? value : "fixed";
}

/** Lattice coarse rotations exposed for Site consumers without importing solver internals. */
export function latticeCoarseRotations(): Rotation[] {
  return [...ROTATIONS];
}
