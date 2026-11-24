# Gathering architectural comparison

The approved text follows the comparison verbatim so adjustable starting angles, reference dimensions, roles, operations and ten validation conditions can be checked independently.

|Typology|Earlier methods and differences|Current Rule A and B at 12197f7|Minimum architectural correction|
|---|---|---|---|
|Stepped Amphitheater|generateProtoArchitecture produces bands and converging aisles. typologyFormation builds four rings with nearest-letter modulation. Neither establishes letter-profile terraces by itself.|foundationPoses and arrangeTypologyLetters set yaw and rise. Contact correction can change rise and stagger. Direct union exposes ledges. canyonStaggering returns before plate extrusion or pocket subtraction.|Preserve final sequential displacements. Project individual profiles, extrude level plates, subtract measurable pockets and protect the central opening through circulation construction.|
|Void Field|Source void extraction and boundary strips can organize atrium edges. typologyFormation plates individual gap hulls and cuts openings. Disconnected gap hulls do not establish one continuous atrium.|gatheringAtriumLayout calculates opening-relative poses. layeredGathering forces all faces horizontal. A retained cylinder can protect clear space but no gallery surfaces develop.|Retain the prescribed mixture of upright and horizontal roles. Derive a continuous perimeter and subordinate pockets. Check visual and circulation continuity independently.|
|Inserted Horizontal Plate|Source projection and extrusion apply. typologyFormation creates two axis-based rectangular projections and flat routes, without preserving each U/V aperture.|Orthogonal poses and grouped elevations exist. Overlap correction can disturb level grouping. No projecting plate construction executes.|Extend actual horizontal components, preserve vertically connected U/V openings and verify grouping in final feet.|
|Contained Room Within Volume|Profile lofting, extrusion and inner footprints apply. The formation helper derives a shell from a group hull and a room from the tightest cluster. A hull can erase the partial enclosure of a U.|gatheringEnclosureLayout computes offsets which sharedZGathering replaces with a common center. Solid stacking does not establish the dominant interior.|Keep enclosure-relative positions. Develop and verify one dominant room and its approaches before secondary openings.|
|Linear Edge Gallery|boundaryStrip and curvedRibbon can follow source edges and routes. typologyFormation instead places three levels of blocks at letter centers and routes along graph links.|Heading and setback helpers exist. Letter priority and contact corrections can alter route order and tangent alignment. Floor, pocket and circulation geometry is bypassed.|Carry the path tangent through final placement and construct circulation with recessed side pockets that retain clear passage.|

## Source references

Historical 95fc78e: src/components/amphitheaterPrototype.ts, analyzeSourceGeometry, generateProtoArchitecture and continuousSurface. Reconstruction blends generated elements through a sampled field. Global smoothing is experimental for protected openings. Historical 7d45082: src/components/typologyFormation.ts typologyFormation, architecturalLetterGeometry.ts architecturalLetterGeometry, faceBridges.ts buildFaceBridges, canyonStaggering.ts canyonStaggering, typologyContinuity.ts buildTypologyContinuity. Loft attachments and projected profiles are reusable techniques. Rectangular presets, radial rings, hull fills and a dense connection graph are not prescribed by the original rules.

Current src/components/typologyLetterArrangement.ts arrangeTypologyLetters combines typologyOrientationRules.ts foundationPoses, gatheringAtriumLayout.ts gatheringAtriumLayout and gatheringEnclosureLayout with contact correction. gatheringOperations.ts supplies parameters. gatheringRuleChecks.ts gatheringRuleChecks reports alignment and organization. letterIntersectionSpaces.ts buildConnectionWorkflow disables Gathering face bridges, continuity and seam blending and passes false for canyonStaggering plate generation. Uniform fit retains angles but changes absolute dimensions. Envelope clipping can reduce a pocket or sever a path, so the final solid must be checked.

## Original architectural specification

