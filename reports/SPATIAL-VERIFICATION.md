# Centralized spatial verification

Open Evaluations and expand **Centralized · verify regions and circulation**. Load the review, select a model and a region, and compare its plan and 3D footprints. Geometry is sampled in feet with Z vertical. For these three files choose feet and Z up in Lattice and assign each source to a slot. A fresh OBJ import can default to Y up.

Gold identifies the current review selection. Inspect its continuous floor area, width, headroom and use. Review the source-coordinate waypoints before confirming a route. The paired diagrams draw confirmed approaches in cyan. The full region diagnostic overlay is optional. Save each correction through the controls and export the spatial JSON to transfer it to another browser or computer. Import checks the source digest and sampled region support. Changing scale, vertical axis, coordinates or faces changes the digest. The source OBJ is read-only.

## Scores

Analyze All Forms uses the revised Centralized method and restores matching saved reviews. A completed review can also be applied immediately. Historical graph calculations remain available in the baseline records. Stepped's previous 6.13 belongs to graph v1. New evaluations with insufficient architectural evidence have an unavailable score and no comparative rank. Historical and verified Centralized methods have different cohorts.

For a confirmed gathering region, G is the cube root of the product of capped ratios for continuous area / 200 ft², clear width / 12 ft and clear height / 7 ft. A confirmed open-to-sky area receives a height factor of one. A missing overhead hit alone cannot establish open sky. The region needs 100 ft², 10 ft clear width, usable headroom and a confirmed approach. A usable seven-foot gallery can qualify. Use and width require confirmation. The defaults are architectural calibration parameters.

C is the number of distinct approach branches divided by four, capped at one. The calculation groups duplicate portals and approaches that join upstream when the destination is removed. This conservative grouping can collapse a loop. R is the area of reachable occupied origins divided by the reviewed occupied origin area, excluding the destination. Unresolved routes can withhold the score. A route in the review is an architectural attestation supported by model coordinates, not a formal assessment of accessible passage.

The primary is the highest scoring qualifying destination. The candidate list shows other reviewed destinations and missing measurements. The result is 100 × (0.4G + 0.4C + 0.2R).

## Original models

Open [the offline location guide](spatial-review/index.html) for nine review locations, plan and 3D drawings, and the coordinates of detected passages. Each model has its own importable JSON. All role and connection labels initially require review. An inferred surface can be part of a roof or a circulation transition. A step edge alone cannot establish a staircase or ramp. Clear height in the review defaults to the minimum sampled overhead hit, which may be a local obstruction. A corrected area changes the area measurement while the overlay continues to show the selected sampled footprint.

| Model | Open Volume | Visually Connected | Circulation Activated | Vertically Integrated | Centralized v2 |
|---|---:|---:|---:|---:|---|
| Linear | 24.8 (3/3) | 32.3 (1/3) | 44.1 (2/3) | 30.0 (2/3) | Pending |
| Stepped | 1.5 (1/3) | 36.0 (2/3) | 44.3 (3/3) | 45.2 (3/3) | Pending |
| Void Field | 7.9 (2/3) | 47.5 (3/3) | 16.3 (1/3) | 20.5 (1/3) | Pending |

These values reproduce the accepted ranking audit with top decks excluded. The page also offers a top-deck inclusion setting. The three original file hashes, twelve full-precision unchanged scores, and all three persisted review templates were checked by verify-spatial-review.cjs. No architectural use or connection has been confirmed on the author's behalf.

[Exact comparison matrix](spatial-review/comparison-matrix.json) · [Region and route coordinates](spatial-review/confirmations.json) · [Model checks](spatial-review-validation.log) · [Evaluation tests](spatial-verification-tests.log) · [Production build](spatial-verification-clean-build.log)

## Validation and preservation

All 182 Evaluation tests passed. TypeScript completed without diagnostics. Targeted lint found zero errors and one warning about using an image element for the locally generated SVG views. The first production builds hit Windows EPERM when creating Next output directories. A fresh local build directory with the same source and locked dependencies produced a successful production build. The production page restored all three assigned files, used Z up and feet, evaluated five descriptors for each, and displayed the revised Centralized method for every form.

The review package includes production-page screenshots for Linear R10, Stepped R70 and Void Field R34. Plan and 3D drawings for the other listed locations are available in the offline guide. A numeric Centralized score still requires the architectural confirmations listed there.
