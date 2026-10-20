# C. Diagram verification

## v3.5 before-revision screenshots

The twelve user-supplied screenshots (session assets, 2026-10-14) document the v3.5 comparison UI. They are the before set. They must not be reproduced as the v4 graphic language.

| Descriptor | Least form in the shot | Most form in the shot | What v3.5 actually drew | Why it is not the score evidence |
|---|---|---|---|---|
| Sculptural | Lobby, Ground Field (rank 1/15) | Lobby Continuous Hall (rank pending) | Entire forms painted as gold/cream voxel slabs | Adjacent-normal and entropy terms are mesh properties; the overlay is occupied cells |
| Luminous | Lobby Vertical Void | Lobby Continuous Hall | Tall cyan columns and gold roof patches | Columns are sky-ray bins, including exterior upward samples treated as interior light |
| Hierarchical | workspace undulating | Lobby Continuous Hall | Two giant gold/cyan plates | Voxel plates, not detected floor planes; areas are cell counts |
| Vertically Integrated | Lobby Continuous Hall | Lobby, Ground Field (12/15) | Bare white mesh; no void or chain | v3.5 scored LCH at 0; the diagram had nothing to show and still claimed a rank narrative |
| Sequential | Lobby Continuous Hall | Gathering, Stepped (15/15) | Gold/cyan voxel plates and a pale path | Longest voxel-zone chain; no numbered architectural events |
| Surreal | Lobby Vertical Void | workspace void | Thin cyan centroid line; pale voxels | Cantilever and scale terms used voxel fragments; the line is a centroid proxy |
| Vertically Integrated (repeat) | Lobby Continuous Hall | Lobby, Ground Field | Same empty mesh | Confirms the missing-evidence problem |
| Circulation Activated | workspace open hall | Gathering Linear (15/15) | Gathering Linear buried under gold/cyan blocks | Low-degree voxel graph painted as occupancy, not a route |
| Visually Connected | Lobby, Linear (1/15) | Lobby Continuous Hall | Cyan bars between gold plates | Voxel-bin zone pairs, including stacked elevations |
| Centralized | workspace flat deep-plate | workspace undulating | Oversized gold voxels, small cyan dot | Inner-zone cells, not surface-attached highlights |
| Monumental | workspace void | Gathering Linear (15/15) | Dominant white bounding cubes, gold stick | Box height/volume; the cube is not architectural volume |
| Circulation Activated (repeat) | workspace open hall | Gathering Linear (15/15) | Same voxel mass | Confirms the overlay problem |

Shared v3.5 UI defects visible in every shot:

- “Ranking the source registry…” on one or both sides while a rank is also shown.
- Absolute score hidden; only rank and rounded component integers.
- Component names are v3.5 voxel terms (Adjacent Normal Variation, Zone-to-Zone Visibility, Calibrated Height, …).
- No descriptor-specific legend generated from drawn layers.
- Analysis colours include large translucent voxel fills that read as part of the form.

Those screenshots remain the before record. Do not regenerate them.

---

## v4 diagram method

Every v4 descriptor returns `DescriptorEvidence` with `layers[]`. `AnalysisViewport` draws those layers (patches, volumes, polylines, arrows, points, dimensions) in spec feet. `boardEvidence.projectLayers` projects the same layers onto the board. Display sampling records `shown` / `total` and does not change the score.

