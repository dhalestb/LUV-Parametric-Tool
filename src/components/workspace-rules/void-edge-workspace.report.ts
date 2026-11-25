// Report criteria and defaults owned exclusively by void-edge-workspace.
import { voidEdgeRules } from "./void-edge-workspace.rules";

const { guides, stack, thickness, walls, field, columns } = voidEdgeRules;

function rule(title: string, requirements: string[], label = title) {
  return { title, labels: [label], requirements };
}

export const reportRules = {
  letterBindings: [
    rule("Opposing U plate guides", [
      "Use U guides for the plates, core and curved wall profiles. A new design places two opposing end guides and two opposing side guides on each main plate.",
      "Retain two main guides per plate in older two-guide studies. Infer missing side bends for the walls by turning the lower U a quarter turn each way about the plate center.",
    ], "U plate guides"),
    rule("Main guide groups by plate", [
      `Use one group at the ground plate and one at each intermediate ${stack.spacing} ft datum. Keep a separate group for the roof.`,
      "Maintain the ground group's guide count on every main plate. Saved datums identify a guide's layer when regenerating.",
    ]),
    rule("Independent U guide sizes", [
      `For a new design, the main end pair defaults to ${guides.mainEnd.defaultSize} ft and offers ${guides.mainEnd.presets.join(", ")} ft presets. The main side pair defaults to ${guides.mainSide.defaultSize} ft and offers ${guides.mainSide.presets.join(", ")} ft presets. Check each pair against the selected field and rotation.`,
      `Core end guides default to ${guides.coreEnd.defaultSize} ft and offer ${guides.coreEnd.presets.join(", ")} ft presets. Core side guides default to ${guides.coreSide.defaultSize} ft and offer ${guides.coreSide.presets.join(", ")} ft presets. All groups accept positive custom sizes subject to field fit.`,
    ]),
    rule("15° base rotation", [
      `Use ${guides.rotationIncrement}° increments for the base rotation. The ground, roof and core guide groups share this reference angle.`,
      "In Auto, choose a base angle for which the main U guides and plate outlines fit at every level. Regenerate Architecture keeps the saved base angle unless a different one is selected.",
    ]),
    rule("Intermediate rotation sequence", [
      `Rotate successive intermediate groups relative to the base by ${field.sizes.map(height=>`${stack.intermediateRotations[height]}° per plate at ${height} ft`).join(", ")}.`,
    ]),
    rule("Core U groups and paired column L guides", [
      "Use two end U guides and two side U guides at every intermediate plate, including plates where the core opening has no rising core wall.",
      "A complete saved group defines its own opening. Use a complete reference group for missing levels, including older studies with a single floor-level core group.",
      `On a core-free story, place four upper column L guides from the outer arm tips of the upper plate's two end U guides. Shift each pair outward as needed to seat both profiles clear of the openings. At the lower slab seat, turn the corresponding L by ${columns.lowerRotation}° in plan about the same column center. Use the ${columns.presets.join(", ")} ft presets or a custom size of at least ${columns.minimumSize} ft. The default is ${columns.defaultSize} ft.`,
    ], "Four core guides per intermediate plate"),
    rule("Guide elevations and depth", [
      `Seat intermediate main guides at ${guides.centerAboveDatum} ft above their plate datum. New main guide solids are ${guides.newGuideDepth} ft deep. When field height changes, move the ground and roof U groups with their respective boundaries and preserve their offsets from those boundaries.`,
      "Seat each core U group halfway through the selected slab thickness at its datum.",
    ]),
    rule("Saved guide recovery", [
      "Reuse complete saved groups, retaining their plan positions, angles and sizes relative to the selected base rotation. Rebuild missing intermediate main groups from the ground guides and a missing roof group from the ground poses at roof height.",
      "Changing the shared core sizes reseeds the core guides. Individual saved guide edits otherwise remain available to drive each opening.",
    ]),
    rule("Horizontal U pairings and vertical wall U guides", [
      `On stories without a core wall, use ${walls.pairings.map(([lower,upper])=>`lower ${lower} to upper ${upper}`).join(", ")}.`,
      `Place one sideways U at each wall's exterior and align the outside bend to the wall face at mid-height. Use a shared size with ${walls.verticalGuide.presets.join(", ")} ft presets, a ${walls.verticalGuide.defaultSize} ft default, and positive custom sizes. Orient its opening to set the bow direction.`,
    ], "U pairings for the outer walls"),
    rule("Arranged guides inside the field", [
      `Use ${field.sizes.join(", ")} ft presets for each field dimension, with a ${field.defaults.width} × ${field.defaults.depth} × ${field.defaults.height} ft default.`,
      `Check horizontal U and L vertices and vertical U bend anchors against the field using a ${field.guideTolerance} ft tolerance. The vertical U arms are construction references and may cross the field sides. Finished architecture must stay inside the field.`,
    ]),
  ],
  architectureBindings: [
    rule("Field containment", [
      "Test the finished solid against the selected field. The export centers X and Y and lifts Z to the field base.",
      `Allow up to ${field.solidTolerance} ft of numerical tolerance at the final boundaries. Preserve the form's scale through assembly.`,
    ], "Field envelope"),
    rule("Elliptical slabs from the main U guides", [
      "Measure the main U group in its own rotation frame. Set the ellipse center and radii from the minimum and maximum X and Y coordinates of the transformed guide vertices.",
      `Sample the ellipse at ${stack.ellipseSamples} points and turn it back to the group's rotation. Each plate uses its own group.`,
    ]),
    rule("Ten-foot plate stack and solid end caps", [
      `Start the ground slab at the field base, then place the intermediate slabs on ${stack.spacing} ft datums. Finish the roof top ${stack.roofSetback} ft below the field top.`,
      "Keep the ground and roof solid across the core opening. Generate their outer footprints from their respective main guide groups.",
    ]),
    rule("Shared adjustable slab thickness", [
      `Apply one slab thickness to the ground, intermediate and roof plates. Use a default of ${thickness.slab} ft and accept positive custom values below ${thickness.slabLimit} ft.`,
    ]),
    rule("Per-level core openings", [
      "Measure each intermediate plate's four core guides to define the outer core ellipse for that level. Create the inner opening from that ellipse and cut the corresponding intermediate plate.",
      "Apply the same opening to the core segment that rises from that plate when a segment is present. Keep each opening scoped to its own plate and segment.",
    ]),
    rule("Core fit and wall thickness", [
      "Fit the outer core ellipse inside the host plate. For a rising segment also fit it inside the receiving plate above.",
      `Offset the core ellipse inward along its normals using the selected core wall thickness, which defaults to ${thickness.core} ft. Reject a thickness that reaches the ellipse's tightest radius of curvature.`,
    ]),
    rule("Alternating hollow cores and twisted L columns", [
      `Start at the ${stack.firstCoreStory*stack.spacing} ft plate and repeat every ${stack.coreRepeat} stories. End each segment at the next ${stack.spacing} ft datum or at the finished roof top, whichever comes first.`,
      "Cut the inside of each segment using the opening from its own core U group.",
      `Use the filled bounds of each placed L to draw the column profiles at the two slab seats. Loft each paired profile down from the upper L to the lower L. Verify both seats against the solid and check the ${columns.lowerRotation}° turn between them.`,
    ], "Alternating hollow core segments"),
    rule("Outer wall profiles from U bends", [
      `Project a centered portion of each U's outside bend to the plate perimeter using the guide's size and pose. Adjust the sampled portion of the four bends together until their traces cover ${walls.perimeterCoverage*100}% of each receiving plate perimeter.`,
      "Match the two projected traces at evenly spaced arc-length stations and connect them. Seat the lower trace through the lower slab and meet the underside of the upper slab.",
      "Read the placed sideways U's outside bend from bottom to top. Use the bend depth and the guide's orientation to bow the intermediate wall profiles, keeping the two plate connections fixed.",
      `Verify each exported wall cap against its receiving plate trace and measure the combined span against the ${walls.perimeterCoverage*100}% target at both connections.`,
    ]),
    rule("Four outer walls and adjustable thickness", [
      `Build ${walls.pairings.length} outer walls across each ${stack.spacing} ft story without a core segment. Check for overlap between walls in the same story.`,
      `Offset each wall inward in plan by the independently adjustable outer wall thickness, which defaults to ${thickness.outerWall} ft.`,
    ]),
    rule("Complete assembly and join setting", [
      "Check the exported assembly for valid Manifold status, a nonempty solid and positive volume. Verify that the union contains each planned floor, roof, column, core and wall. Provide a corresponding viewer layer for every element.",
      "Use one join setting for the cores and outer walls. In joined mode, export one object containing all parts. In separate mode, verify the floors, roof and columns in the base mesh and export each core and outer wall as its own object.",
    ]),
  ],
  defaultField: field.defaults,
  sourcePolicy: "Horizontal U guides define the plates and wall connections. Vertical U guides bow the outer walls between plates. Each intermediate core U group defines its opening. Alternate hollow core segments with stories containing four outer walls and four columns lofted between paired L guides. The ground and roof plates span the core opening.",
  version: voidEdgeRules.version,
};
