# C. Architectural validity

Each classification is about the current code, not about the English name of the descriptor.

## Open Volume — potentially misleading measurement

What it measures: the area-weighted credit of vertical rays fired upward from original triangles whose normal is at least 0.68 upward. Credit is 0 at or below 5 ft, rises to 1 at 10 ft, and is 1 when the ray never hits another triangle (`clearanceAccessCredit`, lines 369–374; `rateSurfaceClearance`, lines 380–391).

What the name claims: the open volume of the architecture, as a person would occupy or see it.

Where they part:

- Exterior air above a roof has no overhead triangle, so it scores as fully open. That is surrounding air, not a room.
- A thin lid can be skipped when the next hit is more than 3 ft above it (lines 307–312). Room within Volume ranks 15 of 15 at 99.72 largely because the space above the lid is treated as open.
- The gold drawing omits ceilings and gaps of 5 ft or less. The score still includes those samples.
- The ray does not test whether a person can enter from the side. A tall gap sealed at the edges still scores.

This is a direct geometric measurement of overhead clearance. It is not a measurement of enclosed occupiable volume. Calling the result Open Volume overstates what the ray proves.

The inactive voxel blend (free cells, permeability, interstitial cells, low mass) is also a box count inside the occupied bounds. It is not active for these OBJs.

## Convergent — weak or incomplete proxy

What it measures: on the walkable shell graph, the share of low-degree cells that can reach one junction, the number of 45° approach sectors, and the straightness of those shortest paths (`corridorScore`, lines 303–391).

What the name claims: movement converging on a destination.

The graph is not a corridor. A walkable cell is air sitting on an occupied surface voxel, including the exterior top of the form. Degree ≤ 2 is a narrow chain in that graph, not a walled corridor. A form with fewer than four such cells scores 0 even if the architecture is one clear room aimed at a destination. Room within Volume and workspace open hall both score 0 for that reason.

Gathering Linear scores 73.25 and ranks 14 because many of those shell chains reach one end. That is a defensible proxy for path convergence only inside this graph. It does not verify a corridor a person can walk.

## Sculptural — defensible architectural proxy

What it measures: edge fold of the original surface (divided by 90°, despite the 60° label), entropy of normal directions, variation of occupied-cell counts by height, and mirror misses (`sculptural`, lines 960–989).

What the name claims: a form that is shaped rather than extruded.

The normal terms read the original surface and are the strongest part of the descriptor. The section and mirror terms read the occupied voxel shell, so a wrinkled surface on a symmetric box can still score high on entropy while the plan term stays moderate. Gathering Linear’s entropy is 97 and its dihedral term is only 15, which is why it ranks 2 of 15 despite a busy surface. Lobby Continuous Hall ranks 15 because entropy, section variation, and mirror misses are all high.

Direct for surface direction. A proxy for “sculptural” as a design judgment. The 60° label is a documentation error, not a second formula.

## Visually Connected — weak or incomplete proxy

What it measures: grid rays between samples of walkable bins (`visuallyConnected`, lines 729–811). A clear ray is counted only when it also crosses an empty midpoint, touches a somewhat enclosed zone, or runs under occupied cells.

What the name claims: visual connection between architectural zones.

The rays are cell-index lines through the occupancy grid. They are not eye-height sightlines on the original mesh, and they do not know glazing. Zones are 3-cell bins of shell-top walkable cells, not rooms. Lobby Continuous Hall ranks 15 of 15 at 41.65, which is still a modest absolute score. The rank says it is the most connected of these 15, not that it is highly connected in an absolute visual sense.

Defensible as a voxel sightline proxy. Not a view analysis.

## Surreal — weak or incomplete proxy

What it measures: area whose normal is off-axis, plan shift between the lower and upper halves of the occupied cells, variation in plate size, and cells with no support in a 3×3 column (`surreal`, lines 991–1043).

What the name claims: an unexpected or uncanny spatial arrangement.

Off-axis area is a direct surface measurement. The other three terms are mass statistics. A cantilever that is carried by a column one cell away counts as supported. A diagonal shift of centroids is not the same as a perceived lean. Component scale variance uses the same plates as Hierarchical, so a form with one huge plate and many tiny ones scores as surreal and also feeds Hierarchical. Gathering Linear’s surreal score of 32.7 is mostly that plate-size term (precise 100, weight 0.25) with cantilever 0.

Proxy for irregular mass. Not a measure of surreal architectural intent.

## Monumental — potentially misleading measurement

What it measures: mesh bounding-box height, occupied-voxel volume, and height divided by the longer plan side (`monumental`, lines 1045–1068). The scales are fixed: 8–40 ft, 400–12,000 ft³, and a slenderness of 0.4–2.5.

What the name claims: monumentality.

Height is a direct dimension of the axis-aligned box, which includes empty corners of the box. Volume is the volume of voxels the surface samples pass through, not the volume of the hall. Gathering Linear’s 5,392 ft³ is 674 cells × 8 ft³. A solid 20 ft cube would be 8,000 ft³. The number is shell bulk. Both worked examples are about 20 ft tall, so both sit near the low end of a scale that reaches 40 ft. Gathering Linear ranks 15 of 15 at 37.5 because it is the largest of a short set, not because 20 ft is monumental on the stated 40 ft scale.

Direct for box height. Misleading for volume and for the word monumental.

## Hierarchical — weak or incomplete proxy

What it measures: gaps between the first, second, and third connected plan plates, plus the largest plate’s share of plate area (`hierarchical`, lines 881–895).

