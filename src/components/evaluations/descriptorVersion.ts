/**
 * Descriptor algorithm versions.
 *
 * v4.3 is the surface-based evaluation. Sequential Ascent reports verified
 * vertical gain in feet from the main entry, not a 0–100 blend. Occupiable
 * upper decks and perimeter branches still count as levels for the other
 * descriptors. v3.5 remains the voxel-based legacy.
 *
 * Open Volume v4.4.0 requires at least 7.5 ft height and samples a 10 ft
 * horizontal clear diameter. Qualifying heights receive equal credit.
 * The other descriptors stay on v4.3.0.
 */
export const DESCRIPTOR_ALGORITHM_VERSION = "v4.3.0";
export const OPEN_VOLUME_ALGORITHM_VERSION = "v4.4.0";
export const CENTRALIZED_ALGORITHM_VERSION = "centralized-graph-v1.0.0";
export const LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5";

export type DescriptorAlgorithmVersion =
  | typeof DESCRIPTOR_ALGORITHM_VERSION
  | typeof OPEN_VOLUME_ALGORITHM_VERSION
  | typeof CENTRALIZED_ALGORITHM_VERSION
  | typeof LEGACY_DESCRIPTOR_ALGORITHM_VERSION;
