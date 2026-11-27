/** Report all covered passing regions separately from the largest scoring field. */
function measurementNumber(measurements: Record<string, number | string | null>, key: string) {
  return typeof measurements[key] === "number" && Number.isFinite(measurements[key])
    ? Number(measurements[key]).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—";
}

export function openVolumeSummary(measurements: Record<string, number | string | null> = {}, version?: string): string[] {
  const number = (key: string) => measurementNumber(measurements, key);
  if (typeof measurements.totalQualifyingVolumeFt3 !== "number" || measurements.openSkyExcluded !== 1) {
    return ["Covered-only totals are not in this cached result. Analyze the source OBJ to refresh its evidence."];
  }
  return [
    `Total qualifying covered volume: ${number("totalQualifyingVolumeFt3")} ft³ over ${number("totalQualifyingFloorFt2")} ft² across all qualifying regions.`,
    `Sheltered regions: ${number("qualifyingClearFloorFt2")} ft² across ${number("continuousFieldPockets")} regions. Surfaces open to sky are excluded.`,
    `Largest continuous sheltered field: ${number("continuousFieldFloorFt2")} ft² · ${number("continuousFieldVolumeFt3")} ft³.`,
    `All volume totals use ${number("qualifyingVolumeHeightFt")} ft of credit height. Volume used by the score: ${number("clearanceVolumeFt3")} ft³ from the largest continuous sheltered field.`,
    ...(version === "v4.7.0" ? ["Absolute score = 100 × largest qualifying volume / 2,800 ft³, capped at 100. Full credit is 400 ft² at 7 ft height. Covered-floor share is informational; session rank is separate."] : []),
  ];
}

/** Concise enough for the existing comparison export's fixed footer line. */
export function openVolumeComparisonNote(code: string, measurements: Record<string, number | string | null> = {}) {
  return `${code}: total ${measurementNumber(measurements, "totalQualifyingVolumeFt3")} ft³; largest field ${measurementNumber(measurements, "continuousFieldVolumeFt3")} ft³ (${measurementNumber(measurements, "continuousFieldFloorFt2")} ft²)`;
}
