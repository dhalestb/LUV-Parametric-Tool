# Continuous gathering area

The Centralized descriptor uses the version `centralized-area-v4.0.0`. Floor assignments, same-floor reachability and independent approach counting retain the floor-level methodology. Source files and previous comparison records keep their original versions.

## Area and headroom

Area is measured in square feet in plan. For each inferred region, intersect the region’s sampled footprint with the union of its supporting OBJ faces. On each support plane, clip overhead triangles to the volume between the floor and seven feet above it and subtract their projected footprints. Exactly seven feet qualifies. The 0.0001-foot numerical tolerance prevents floor and ceiling faces at the cutoff from being subtracted twice. A 0.001-foot buffer on either side of a zero-thickness wall preserves the partition. Separate pieces join across planes only at a shared three-dimensional edge of positive length. Point contacts and vertically stacked projections remain separate.

The largest continuous usable piece is the candidate area **A**. All usable pieces contribute to the level denominator, along with other non-excluded regions assigned to that level. Candidate share is **100 × A / level usable area**. The denominator is provisional until the reviewer distinguishes occupiable floors and circulation from roofs and other non-occupiable surfaces. Only spatial regions detected from the source can contribute. Modeled coverage and measured minimum headroom are reported independently. Missing ceilings require review.

## Scoring

Gathering contributes **40 × A / (A + 200 ft²)**. The fixed 200 ft² reference gives a 200 ft² space 20 points and a 600 ft² space 30 points. It is a calibration choice. There is no minimum width, required circle, area gate or finite area that earns an automatic 40. The reported floor percentage provides scale context. It is not counted a second time in the formula.

Verified same-floor convergence contributes up to 40 points. Accessibility from other occupied regions on the same floor contributes up to 20. Geometric eligibility proposes a candidate. It does not establish gathering use. Multiple local step transitions are flagged for functional review. A space classified as circulation-only can carry routes and contribute usable floor area without being ranked as a gathering destination. Unknown access remains unresolved. Floor primaries contribute equally to the building comparison.

## Original models

The [model results](area-results.json) include each candidate’s region ID, continuous area, floor denominator, floor share and outstanding review evidence. For Stepped R70, 197.25 ft² out of 880.07 ft² gives a provisional 22.41% floor share and 19.86 of 40 gathering points. Its measured 5.85 ft local obstruction removes only the affected footprint. Functional classification and same-floor circulation evidence determine whether a complete Centralized score can be published.