LUV Parametric Tool — Typology-Driven Letter Orientation and Architectural Generation Rules
Shared Geometric Standards
All five typologies use a consistent Z-up architectural coordinate system.
Horizontal rotation (Z-axis / yaw): Controls letter orientation in plan, from 0° to 360°.
Vertical rotation (X-axis tilt): Controls whether a letter creates an upright boundary, inclined surface, or horizontal architectural element.
Lateral rotation (Y-axis tilt): Controls lateral inclination and directional geometric transitions.
Vertical positioning: Establishes architectural levels through Z-coordinate displacement, independently of letter rotation.
Boundary designation: Identifies letter-derived surfaces as floors, walls, edges, enclosures, or protected void boundaries.
Rotations must be applied around documented pivots using a consistent rotation order. The original letter identity, proportions, and selected geometric transformations must remain traceable throughout architectural generation.
Angular ranges below are initial design parameters and may be adjusted by the user.

01 — Stepped Amphitheater
Rule 1A — Sequential Staggered Letter Orientation and Boundary Formation
Arrange L, U, and V letters along an ascending sequence of architectural levels. Orient L forms to establish horizontal terrace boundaries, U forms to define gathering enclosures, and V forms to direct circulation and transitions between levels.
Horizontal rotation: 0°, 15°, 30°, 45°, and 90°, relative to the principal circulation direction.
Vertical rotation: 0° or ±90° about the appropriate local horizontal axis to establish upright or horizontal letter configurations.
Secondary angular variation: Up to ±15° for non-occupiable boundary surfaces and transitional elements.
Vertical staggering: Incremental rises corresponding to the architectural level spacing.
Horizontal displacement: Successive letter configurations shift laterally by 15–40% of representative letter width.
Letter faces must form a sequence of terraced edges and partial enclosures. Alternate horizontal setbacks and permitted rotations to create irregular but connected spatial boundaries rather than uniformly stacked layers.
Rule 1B — Terraced Geometry, Staggered Layers, and Recessed Alcoves
Transform the oriented letters into occupiable, vertically staggered terraces, floor plates, and gathering platforms. Generate stepped architectural boundaries through controlled extrusion, level-specific offsets, and geometric intersections.
Recess selected portions of terrace boundaries by 15–35% of their local architectural bay depth to form sheltered alcoves. Use alternating setbacks to create projecting and recessed levels, establishing a canyon-like spatial character.
Maintain a central gathering void and connect successive terraces through valid stairs, ramps, and bridges. Apply controlled geometric blending where surfaces intersect while retaining recognizable L/U/V-derived proportions.
Intended result: A vertically progressive amphitheater with staggered terraces, recessed gathering pockets, and continuous circulation.

02 — Void Field
Rule 2A — Radial Letter Orientation and Atrium Boundary Formation
Arrange the L, U, and V letters around a protected central void. Orient U forms toward the atrium to establish partial enclosures, L forms along the perimeter to define architectural edges, and V forms toward openings and directional connections.
Horizontal rotation: Radial orientation from 0° to 360°, determined by each letter's position relative to the atrium center.
Rotational variation: Up to ±15° from the intended radial or tangential alignment.
Vertical rotation: Primarily 0° for upright boundaries, with selected ±90° rotations to establish horizontal galleries and bridging elements.
Vertical staggering: Alternate letter elevations to create overlapping perimeter galleries.
Horizontal displacement: Variable inward and outward setbacks, initially 10–30% of the local letter width.
Letters must maintain a continuous perimeter relationship without occupying the protected central volume. Orientation should establish visual connections across the atrium and opportunities for recessed occupation within its surrounding boundaries.
Rule 2B — Continuous Atrium, Staggered Galleries, and Pocket Voids
Generate occupiable perimeter floor plates around a continuous multilevel atrium. Derive gallery edges and boundaries from the oriented letter profiles while preserving the central open volume through subtractive geometry.
Stagger selected floor plates horizontally and vertically to create projecting balconies, intermediate terraces, and recessed alcoves within the surrounding mass. Introduce smaller pocket voids and planter opportunities along the perimeter without fragmenting the principal atrium.
Connect galleries with bridges and vertical circulation while preserving daylight penetration and visual connectivity across levels.
Intended result: A vertically connected atrium surrounded by staggered galleries, sheltered gathering pockets, and layered interior landscape opportunities.

