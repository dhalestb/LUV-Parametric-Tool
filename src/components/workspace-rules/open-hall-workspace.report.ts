// Report criteria and defaults owned exclusively by open-hall-workspace.
type Binding = { title: string; labels: string[]; hard?: boolean; requirements: string[] };
export const reportRules: { letterBindings: Binding[]; architectureBindings: Binding[]; defaultField: {width:number;depth:number;height:number}; sourcePolicy: string; version: string } = {
letterBindings: [
    {
      title: "L-only vocabulary", labels: ["Letter variations"],
      requirements: [
        "Use L guides for all five roles: floor, mezzanine, columns, walls, and roof.",
        "Generate Design derives the guide set from the settings. Regenerate Architecture reseats the saved guides when the slot count matches and rebuilds them when it changes.",
      ],
    },
    {
      title: "Orthogonal footprint 0/90/180/270", labels: ["Orthogonal footprint"],
      requirements: [
        "Prefer a footprint at 0°. If its plan checks fail, try the other 90° increments and return the orientation with the fewest missed checks if none passes.",
        "Keep the ground and mezzanine slabs horizontal.",
      ],
    },
    {
      title: "Column L guides on equal XY grid", labels: ["Column L guides"],
      requirements: [
        "Center an equal XY grid on the square floor. Fit as many full bays as the selected pitch permits. If the pitch exceeds the plate span, use one bay across that span.",
        "The grid retains every node, including a center node when present. Column guides cycle through quarter turns and start above the ground slab by 0.15 times their size.",
      ],
    },
    {
      title: "Column size and equal grid spacing · presets or custom", labels: ["Column guide size"],
      requirements: [
        "Column L presets are 1, 2, and 3 ft, with a 2 ft default. Grid presets are 15, 20, and 25 ft, with a 20 ft default. Both accept positive custom values.",
        "Use a pitch of at least 1 ft or 5 ft minus the column L size, whichever is greater. With the default 2 ft column L, the minimum pitch is 3 ft.",
      ],
    },
    {
      title: "Floor/mezzanine guides seated on generated plan corners", labels: ["Floor mezz L guides"],
      requirements: [
        "Seat four floor L guides by their outer tips. The L mezzanine uses six corner guides. The U and ring each use eight.",
        "Use both the perimeter and inside corners of the mezzanine. Start the horizontal guides at their slab mid-planes before checking field fit.",
      ],
    },
    {
      title: "Floor/mezz guide size 9/11/13 ft or custom", labels: ["Floor mezz guide size"],
      requirements: [
        "Floor and mezzanine guides share a size. Presets are 9, 11, and 13 ft, with an 11 ft default and positive custom sizes.",
        "For older requests missing an explicit size, use a saved preferred size of 9, 11, or 13 ft when available.",
      ],
    },
    {
      title: "Vertical wall corner L guides · mezzanine-referenced jambs", labels: ["Wall L guides"],
      requirements: [
        "Set four vertical L guides at the elevation corners of each wall panel in XZ or YZ. The lower tips sit at the ground surface and the upper tips at the roof underside.",
        "Wall guides use their own 6, 9, and 12 ft presets or a positive custom size. The default is 9 ft. The guide size controls the reference letters, while the wall thickness sets panel depth.",
      ],
    },
    {
      title: "Roof L per column bay · fixed or pillar-edge sizing", labels: ["Roof L guides"],
      requirements: [
        "Place one roof L at each column bay center. Guides cycle through quarter turns and start at the roof slab mid-plane.",
        "The default is fixed mode with a 6 ft guide. Fixed mode offers 3, 6, and 9 ft presets and positive custom sizes. Pillar-edge mode derives the size from the measured bay pitch, column L size, and inward offset.",
      ],
    },
    {
      title: "Arranged letters inside field", labels: ["Letters inside field"],
      requirements: [
        "Field dimensions use 20, 40, or 60 ft presets and default to 40 × 40 × 20 ft. Guide fit uses the actual transformed mesh with a 0.000001 ft tolerance.",
        "The fitter may seat a guide vertically within the field. A horizontal shift still has to pass the slot match.",
      ],
    },
    {
      title: "Guide placement matches generated plan", labels: ["Guide placement matches plan"],
      requirements: [
        "Match one L to each slot by role. Position, orientation, and scale tolerances are 0.0001 ft, 0.0001°, and 0.000001 ft respectively.",
        "Position is measured against slot X/Y and the independently calculated field-safe Z. Missing or duplicate guides, mismatched roles, and size distortions fail the check.",
      ],
    },
  ],
architectureBindings: [
    {
      title: "Field containment", labels: ["Field envelope"],
      requirements: [
        "Measure the final union against the field, with 0.0001 ft allowed at the boundaries. X/Y are centered and Z starts at the field base.",
        "Preserve the generated scale through solid assembly.",
      ],
    },
    {
      title: "Square ground plate · generated corner-guide extents", labels: ["Ground plate filled"],
      requirements: [
        "The square side is set by the smaller available plan dimension. The inset is the greater of 0.5 ft and one quarter of the selected wall thickness, with a minimum 6 ft floor half-span in the plan calculation.",
        "Extrude the continuous ground plate from the four outer floor L tips. Verify the tip-to-tip spans within 0.05 ft of the planned spans.",
      ],
    },
    {
      title: "Central hall · mezz opening over centre", labels: ["Central hall"],
      requirements: [
        "Keep the ground plate continuous through the center and align the mezzanine opening above it.",
        "A filled pier can occupy the center when the grid places a node there.",
      ],
    },
    {
      title: "Mezzanine opening 20–40% · bands ≥10 ft", labels: ["Mezzanine opening", "Mezzanine platform width"],
      requirements: [
        "Choose a two-sided L, three-sided U, or four-sided ring. The L is the default. Require a 20–40% opening and bands at least 10 ft wide. A 20 ft X or Y preset leaves too little space for those bands.",
        "The band search targets a 30% opening in 0.5 ft steps. It limits the trial band to half the square span minus 1 ft. Measure the finished band from the inner L corners, keeping the trial width if that measurement is invalid or under 1 ft.",
      ],
    },
    {
      title: "Mezzanine mid-height", labels: ["Mezzanine elevation"],
      requirements: [
        "Set the ground slab underside at the field base, the mezzanine top at half the field height, and the roof top 0.05 ft below the field top. Apply one positive slab thickness to all three. The default thickness is 0.75 ft.",
      ],
    },
    {
      title: "Pier layout · center-to-center spacing", labels: ["Column grid", "Supports and movement"],
      requirements: [
        "Fill each column L pocket to form a solid pier. Its base begins 0.20 ft above the field bottom and its planned top is 0.05 ft above the mezzanine. During assembly, piers with a corner inside the roof footprint extend to the finished roof top.",
        "Require at least three piers and check their footprints, equal X and Y spacing, and a minimum center-to-center separation of 5 ft minus the column L size.",
      ],
    },
    {
      title: "Wall panel and entry plan checks", labels: ["Perimeter walls and entry"],
      requirements: [
        "Use outer mezzanine corners for the south and west openings in the L layout and the south opening in the U layout. Use inner corners for the ring's south opening. These directions refer to the plan before rotation.",
        "Skip candidate wall footprints below 0.5 ft². Verify the four panels of the L layout or five panels of the other layouts against planned extents and jambs. Panel depth is positive and defaults to 1.5 ft.",
        "Walls are visible and exported separately by default. Show walls controls display, and Join walls includes wall solids in the main mesh.",
      ],
    },
    {
      title: "Roof skylight plan and final cut verification", labels: ["Roof plate filled", "Skylight bays", "Final skylight cuts"],
      requirements: [
        "Give the roof the ground footprint. Cut the filled outer envelope of each roof L through the roof slab only. A cut that removes the entire roof fails.",
        "Fit between pillar edges uses the smaller measured pitch minus 0.90 times the column L size and twice the inset, then divides the clear span by 0.90. Use a nonnegative inset, defaulting to 0 ft. Reject a clear span of 0.1 ft or less.",
        "Check every opening against the final union using a probe inset 0.001 ft from each slab face. Obstruction fails above the greater of 0.000001 ft³ and one millionth of the probe volume.",
      ],
    },
    {
      title: "Plan-level plate separation >8 ft", labels: ["Headroom"],
      requirements: [
        "Require more than 8 ft of vertical separation between overlapping planned slabs. The check considers overlaps of at least 1 ft² where the upper underside sits more than 0.02 ft above the lower top.",
      ],
    },
    {
      title: "Connected assembly and component coverage", labels: ["Final solid connectivity"],
      requirements: [
        "If the piers leave the roof untied, the assembly can add a 0.7 ft square connector at a qualifying host slab centroid under the roof and outside a cut opening.",
        "Assembly skips extrusion profiles with fewer than three vertices or area below 0.0001 ft², and uses a 0.05 ft minimum extrusion height. Require valid Manifold status, positive volume, and one connected component in the combined solid.",
        "If a Boolean union is invalid or empty, assembly retains its first solid. A failed or empty cut leaves its host intact. The final coverage and skylight checks still apply.",
        "Check coverage of planned slabs, piers, and wall panels. The coverage check expects piers to reach the roof top. Missing material above the greater of 0.000001 ft³ and one millionth of the planned component volume fails.",
      ],
    },
  ],
defaultField: { width: 40, depth: 40, height: 20 },
sourcePolicy: "Open Hall builds its plan from field dimensions, channel count, grid, guide sizes and thickness settings. New Design creates matching role-grouped L guides. Regeneration rebuilds the plan and reseats retained guides when the slot count matches. When the slot count changes, it creates one new guide per slot.",
version: "1.6.0"
};
