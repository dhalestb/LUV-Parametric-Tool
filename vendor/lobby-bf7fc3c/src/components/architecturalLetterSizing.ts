import { UNIT_LETTER_SPAN } from "./letterVolumeLayout";
import type { GenerationRules } from "./optimizerTypes";
import type { SelectionHeightFeet } from "./selectionHeightRouting";

/**
 * Letter size measurement (feet)
 * ------------------------------
 * Unit letterforms from `getLetterVolumeGeometry` span UNIT_LETTER_SPAN (0.92)
 * in plan before scale. Placement scale multiplies that footprint:
 *
 *   letterFootprintFeet = placement.scale × UNIT_LETTER_SPAN
 *
 * This is the unrotated plan span (architectural width/depth of the glyph).
 * Thickness is a separate percentage of letter size (`letterThicknessPercent`).
 * Axis scaleX/Y/Z may further deform axes when preserveProportions is false.
 */

export type LetterSizePreset = {
  height: SelectionHeightFeet;
  minimumFeet: number;
  preferredFeet: number;
  maximumFeet: number;
  note: string;
};

/** Preliminary design guidelines — editable, not hard geometric limits. */
export const LETTER_SIZE_PRESETS: Record<SelectionHeightFeet, LetterSizePreset> = {
  20: {
    height: 20,
    minimumFeet: 6,
    preferredFeet: 9,
    maximumFeet: 12,
    note: "Suggested 6–12 ft plan footprint for 20 ft selections; multiple letters may stack or sit side by side.",
  },
  40: {
    height: 40,
    minimumFeet: 8,
    preferredFeet: 11,
    maximumFeet: 14,
    note: "Suggested 8–14 ft plan footprint for 40 ft selections; taller fields often use several letters rather than one enlarged glyph.",
  },
  60: {
    height: 60,
    minimumFeet: 10,
    preferredFeet: 13,
    maximumFeet: 16,
    note: "Suggested 10–16 ft plan footprint for 60 ft selections; vertical arrangements of differently sized letters are preferred over proportional stretch.",
  },
};

export type LetterSizeControls = {
  /** Minimum unrotated plan footprint (ft). */
  minimumFeet: number;
  /** Preferred / typical unrotated plan footprint (ft). */
  preferredFeet: number;
  /** Maximum unrotated plan footprint (ft). */
  maximumFeet: number;
  /**
   * 0–100. How widely the optimizer samples between min and max around the preferred size.
   * 0 keeps letters at the preferred size (still clamped to min/max).
   */
  variationPercent: number;
  preserveProportions: boolean;
};

export const DEFAULT_LETTER_SIZE_CONTROLS: LetterSizeControls = {
  minimumFeet: 6,
  preferredFeet: 9,
  maximumFeet: 12,
  variationPercent: 35,
  preserveProportions: true,
};

export function letterFootprintFeet(scale: number): number {
  return Math.max(0, scale) * UNIT_LETTER_SPAN;
}

export function scaleFromFootprintFeet(feet: number): number {
  return Math.max(0, feet) / UNIT_LETTER_SPAN;
}

export function letterSizePreset(height: SelectionHeightFeet): LetterSizePreset {
  return { ...LETTER_SIZE_PRESETS[height] };
}

/** Apply a height guideline. Variation and proportion settings can be kept; footprint feet always come from the preset. */
export function controlsFromPreset(
  height: SelectionHeightFeet,
  previous?: Partial<Pick<LetterSizeControls, "variationPercent" | "preserveProportions">>,
): LetterSizeControls {
  const preset = LETTER_SIZE_PRESETS[height];
  return {
    minimumFeet: preset.minimumFeet,
    preferredFeet: preset.preferredFeet,
    maximumFeet: preset.maximumFeet,
    variationPercent: previous?.variationPercent ?? DEFAULT_LETTER_SIZE_CONTROLS.variationPercent,
    preserveProportions: previous?.preserveProportions ?? DEFAULT_LETTER_SIZE_CONTROLS.preserveProportions,
  };
}

export function validateLetterSizeControls(controls: LetterSizeControls): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(controls.minimumFeet > 0) || !(controls.preferredFeet > 0) || !(controls.maximumFeet > 0)) {
    errors.push("Letter sizes must be positive footprints in feet.");
  }
  if (controls.minimumFeet > controls.preferredFeet + 1e-9) {
    errors.push(`Minimum letter size (${controls.minimumFeet} ft) exceeds preferred (${controls.preferredFeet} ft).`);
  }
  if (controls.preferredFeet > controls.maximumFeet + 1e-9) {
    errors.push(`Preferred letter size (${controls.preferredFeet} ft) exceeds maximum (${controls.maximumFeet} ft).`);
  }
  if (controls.minimumFeet > controls.maximumFeet + 1e-9) {
    errors.push(`Minimum letter size (${controls.minimumFeet} ft) exceeds maximum (${controls.maximumFeet} ft).`);
  }
  if (controls.variationPercent < 0 || controls.variationPercent > 100) {
    errors.push("Letter-size variation must be between 0 and 100%.");
  }
  if (controls.maximumFeet > 40) {
    warnings.push(`Maximum letter footprint ${controls.maximumFeet} ft is very large relative to a 20 ft plan bay.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Map feet controls onto GenerationRules scale units used by the optimizer. */
export function applyLetterSizeControlsToRules(rules: GenerationRules, controls: LetterSizeControls): GenerationRules {
  return {
    ...rules,
    minimumLetterSize: scaleFromFootprintFeet(controls.minimumFeet),
    preferredLetterSize: scaleFromFootprintFeet(controls.preferredFeet),
    maximumLetterSize: scaleFromFootprintFeet(controls.maximumFeet),
    letterSizeVariation: controls.variationPercent,
    preserveProportions: controls.preserveProportions,
  };
}

export function letterSizeControlsFromRules(rules: GenerationRules): LetterSizeControls {
  const minimumFeet = letterFootprintFeet(rules.minimumLetterSize);
  const maximumFeet = letterFootprintFeet(rules.maximumLetterSize);
  const preferredFeet = letterFootprintFeet(rules.preferredLetterSize ?? Math.max(rules.minimumLetterSize, rules.maximumLetterSize));
  return {
    minimumFeet,
    preferredFeet: Math.min(maximumFeet, Math.max(minimumFeet, preferredFeet)),
    maximumFeet,
    variationPercent: rules.letterSizeVariation ?? DEFAULT_LETTER_SIZE_CONTROLS.variationPercent,
    preserveProportions: rules.preserveProportions,
  };
}

/**
 * Sample a letter scale for the optimizer.
 * Variation spreads samples between min and max without forcing every letter to the selection height.
 */
export function sampleLetterScale(rules: GenerationRules, random: () => number): number {
  const min = rules.minimumLetterSize;
  const max = Math.max(min, rules.maximumLetterSize);
  const preferred = Math.min(max, Math.max(min, rules.preferredLetterSize ?? max));
  const variation = Math.max(0, Math.min(100, rules.letterSizeVariation ?? 0)) / 100;
  if (variation <= 1e-9 || max - min <= 1e-9) return preferred;
  const halfRange = (max - min) * 0.5 * variation;
  const sampled = preferred + (random() * 2 - 1) * halfRange;
  return Math.max(min, Math.min(max, sampled));
}

export function letterSpansMultipleCells(letterFootprintFeet: number, cellPitchFeet: number, epsilon = 1e-6): boolean {
  return letterFootprintFeet > cellPitchFeet + epsilon;
}