What the name claims: a hierarchy of primary, secondary, and tertiary space.

Plates are 4-connected occupied cells on one Z index with at least 2 cells. They are not floor plates, rooms, or program areas. A single plate, which is the strongest possible dominance, is forced to a dominance score of 0. Lobby Continuous Hall ranks 15 at 37.15 mostly because the second plate is much larger than the third (precise 79, weight 0.35), while the primary-to-secondary gap is only 5. The score can therefore reward a gap lower in the list more than a clear primary space.

Proxy for uneven voxel plates. Not a spatial hierarchy.

## Sequential — weak or incomplete proxy

What it measures: length and changes along the longest path in a graph of 5×5×2 bins of walkable cells (`sequentialAndCirculation`, lines 545–601).

What the name claims: a sequence of architectural events.

The bins are not rooms. Depth saturates: 3 hops score about 43, and 6 zones already score 100 on the ordered-zone term. Lobby Continuous Hall ranks 1 of 15 at 49.67 with only 2 hops and 3 zones. Gathering Stepped ranks 15 at 82.67. The order matches “more bins on a path,” not a verified sequence of spaces. Path legibility falls when the bin graph has extra edges, which is a graph property.

Proxy for graph depth. Not a spatial sequence.

## Circulation Activated — weak or incomplete proxy

What it measures: how much of the binned walkable field touches a low-degree route, whether that route is one piece, how many clustered junctions it has, and how few dead ends it has (lines 603–671).

What the name claims: circulation that activates the building.

Nothing in the function checks clear headroom, door width, slope, or continuity of a floor. The route definition removes cells that touch a 6-cell “room,” so the open middle of a hall is excluded from the route on purpose. A highly occupied open hall can therefore score as poorly activated. workspace open hall ranks 1 at 11.59. Gathering Linear ranks 15 at 92.58 because its shell graph is a large connected low-degree network. That can be a real difference in the graph. It is not evidence that a person can traverse the building.

Proxy for a derived network. Not traversability.

## Centralized — defensible architectural proxy

What it measures: where the occupied cells sit relative to their own centroid and their bounding box (`centralized`, lines 813–848).

What the name claims: a centralized organization.

This is a direct description of the occupied mass in plan. It does not know a center of use, a courtyard, or a public room. Lobby Continuous Hall ranks 14 at 90.2 because its occupied cells cluster inside half the radius. Gathering Linear ranks 3 at 61.5 because more of its cells sit outward. The inner-zone term treats 25% of cells inside half the radius as the zero point, which is a disk-area assumption applied to an arbitrary outline.

Direct for mass location. A proxy for architectural centralization.

## Vertically Integrated — potentially misleading measurement

What it measures: whether successive walkable plates can reach each other on the shell graph, plus a vertical hole through occupied plates (`verticallyIntegrated`, lines 234–296).

What the name claims: vertically integrated space, such as an atrium a person can use.

Lobby Continuous Hall scores 0 and ranks 1, which matches a form whose walkable shell does not stack. Several lobby and workspace forms score exactly 100 because every level pair links and the shaft terms saturate (`area/8` and full height). A 4-cell hole is enough to score 50 on the void term when it spans the mass. The cross-level raw value is the cell count, while the score is a different ratio, so the stored raw input does not reconstruct the term by itself.

The links include a 3×3 step between walkable cells and a shaft whose mid-height has two occupied side neighbors (network links, lines 108–138). That is not a stair, a ramp, or a checked opening. Gathering Linear scores 72.5 with traversable connectivity 100 and a 4-cell shaft. The comparison drawing for this descriptor only marks walkable cells that have another walkable cell directly above or below, so this file can score high and still draw nothing. The drawing is stricter than the score.

Proxy for stacked voxels and holes. Not verified vertical access.

## Luminous — potentially misleading measurement

What it measures: whether 10 upward grid directions from up to 36 walkable samples miss occupied cells, whether sampled upward triangles have a clear vertical ray, and how far those rays travel (`luminous`, lines 1082–1137).

What the name claims: luminous architecture, daylight.

There is no sun position, sky model, glazing, reflectance, or interior illuminance. A clear ray in the occupancy grid is not daylight. Exterior samples on top of the shell see the sky easily, so an open roof scores as luminous. Lobby Continuous Hall ranks 15 at 86. Gathering Linear ranks 4 at 52. The order is consistent with how covered the shell-top samples are. It is not a daylight-performance result.

Proxy for upward openness of the voxel shell. Not luminous performance.

## Summary

| Descriptor | Classification |
| --- | --- |
| Open Volume | Potentially misleading. Direct overhead-clearance test, including exterior air |
| Convergent | Weak proxy. Shell-graph convergence, not a corridor |
| Sculptural | Defensible proxy. Direct surface normals plus voxel shape |
| Visually Connected | Weak proxy. Voxel rays between bins, not views |
| Surreal | Weak proxy. Off-axis area plus mass statistics |
| Monumental | Potentially misleading. Box height and shell-voxel volume |
| Hierarchical | Weak proxy. Uneven voxel plates, not spatial rank |
| Sequential | Weak proxy. Longest bin-graph path |
| Circulation Activated | Weak proxy. Derived route graph, not a traversable path |
| Centralized | Defensible proxy. Direct plan location of occupied mass |
| Vertically Integrated | Potentially misleading. Graph links and holes, not vertical access |
| Luminous | Potentially misleading. Upward voxel openness, not daylight |