03 — Inserted Horizontal Plate
Rule 3A — Horizontally Dominant Letter Orientation and Plate Alignment
Arrange L, U, and V letters to establish a sequence of dominant horizontal architectural planes. Orient L forms to create extended plate boundaries, U forms to define openings and partial enclosures, and V forms to create angled connections or interruptions between levels.
Horizontal rotation: Primarily 0°, 90°, 180°, and 270° to establish orthogonal plate relationships.
Vertical rotation: 0° or ±90° about the appropriate local horizontal axis to distinguish upright elements from horizontal plate configurations.
Secondary rotation: Up to ±15° for selected nonstructural transitions or edge variations.
Vertical displacement: Position successive letter groups at defined architectural floor levels.
Horizontal staggering: Offset selected plates by 10–25% of their representative depth.
Maintain alignment with a common vertical spatial or structural axis while alternating letter orientation and placement to introduce layered interruptions, vertical openings, and potential sky-garden zones.
Rule 3B — Interlocking Floor Plates and Vertical Sky-Garden Voids
Transform horizontal letter components into occupiable floor plates arranged at successive architectural levels. Generate connections between plates using letter-derived intersections, bridges, and controlled geometric extensions.
Preserve designated U-shaped and V-shaped openings as vertically connected atria and sky-garden voids. Offset selected floor boundaries to produce partial plates, projecting terraces, and recessed exterior or interior gathering areas.
Maintain visual connections between levels while preserving the dominant horizontal character of the composition.
Intended result: A vertically integrated architectural system of layered floor plates, staggered terraces, and interconnected sky-garden openings.

04 — Contained Room Within Volume
Rule 4A — Convergent Letter Orientation and Central Enclosure Formation
Arrange the letters around one dominant central gathering space. Position U forms to establish the primary enclosing geometry, L forms to reinforce supporting boundaries, and V forms to direct movement and visual attention toward the central volume.
Horizontal rotation: 0°–360°, determined by the orientation of the central gathering space and surrounding approach routes.
Preferred alignment: Letter boundaries generally face or converge toward the principal interior.
Vertical rotation: Primarily 0° for upright enclosures, with selected ±90° rotations where letters establish floors, roof elements, or horizontal transitions.
Angular variation: Typically limited to ±15° from the intended boundary alignment.
Vertical positioning: Establish a dominant central volume with secondary surrounding levels.
Orient the letters to establish a clear distinction between the primary enclosure and subordinate spaces. Avoid excessive staggering or rotation that fragments the central gathering volume.
Rule 4B — Continuous Enclosing Architecture and Anchored Interior Volume
Generate a continuous architectural enclosure from the oriented letter profiles through extrusion, geometric blending, and controlled lofting.
Preserve the dominant central room as a recognizable spatial figure within the larger architectural mass. Use surrounding letters to form supporting walls, upper-level boundaries, circulation surfaces, and transitional spaces.
Introduce recessed entry pockets and secondary spatial openings where appropriate without compromising the continuity of the primary enclosure. Maintain convergent circulation and views toward the central occupied volume.
Intended result: A unified architectural enclosure containing a clearly defined and visually dominant gathering space.

