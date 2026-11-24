/**
 * Descriptor algorithm versions.
 *
 * v4.3 is the surface-based evaluation. Sequential Ascent reports verified
 * vertical gain in feet from the main entry, not a 0–100 blend. Occupiable
 * upper decks and perimeter branches still count as levels for the other
 * descriptors. v3.5 remains the voxel-based legacy.
 *
 * Open Volume v4.4.1 requires at least 7.5 ft height. Other forms sample a
 * 10 ft horizontal clear diameter. Lobby slots sample a 7.5 ft clear width.
 * Qualifying heights receive equal credit. The other descriptors stay on v4.3.4.
 * v4.3.1 counts a lobby floor only under a ceiling with at least 7 ft clear height.
 * v4.3.2 keeps every separated part of a counted lobby floor.
 * v4.3.3 counts only the 5 ft floor on linear.
 * v4.3.4 reads every part of that linear floor as one floor.
 */
export const DESCRIPTOR_ALGORITHM_VERSION = "v4.3.4";
export const OPEN_VOLUME_ALGORITHM_VERSION = "v4.4.1";
export const CENTRALIZED_ALGORITHM_VERSION = "centralized-graph-v1.0.0";
export const LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5";

export type DescriptorAlgorithmVersion =
  | typeof DESCRIPTOR_ALGORITHM_VERSION
  | typeof OPEN_VOLUME_ALGORITHM_VERSION
  | "centralized-verified-v2.0.0"
  | "centralized-floor-v3.0.0"
  | "centralized-area-v4.0.0"
  | typeof CENTRALIZED_ALGORITHM_VERSION
  | typeof LEGACY_DESCRIPTOR_ALGORITHM_VERSION;