| Descriptor | Evidence layers | Legend colours | Views that show the score |
|---|---|---|---|
| Open Volume | ov-qualifying, ov-volume, ov-void, ov-sheltered-low, ov-uncertain, ov-obstructed, ov-exposed | gold clearance, light-blue void, pale-aqua uncertain, gray excluded | isometric + section |
| Convergent | cv-routes, cv-arrows, cv-destination, cv-entries, cv-unsupported | cyan routes, gold destination, pale-aqua entries, dashed gray rejected | plan |
| Sculptural | sc-folds, sc-orientation, sc-bands, sc-mirror | gold folds, light-blue minority surfaces, mid-blue bands, gray mirror | isometric; component toggles |
| Visually Connected | vc-clear, vc-origins, vc-targets, vc-blocked | cyan clear, gold origins, light-blue targets, dashed gray blocked | plan + section |
| Surreal | su-cantilever, su-nonaxis, su-displacement, su-scale | gold cantilever, light-blue non-axis, cyan displacement, mid-blue scale | isometric |
| Monumental | mo-height, mo-plan, mo-volume, mo-clear-height, mo-level | gold height, cyan plan, light-blue volume, gray level | isometric; no bounding box |
| Hierarchical | hi-primary, hi-secondary, hi-tertiary, hi-other | gold / light-blue / mid-blue / gray planes with ft² labels | isometric, plan, section |
| Sequential | sq-path, sq-direction, sq-events, sq-horizontal, sq-vertical, sq-potential | cyan path, gold numbered events, pale-aqua / light-blue transitions, dashed gray potential | plan + isometric |
| Circulation Activated | ca-network, ca-spine, ca-interfaces, ca-junctions, ca-deadends, ca-disconnected | cyan spine, gold interfaces, light-blue junctions, gray dead ends | plan + isometric |
| Centralized | ce-inner, ce-inner-clear, ce-center, ce-guides | gold inner mass, pale-aqua inner clear, cyan centre, gray guides | plan + isometric |
| Vertically Integrated | vi-void, vi-sight, vi-chain, vi-levels, vi-potential | pale-aqua void, light-blue sight, cyan chain, gold levels, dashed gray potential | section + isometric |
| Luminous | lu-overhead, lu-lateral, lu-lit, lu-dark, lu-blocked | gold overhead, cyan lateral, pale-aqua lit, gray dark/blocked | isometric + section |

UI requirements wired in `DescriptorComparison.tsx` and `comparisonBoard.ts`:

- Absolute score 0–100 and registry rank 1–n both shown (`data-absolute-score`, `data-registry-rank`).
- Unavailable descriptors print a reason and are not exported as a completed ranking (`exportBlocked` waits for registry ranks).
- Component-layer select and per-layer legend toggles.
- Annotation sizes from `annotationSizes(height)`: 36 / 32 / 28 / 28 / 23 / 24 at 2160 px, scaled otherwise.
- Board, PNG, SVG, and 3D PNG draw the same legend items.
- Legacy voxel figures are skipped when `item.descriptor.evidence` is present.

---

## Required export examples

Export from Evaluations after Analyze All Forms, with registry ranks resolved, at 7407 × 2160:

1. Open Volume — isometric and one section. Legend must list qualifying clearance, void, and excluded exterior if those layers are drawn.
2. Convergent — plan. Entries numbered, destination gold, rejected routes dashed.
3. Sculptural — isometric with only fold + orientation layers if those are the focus.
4. Visually Connected — plan. Eye-height origins visible; no cross-level rays.
5. Hierarchical — isometric of a multi-level form (not a one-level hall).
6. Sequential — plan with numbered events.
7. Circulation Activated — plan spine, not a filled mass.
8. Vertically Integrated — section of an atrium-like form; void and circulation in different colours.
9. Luminous — isometric arrows, not columns.

Centralized, Monumental, and Surreal must also export once to confirm dimension arrows, radial guides, and cantilever patches.

Until those PNGs are captured in this session, this file is the verification checklist. After capture, store them next to this report as `exports/<descriptor>-v4.png` without overwriting the v3.5 screenshot assets.

---

## Why v4 is more defensible than the screenshots

1. The overlay is the measurement, not a later illustration of a voxel score.
2. Roof air is no longer gold “open volume” or cyan “daylight.”
3. Circulation is a polyline on a standing surface, not a filled occupancy.
4. Monumental dimensions are labelled in feet; the bounding cube is gone.
5. Potential and verified conditions use labels and dashed vs solid lines.
6. A one-level hall does not receive a fake Vertically Integrated or Hierarchical rank.
7. Sampled drawings state how many of the measured elements are shown.