05 — Linear Edge Gallery
Rule 5A — Edge-Aligned Letter Orientation and Staggered Boundary Formation
Arrange the L, U, and V letters along a continuous linear or gently curving circulation axis. Orient L forms parallel to the principal gallery direction, U forms toward recessed occupation pockets, and V forms toward directional changes and intermediate connections.
Horizontal rotation: Align letters with the circulation tangent, with controlled variation of approximately ±15°.
Orthogonal transitions: Permit 0°, 90°, 180°, and 270° configurations where the gallery changes direction or establishes cross-connections.
Vertical rotation: 0° for upright edge boundaries and selected ±90° rotations for horizontal gallery components.
Secondary tilting: Up to ±15° for transitional, non-occupiable surfaces.
Vertical staggering: Shift selected letter groups between adjacent architectural levels.
Horizontal displacement: Alternate inward and outward setbacks of approximately 15–35% of local gallery width.
Letter placement must establish a continuous circulation boundary while producing staggered architectural edges, recessed spatial pockets, and visual connections toward the central atrium or adjacent spaces.
Rule 5B — Layered Circulation Galleries and Recessed Edge Alcoves
Transform the oriented letter geometry into continuous circulation galleries, occupiable platforms, and connecting architectural surfaces.
Use controlled level displacement and horizontal setbacks to create staggered galleries and projecting platforms along the primary circulation route.
Generate recessed alcoves within selected gallery boundaries by subtracting pockets from the letter-derived mass. These pockets should accommodate localized gathering, viewing, and temporary occupation without interrupting primary movement.
Apply geometric blending at letter intersections and introduce bridges or vertical circulation connections where required.
Maintain a continuous circulation network and preserve visual relationships with the adjacent atrium or open space.
Intended result: A layered circulation gallery with staggered edges, recessed occupiable alcoves, and uninterrupted spatial connectivity.

Shared Architectural Operations
The following operations should be available to all five typologies, with different parameter ranges and priorities.
Operation
Initial control
Architectural purpose
Horizontal rotation
0°–360°, constrained by typology
Establish boundaries and directional relationships
Vertical rotation
Upright, horizontal, or controlled inclinations
Generate walls, floors, and transitional surfaces
Level displacement
User-defined floor-to-floor rise
Create vertically layered compositions
Horizontal stagger
Typically 10–40% of reference dimension
Form projecting and recessed boundaries
Alcove recess
Typically 15–35% of local bay depth
Create pockets for gathering and occupation
Boundary designation
Floor, wall, edge, enclosure, void
Direct geometric conversion
Protected openings
Explicit void geometry
Preserve atria, passages, and spatial openings
Interlocking
Geometric intersections or designed connectors
Establish spatial continuity without arbitrary overlap
Geometry blending
Adjustable fillets, offsets, and lofts
Develop continuous architectural transitions
Letter preservation
Geometry-based correspondence
Maintain recognizable influence of source L/U/V forms
Reusable Canyon Staggering Operation
Implement a common CanyonStaggering operation for Stepped Amphitheater, Void Field, and Linear Edge Gallery.
Inputs should include:
Level rise.
Horizontal offset distance and direction.
Local boundary rotation.
Alcove depth and width.
Protected void geometry.
Minimum required clearances.
Circulation connectivity requirements.
The operation should generate staggered floor or terrace boundaries and subtract alcove pockets from the resulting architectural mass, subject to geometric validity.
The extent and orientation of the operation must be governed by the source letter configuration rather than arbitrary placement.
Validation
Each typology must demonstrate:
Letter rotations remain within the designated typology constraints.
Source letter identities and selected transformations are preserved.
Proposed architectural boundaries correspond to oriented letter geometry.
Required occupiable floor surfaces are level or independently validated for their intended slope.
Protected atria, openings, and voids remain unobstructed.
Required circulation connections form a continuous network.
Generated alcoves retain usable geometry and do not compromise circulation clearance.
Geometry generation does not introduce unintended self-intersections or disconnected fragments.
Architectural geometry remains traceable to the originating L/U/V forms.
The selected Composition alternative corresponds to the source displayed in Letter-Driven Panel A.
Do not require every letter to intersect every other letter by a fixed percentage. Use typology-specific adjacency and connectivity relationships instead.
Overall objective: Produce five architecturally distinct systems in which controlled letter orientations establish meaningful boundaries and those boundaries generate recognizable, occupiable architectural spaces.

