import type { CompositionPlacement } from "./compositionEngine";
import {
  classifyPlacementsAgainstSelection,
  triangleMeshFromPlacement,
  type ClassifiedPlacement,
} from "./selectionFieldGeometry";
import {
  type SelectionFieldVolume,
  type SelectionHeightFeet,
  selectionFieldDimensions,
  selectionGeometryCompatibleWithHeight,
} from "./selectionHeightRouting";

export type TrimmedLetterMesh = {
  sourceIndex: number;
  letter: CompositionPlacement["cell"]["letter"];
  positions: number[];
  indices: number[];
  clipped: boolean;
  empty: boolean;
  /** Original placement TRS — preserved; trim only affects mesh geometry. */
  placement: CompositionPlacement;
};

export type SelectionFieldExtraction = {
  height: SelectionHeightFeet;
  selection: SelectionFieldVolume;
  classified: ClassifiedPlacement[];
  /** Letters whose solids intersect the field; original transforms preserved. */
  intersectingPlacements: CompositionPlacement[];
  trimmedLetters: TrimmedLetterMesh[];
  geometryDepthSpan: number;
  heightCompatibility: ReturnType<typeof selectionGeometryCompatibleWithHeight>;
};

async function loadManifoldModule() {
  // Explicit .js export resolves in Node CJS tests; Next keeps this module off the client
  // because CompositionStudio does not import this file.
  const loaded = await import("manifold-3d/manifold.js");
  const factory = (loaded as unknown as { default?: typeof loaded }).default ?? loaded;
  return factory as unknown as typeof import("manifold-3d/manifold").default;
}

/**
 * Physical split/cap via Manifold: letter solid ∩ selection cube.
 * Uses the same closed-solid capability as exportLetterVolume.
 */
export async function trimLetterToSelectionField(
  placement: CompositionPlacement,
  volume: SelectionFieldVolume,
  thicknessPercent: number,
): Promise<TrimmedLetterMesh> {
  const classified = classifyPlacementsAgainstSelection([placement], volume, thicknessPercent)[0];
  const ManifoldModule = await loadManifoldModule();
  const wasm = await ManifoldModule();
  wasm.setup();
  const { Manifold, Mesh } = wasm;
  const mesh = triangleMeshFromPlacement(placement, thicknessPercent);
  const letter = new Manifold(new Mesh({
    numProp: 3,
    vertProperties: new Float32Array(mesh.vertices),
    triVerts: new Uint32Array(mesh.triangles),
  }));
  const cube = Manifold.cube([volume.width, volume.height, volume.depth], true)
    .translate([volume.centerX, volume.centerY, volume.centerZ]);
  try {
    if (letter.status() !== "NoError") {
      throw new Error(`Letter ${placement.cell.letter} is not a closed solid for selection trim.`);
    }
    if (classified.relation === "outside") {
      return {
        sourceIndex: placement.sourceIndex,
        letter: placement.cell.letter,
        positions: [],
        indices: [],
        clipped: false,
        empty: true,
        placement: structuredClone(placement),
      };
    }
    const clipped = classified.relation === "intersecting";
    const result = clipped ? letter.intersect(cube) : letter;
    try {
      if (result.status() !== "NoError" || result.isEmpty()) {
        return {
          sourceIndex: placement.sourceIndex,
          letter: placement.cell.letter,
          positions: [],
          indices: [],
          clipped,
          empty: true,
          placement: structuredClone(placement),
        };
      }
      const out = result.getMesh();
      return {
        sourceIndex: placement.sourceIndex,
        letter: placement.cell.letter,
        positions: Array.from(out.vertProperties),
        indices: Array.from(out.triVerts),
        clipped,
        empty: false,
        placement: structuredClone(placement),
      };
    } finally {
      if (clipped) result.delete();
    }
  } finally {
    letter.delete();
    cube.delete();
  }
}

export async function extractSelectionFieldGeometry(args: {
  placements: CompositionPlacement[];
  height: SelectionHeightFeet;
  centerX: number;
  centerY: number;
  centerZ: number;
  thicknessPercent: number;
}): Promise<SelectionFieldExtraction> {
  const dimensions = selectionFieldDimensions(args.height);
  const selection: SelectionFieldVolume = {
    ...dimensions,
    centerX: args.centerX,
    centerY: args.centerY,
    centerZ: args.centerZ,
  };
  const classified = classifyPlacementsAgainstSelection(args.placements, selection, args.thicknessPercent);
  const contributing = classified.filter((item) => item.relation !== "outside");
  const intersectingPlacements = contributing.map((item) => structuredClone(item.placement));
  const trimmedLetters = await Promise.all(
    contributing.map((item) => trimLetterToSelectionField(item.placement, selection, args.thicknessPercent)),
  );
  const activeBounds = contributing.map((item) => item.bounds);
  const geometryDepthSpan = activeBounds.length
    ? Math.max(...activeBounds.map((b) => b.maxZ)) - Math.min(...activeBounds.map((b) => b.minZ))
    : 0;
  return {
    height: args.height,
    selection,
    classified,
    intersectingPlacements,
    trimmedLetters,
    geometryDepthSpan,
    heightCompatibility: selectionGeometryCompatibleWithHeight(geometryDepthSpan, args.height),
  };
}
