# Void Field quantity expansion

Local, uncommitted development in LUV-Gathering-Envelope-Experiment, experiment/gathering-envelope. Protected HEAD remains 9c01558. The existing uncommitted Inserted Plate pilot is retained. No push, merge or deployment.

Void Field now supports integer source populations 9–15. Automatic remains 9. The quantity is used by Generate Design and New Design. Regenerate Architecture retains the existing source letters and transforms; increasing its quantity field alone does not add letters to an existing composition.

## Geometry preservation

The source sampler retains three interior L/U/V sources with horizontal faces and Z yaw 75°/90°/105°. Additional occupied sources are balanced across the three levels. At nine letters, the level distribution and random sequence are exactly unchanged; a portable original seed-19 request is compared byte-for-byte in the new tests. Native architectural profiles, trimming, wall rules, protected voids, connectivity checks and all geometric acceptance thresholds are unchanged. Source count gates in the UI, API and generator now consistently allow 9–15. Inserted Plate keeps its separate nine-letter pilot gate.

Default New Design tests up to eight different source compositions only when no explicit seed is supplied. Progress reports candidate checking. It never changes requested quantity, field, letter size or spacing to make a candidate pass. Rejected candidates are not saved. Regenerate Architecture never retries by changing a source arrangement. Explicit seeds are respected. This extends the pre-existing candidate workflow used by Stepped Amphitheater.

## Validated open-atrium examples

40 × 40 × 60-ft field, 13-ft preferred letters, 12-ft spacing, three source-derived voids and three floors:

| Actual letters | Seed | Volume ft³ | Triangles |
|---|---:|---:|---:|
| 10 | 211 | 4489.583 | 11210 |
| 11 | 149 | 4831.369 | 11996 |
| 12 | 149 | 4827.396 | 12658 |
| 13 | 37 | 5549.176 | 12298 |
| 14 | 149 | 5152.623 | 12518 |
| 15 | 37 | 6126.546 | 14474 |

Each has one connected exported solid, zero precise self-intersections, no material outside the field, preserved source poses, visible contributions from every letter, unobstructed protected voids including actual floor slices, and verified floor-facing/cross-level/open-sky views. Count 12 also passes Face-Normal mode (12,594 triangles). Count 15 passes 15-ft spacing (14,476 triangles). See extra-cases.json.

Initial discovery rejected several seeds for cavities, fragments, blocked views or lost exposed contributions. Those reasons remain in discovery.json; no validation was weakened to accept them. The reproducible regression suite uses known passing seeds and preserves the original nine-letter cavity rejection. Rejection remains possible for other seeds, edits, dimensions and sizes.

Run node scripts/void-field-population-tests.cjs or npm run test:envelope (eleven suites). Portable requests for all six added counts are in proof/fixtures; the normal study setup includes 12 and 15. A new UI study is saved separately during verification. Existing study files and the previous checkpoint are retained.

## Changed files for this feature

src/components/voidFieldPopulation.ts; scripts/source-void-field.cjs; src/components/AmphitheaterStudio.tsx; src/app/api/amphitheater/route.ts; scripts/amphitheater-interactive-worker.cjs; scripts/void-field-tests.cjs (old fixed-population rejection replaced by out-of-range rejection); scripts/void-field-population-tests.cjs; scripts/envelope-regression-tests.cjs; docs/ENVELOPE_EXPERIMENT.md; proof/fixtures/envelope-studies.json; proof/fixtures/void-field-nine-seed19.json; proof/fixtures/void-field-10.json through void-field-15.json; reports/void-field-population/*.

Geometric visibility does not certify daylight levels, structure, accessibility or usable circulation. Existing source-based architecture is retained; this change does not implement additional interior voids for every added source.

## Actual application verification

http://127.0.0.1:4201/amphitheater?study=6546a87c-b6e9-48cc-94d8-ef2bafdb1ae2

The editable quantity was set to 12 and Generate Design created 12 actual instances plus validated architecture. The saved API source array and architecture mesh match the independently tested 12-letter fixture exactly. The screenshot records the editable control and rendered result. TypeScript, targeted lint, production build and all eleven regression suites passed.
