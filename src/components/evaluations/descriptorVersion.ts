/**
 * Descriptor algorithm versions.
 *
 * v4.3 is the surface-based evaluation. Sequential Ascent reports verified
 * vertical gain in feet from the main entry, not a 0–100 blend. Occupiable
 * upper decks and perimeter branches still count as levels for the other
 * descriptors. v3.5 remains the voxel-based legacy.
 */
export const DESCRIPTOR_ALGORITHM_VERSION = "v4.3.0";
export const LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5";

export type DescriptorAlgorithmVersion = typeof DESCRIPTOR_ALGORITHM_VERSION | typeof LEGACY_DESCRIPTOR_ALGORITHM_VERSION;
