# Parametric lattice registration diagrams

Presentation assets created 2026-10-08. These are explanatory diagrams, not optimization results or depictions of generated circulation.

## Deliverables

| Diagram | Editable SVG, black background | Transparent high-resolution PNG | Black-background PNG |
|---|---|---|---|
| 2 × 2 × 1 — **4 horizontal cells** | `lattice-2x2x1.svg` | `lattice-2x2x1.png` | `lattice-2x2x1-black.png` |
| 4 × 4 × 1 — **16 horizontal cells** | `lattice-4x4x1.svg` | `lattice-4x4x1.png` | `lattice-4x4x1-black.png` |
| 8 × 8 × 1 — **64 horizontal cells** | `lattice-8x8x1.svg` | `lattice-8x8x1.png` | `lattice-8x8x1-black.png` |
| Combined horizontal comparison | `lattice-comparison-horizontal.svg` | `lattice-comparison-horizontal.png` | `lattice-comparison-horizontal-black.png` |

All files are under `C:\Users\DHale\Documents\Codex\Cursor-APP\reports\presentation-assets\lattice-grids\`.

Individual PNGs are **3,600 pixels wide**; the combined composition is **6,400 pixels wide**. PNGs contain 300 ppi metadata. `manifest.json` gives exact pixel dimensions and verified cell counts. `preview.png` is a smaller black-background preview, not the print-resolution master.

## Registration explanation

The application uses a **20 ft lattice pitch**. A placement's registration translation is `x = ix × 20`, `y = iy × 20`, and `z = iz × 20 + zLift`. The three diagrams therefore span **40 × 40 ft**, **80 × 80 ft**, and **160 × 160 ft** in plan.

The lower grid defines the horizontal module intervals. Fine vertical references and a faint upper datum show **one 20 ft registration interval**, from 0 to 20 ft. The upper grid is the top of the same one-level envelope, not a second storey or additional set of occupied cells. The gold quadrilateral identifies one 20 × 20 ft module; the gold point marks the reference origin. A registration node is a placement reference, not proof that an OBJ fits entirely inside a cell. Original geometry retains its own local coordinates, scale and extents. The diagrams do not impose a floor-to-floor height or establish occupancy, circulation, clearance, or connectivity.

Source grounding: `src/components/lattice/types.ts` defines `LATTICE_FEET = 20` and `placementWorldZ()`; `LatticeViewport.tsx` maps placement indices into the rendered scene and draws horizontal and vertical grid references. These application files were read only.

## Graphic system and editing

- Background `#000000`; primary `#F7F6F5`; secondary `#B9BEC6`; construction `#71BEDA`; highlight `#D6AD4F`.
- Matching isometric axes: horizontal axes ±30° from the page horizontal, vertical references vertical. Equal module lengths on all three axes.
- Unique primary grid lines avoid doubled shared-cell strokes. Each diagram has exactly `n+1` lines in each plan direction. Editable, unpainted polygons also identify every individual cell by its indices; these do not add visible linework.
- Shared module scale across the combined composition makes its plan widths proportional to **1:2:4**, rather than making different grids look equally sized.
- SVGs contain editable paths/lines/polygons and live Arial/Helvetica text; no raster imagery, external fonts or linked assets. Groups separate base grid, cell footprints, datum, vertical references, nodes, highlight and dimensions.
- Transparent PNGs omit only the black background and retain the light presentation palette. Use the `-black.png` copies on light presentation canvases or for direct viewing. SVG background can be removed by deleting its `background` rectangle.

`generate.cjs` is a standalone, repeatable asset generator using the already-installed Sharp renderer. It verifies cell counts and transparent corner alpha. It does not invoke or change any solver, placement, OBJ or connection code. No dependencies were installed; no push, deployment, Stage 2D or optimization was performed.
