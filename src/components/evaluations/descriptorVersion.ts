/**
 * Descriptor algorithm versions.
 *
 * v4.1 is the surface-based evaluation. Occupiable upper decks and perimeter
 * branches count as levels even without stairs. Every form receives a 0–100
 * score and a rank. v3.5 remains the voxel-based legacy evaluation.
 */
export const DESCRIPTOR_ALGORITHM_VERSION = "v4.1";
export const LEGACY_DESCRIPTOR_ALGORITHM_VERSION = "v3.5";

export type DescriptorAlgorithmVersion = typeof DESCRIPTOR_ALGORITHM_VERSION | typeof LEGACY_DESCRIPTOR_ALGORITHM_VERSION;
