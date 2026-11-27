/**
 * Descriptor algorithm versions.
 *
 * v4.3 is the surface-based evaluation. Sequential Ascent reports verified
 * vertical gain in feet from the main entry, not a 0–100 blend. Occupiable
 * upper decks and perimeter branches still count as levels for the other
 * descriptors. v3.5 remains the voxel-based legacy.
 *
 * Open Volume v4.7.0 keeps the v4.6.0 geometric measurements: covered floor,
 * at least 7 ft height and a sampled 10 ft horizontal clear diameter. It scores
 * the largest continuous sheltered field against 400 ft² / 2,800 ft³, with the
 * covered-floor share retained as an unweighted diagnostic. Surfaces
 * open to sky are excluded. Qualifying heights receive equal credit.
 * The other descriptors stay on v4.3.0.
 */
export const DESCRIPTOR_ALGORITHM_VERSION = "v4.3.0";
export const OPEN_VOLUME_ALGORITHM_VERSION = "v4.7.0";
/** Geometry/evidence-layer revision; v4.7 changes score calibration only. */
export const OPEN_VOLUME_EVIDENCE_VERSION = 3;
export const CENTRALIZED_ALGORITHM_VERSION = "centralized-graph-v1.0.0";
export const LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5";

export type DescriptorAlgorithmVersion =
  | typeof DESCRIPTOR_ALGORITHM_VERSION
  | typeof OPEN_VOLUME_ALGORITHM_VERSION
  | "v4.4.0"
  | "v4.5.0"
  | "v4.6.0"
  | "centralized-verified-v2.0.0"
  | "centralized-floor-v3.0.0"
  | "centralized-area-v4.0.0"
  | typeof CENTRALIZED_ALGORITHM_VERSION
  | typeof LEGACY_DESCRIPTOR_ALGORITHM_VERSION;
