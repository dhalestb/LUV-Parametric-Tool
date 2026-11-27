// Report criteria and defaults owned exclusively by flat-deep-plan-plate.
type Binding = { title: string; labels: string[]; hard?: boolean; requirements: string[] };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    {
      title: "Permitted letters and placement", labels: ["Letter variations"],
      requirements: [
        "Generate one L guide for each plan slot. Generate Design and Regenerate Architecture both build a fresh set from the current field and settings.",
      ],
    },
    {
      title: "Footprint follows field · ratio disabled", labels: ["Working plate ratio"],
      requirements: [
        "Take 2 ft off each edge of the selected field to set the rectangular plate. The footprint proportions follow the field dimensions.",
      ],
    },
    {
      title: "15° footprint orientation", labels: ["15° footprint rotation"],
      requirements: [
        "Generate the footprint at 0°, which satisfies the 15° increment check. Rotate the horizontal corner guides in successive quarter turns.",
      ],
    },
    {
      title: "Half-width full-length mezzanine", labels: ["Half-width mezzanine"],
      requirements: [
        "Run the mezzanine along the whole long axis and occupy the negative half of the short axis. Use X as the long axis when the plan is square.",
      ],
    },
    {
      title: "Column guide grid", labels: ["Column grid"],
      requirements: [
        "Center the column grid independently on X and Y. Fit whole bays at the selected target pitch. If a span is shorter than the target, use a single bay across it.",
        "Column spacing presets are 10, 12, and 15 ft, with a 12 ft default. Custom spacing must be at least 1 ft. Place a column guide at every grid node, 0.30 ft above the ground slab top.",
      ],
    },
    {
      title: "No silent rescale of letters", labels: ["No uniform rescale"],
      requirements: [
        "Construct guides at their selected sizes and keep unit scale on X, Y, and Z. Check the resulting fit at that scale.",
      ],
    },
    {
      title: "Four corner L guides per floor and mezzanine", labels: ["Floor and mezzanine corner guides"],
      requirements: [
        "Seat four L tips on the ground corners and four on the mezzanine corners. The plan aligns the native L outer tip at (−0.42, −0.45) times its size with each corner, within 0.000001 ft per axis.",
        "Set each guide center near the slab midpoint, with a lower bound of 0.07 times its size plus 0.001 ft above the field base.",
      ],
    },
    {
      title: "Vertical L guides for wall bands and stepped ends", labels: ["Vertical wall guides"],
      requirements: [
        "Place 16 vertical guides on the four long-edge bands, four per band. Place 12 more at the two stepped short ends, six per outline.",
        "Rotate the guides into the XZ or YZ plane so their outer tips establish the wall outlines.",
      ],
    },
    {
      title: "Guide sizes by role", labels: ["Configured guide sizes"],
      requirements: [
        "Set guide sizes independently. Column and wall presets are 1, 2, and 3 ft. The floor and mezzanine share 6, 9, 11, and 13 ft presets, with larger sizes subject to field fit.",
        "Defaults are 2 ft for columns, 1 ft for walls, and 6 ft for floor and mezzanine. Each size also accepts positive custom values.",
      ],
    },
    {
      title: "Arranged guides inside the field", labels: ["Flat plate guides inside field"],
      requirements: [
        "Field dimensions use 20, 40, or 60 ft presets and default to 20 × 60 × 20 ft. Test the arranged guide vertices against the field with a 0.000001 ft tolerance.",
        "Reject a guide that extends beyond the boundary. The 20 ft plan preset can be used when the guides fit and the architecture passes its checks.",
      ],
    },
  ],
architectureBindings: [
    {
      title: "Field containment", labels: ["Field envelope"],
      requirements: [
        "Measure the final union against the field, with 0.0001 ft allowed at the boundaries. X/Y are centered and Z starts at the field base.",
        "Preserve the generated scale through assembly.",
      ],
    },
    {
      title: "Solid roof without skylights", labels: ["Solid roof"],
      requirements: [
        "Use an unperforated roof with the same plan as the ground slab. Set the roof top 0.05 ft below the field top.",
      ],
    },
    {
      title: "Half-width mezzanine", labels: ["Half-width mezzanine"],
      requirements: [
        "Build one full-length mezzanine along the negative side of the short axis. It occupies exactly half the ground footprint.",
      ],
    },
    {
      title: "Clear headroom >8 ft", labels: ["Clear height"],
      requirements: [
        "Require more than 8 ft under the mezzanine, measured as half the field height minus twice the selected slab thickness. Increase the field height or reduce slab thickness if the clearance fails.",
      ],
    },
    {
      title: "Continuous rectangular ground slab", labels: ["Rectangular ground slab"],
      requirements: [
        "Extrude a single rectangular ground plate with 2 ft margins to the four field edges. Its underside sits at the field base.",
      ],
    },
    {
      title: "Slab thickness and mid-height mezzanine", labels: ["Slab section"],
      requirements: [
        "Set the top of the mezzanine at half the field height. Apply one selected thickness to the ground, mezzanine, and roof slabs. The default is 0.75 ft, with positive custom values allowed.",
      ],
    },
    {
      title: "Filled-pocket pier at every grid node", labels: ["Filled-pocket piers"],
      requirements: [
        "Every grid node produces a filled L-pocket pier measuring 0.84 by 0.90 times the column L size. Piers start 0.20 ft above the field base and end 0.05 ft above the mezzanine in the plan. During assembly, piers with a corner inside the roof footprint extend to the finished roof top.",
      ],
    },
    {
      title: "Four 2 ft long-edge wall bands", labels: ["Long-edge wall bands"],
      requirements: [
        "Build four 2 ft-high bands, two beneath the mezzanine and two beneath the roof. Derive panel extents from the vertical L tips. Panel depth uses an independent positive wall thickness setting, which defaults to 1.5 ft.",
      ],
    },
    {
      title: "Stepped end walls at the selected wall thickness", labels: ["Stepped end walls"],
      requirements: [
        "Build two rectangular panels per short end to fill the stepped L outline traced by the wall guides. Their panel depth uses the same wall thickness as the long bands.",
        "Walls are visible and exported separately by default. Show walls changes the display while walls are separate. Join walls includes the wall solids in the main mesh when the study is regenerated.",
      ],
    },
    {
      title: "Final solid mesh integrity", labels: ["Final solid mesh integrity"],
      requirements: [
        "If the piers leave the roof untied, the assembly can add a 0.7 ft square connector at a qualifying slab centroid under the roof.",
        "Planned extrusion profiles need at least three vertices and 0.0001 ft² of area. Extrusions use a minimum height of 0.05 ft. Each assembly must have valid Manifold status and positive volume.",
        "Each union must contain its input solids so the final assembly includes every planned slab, pier and wall. Reject missing material above the greater of 0.0001 ft³ and one millionth of an input solid's volume.",
      ],
    },
  ],
defaultField: { width: 20, depth: 60, height: 20 },
sourcePolicy: "Flat Deep Plan Plate invents L guides for base and mezzanine corners, a regular pillar grid, four long wall strips and stepped end walls. Roof is solid without skylights.",
version: "2.2.0"
};
