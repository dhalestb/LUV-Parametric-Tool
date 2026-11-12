# Standalone Amphitheater presentation export

Open http://127.0.0.1:4199/amphitheater?study=195c5cdb-b1e3-43e9-9694-7eebf7f1628e#amphitheater-presentation and scroll to Presentation & Export.

## Available views

- Original Letters renders every saved letter instance in gold #D6AD4F.
- Architectural Form renders the saved architectural mesh in off-white #F7F6F5.
- Orientation Rules overlays blue #71BEDA arcs and actual X/Y/Z source-angle labels.
- Generation Rules shows enlarged source letters, their actual inner contours and cutters, and openings through clipped portions of the saved architectural form. Selecting one Rule source produces a larger individual detail.
- Four-view Board composes these views in a 2 × 2 layout on a black or transparent background, with the saved typology name as its heading. Existing studies default to Stepped Amphitheater.

The controls select view, resolution, isometric direction, background transparency and the interior source to annotate. Every view uses saved geometry. Pending edits are captured by regenerating architecture before exporting.

## PNG exports

Individual exports are square at 2048 or 4096 pixels. The board uses the same selected width and a height 1.125 times that width. A 4096-pixel board is 4096 × 4608. PNGs include 300 ppi metadata and sRGB rendering. Shaded surfaces use the requested material colors.

The board uses a layout proportion inferred from the supplied image. It can be scaled in InDesign. It does not reproduce an unspecified physical InDesign page size.

## OBJ exports

Export Letters OBJ writes named source instances into one file. Export Form OBJ writes the architecture into a separate file. Both use the same world coordinates, with one coordinate unit representing one foot and Z pointing up. OBJ has no standardized physical unit metadata, so select feet in the receiving application.

OBJ downloads contain mesh geometry. The presentation colors are applied to PNG views. Material libraries are not included in these OBJ downloads.

## Validation

The browser exported all four 4096 × 4096 PNGs and the 4096 × 4608 board from saved study 195c5cdb-b1e3-43e9-9694-7eebf7f1628e. Every image reports 300 ppi. A separate 2048 × 2048 transparent form export was decoded and checked for alpha zero at the background and opaque form pixels.

Browser OBJ downloads were compared to that saved study. Letters contain 9336 vertices and 3112 triangles across named instances. The architectural form contains 4493 vertices and 9022 triangles. Vertex coordinates match within 0.00001 ft. Face indices, object names and bounds were checked.

The pure export regression also rejects malformed mesh input and verifies lossless PNG pixel values after density metadata replacement.

The browser preview, source selector and A/B/C presentation choices were inspected. Production build, TypeScript and focused lint passed. The production build retains existing warnings in unrelated files.

## Scope and files

- src/components/AmphitheaterPresentation.tsx adds preview and export controls.
- src/components/amphitheaterPresentationRender.ts renders the four views and the board.
- src/components/amphitheaterPresentationExport.ts provides OBJ output, PNG density metadata and downloads.
- src/components/AmphitheaterStudio.tsx mounts the standalone presentation panel.
- scripts/amphitheater-presentation-export-tests.cjs checks geometry export and PNG metadata.
- reports/presentation-export/ contains verification and screenshots.

The architectural generator and the existing Composition/Presentation Boards implementations were not edited.

Changes are local and uncommitted on experiment/gathering-envelope at checkpoint eb094d2213405393ae9954aa8399d479ef643b5d. No push or merge was performed for this presentation change.

## Revised headings and legibility

The broad Gathering Space Proto-Forms title has been removed from PNG output. Typology headings are present in combined and individual exports. The renderer reads optional typologyName from saved requests. The current standalone Typology selector supports Stepped Amphitheater. The other four typology generators and selector options remain pending.

Captions and source-angle labels were enlarged. At native 300 ppi, the combined board caption sizes are approximately 10.5–11.4 pt. Scaling the board in InDesign also scales the text.

Revised browser exports were checked at 4096 × 4608 and 4096 × 4096, with 300 ppi metadata. The generation detail clips the surrounding form for visibility. These visual clipping planes do not alter the saved architecture or OBJ exports. The latest production build, TypeScript and lint pass with the existing unrelated build warnings.

## Measured tier and terrace annotations

The rule view reports the saved lower, middle-interior and upper X tilt ranges and Z plan turns. Middle interiors currently require X=90 degrees. The proposed X=75/105-degree cases remain unsupported. Terrace descriptions report 0.80 ft platform offset, 0.75 ft thickness, two additional bands with 0.975 ft outward increments at 13 ft preferred letters, and vertical rise capped at 1.56 ft. Local lower support conditions may reduce this rise. The off-white material base is #F7F6F5. Lighting and transparency produce shaded rendered values. Build and measured-description checks passed. The annotated browser export remains 4096 by 4608 pixels at 300 ppi.
