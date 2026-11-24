# Population comparison

Protected baseline checkpoint dbf02bf0d304a6581b9f5449a9c6c3865c09beff. Original five-letter export, manifest and validation were reproduced byte for byte before further changes.

All studies use 40 × 40 × 60 ft, preferred size 13 ft, articulation 75%. Original five placements are exact prefixes of all larger inputs. Additional letters are placed explicitly in the composition stage, using sampled parent contour points and directions with deterministic seeded exploration, containment and separation scoring. Automatic population uses round(field volume / (3.5 × preferred size³)), yielding 12. This density is an experimental choice. Seed 37 supplies nested 8/12/16 studies. Auto uses seed 107.

The preserved baseline uses its original low-elevation articulation. A five-letter control and all larger studies use feature-derived elevations. The control distinguishes that algorithm change from population effects.

|Count|Envelope height / use|Source mesh Z range|Pockets / through openings|Largest connected planar wall|Recess/opening floor elevations|
|---|---|---|---|---|---|
|5 preserved|24 ft / 40.0%|16.01–30.99 ft|1 / 1|337.7 ft²|4.1, 4.1 ft|

|5 elevation control|24 ft / 40.0%|16.01–30.99 ft|3 / 1|337.7 ft²|8.1, 6.1, 5.1, 4.1 ft|

|8|39 ft / 65.0%|16.01–53.23 ft|2 / 1|337.7 ft²|8.1, 11.1, 4.1 ft|

|12|40.5 ft / 67.5%|6.52–54.76 ft|9 / 1|479.4 ft²|16.1, 3.1, 20.1, 12.1, 11.1, 4.1, 9.1, 8.1, 14.1, 21.1 ft|

|16|40.5 ft / 67.5%|6.28–54.76 ft|4 / 3|448.5 ft²|16.1, 5.1, 16.1, 3.1, 19.1, 12.1, 8.1 ft|

|Auto (12)|33 ft / 55.0%|8.37–43.00 ft|2 / 3|489.7 ft²|17.1, 8.1, 6.1, 6.1, 2.1 ft|


Each source mesh vertical interval and source-center elevation, each operation source pair, bay/depth dimensions and elevations, projections and the three largest planar patches appear in population-results.json and the saved result snapshots. Heights use the viewer floor convention (Composition centered Z plus 30 ft).

- Five preserved [Architecture](http://127.0.0.1:4184/amphitheater?study=b6540652-2ebb-4913-bc38-903ac61fedaf) · [Original letters](http://127.0.0.1:4184/amphitheater?study=b6540652-2ebb-4913-bc38-903ac61fedaf&view=A). Independent nonadjacent triangle checks 321968; zero intersections.
- Five control [Architecture](http://127.0.0.1:4184/amphitheater?study=c6cce047-fcf5-447f-8fdb-6a3d45dcc224) · [Original letters](http://127.0.0.1:4184/amphitheater?study=c6cce047-fcf5-447f-8fdb-6a3d45dcc224&view=A). Independent nonadjacent triangle checks 324748; zero intersections.
- 8 letters [Architecture](http://127.0.0.1:4184/amphitheater?study=b2caf2a0-7e61-4d34-a3ae-b79e1b4c459a) · [Original letters](http://127.0.0.1:4184/amphitheater?study=b2caf2a0-7e61-4d34-a3ae-b79e1b4c459a&view=A). Independent nonadjacent triangle checks 486723; zero intersections.
- 12 letters [Architecture](http://127.0.0.1:4184/amphitheater?study=e1aa93b1-3905-4e6b-a894-8f5a56004384) · [Original letters](http://127.0.0.1:4184/amphitheater?study=e1aa93b1-3905-4e6b-a894-8f5a56004384&view=A). Independent nonadjacent triangle checks 602615; zero intersections.
- 16 letters [Architecture](http://127.0.0.1:4184/amphitheater?study=73c54e28-1188-4a4d-bbf3-713c1fdb5be3) · [Original letters](http://127.0.0.1:4184/amphitheater?study=73c54e28-1188-4a4d-bbf3-713c1fdb5be3&view=A). Independent nonadjacent triangle checks 688785; zero intersections.
- Automatic [Architecture](http://127.0.0.1:4184/amphitheater?study=bf7516d4-e1ba-4b95-a840-10b5c2b0e2c5) · [Original letters](http://127.0.0.1:4184/amphitheater?study=bf7516d4-e1ba-4b95-a840-10b5c2b0e2c5&view=A). Independent nonadjacent triangle checks 550157; zero intersections.

Facade measure sums edge-connected coplanar near-vertical mesh triangles, grouping plane normals rounded to 1e-4 and plane offsets to .001 ft. It includes cavity walls and exposes the major X=-20 boundary wall. Larger populations raise massing and create more operations but do not consistently reduce the largest flat patch. Field clipping and ground-to-trajectory solid columns produce these planar boundary walls. Feature connectivity is a minimum spanning network, so additional adjacency opportunities remain unused.

Recesses are accepted at 15–35% of actual local ray-measured bay chords. Backing and mouth probes and final cutter obstruction checks remain active. All runs passed exported-solid manifold, positive volumes, single shell, source transform correspondence, field containment and unchanged independent intersections. Alcove clearance flags remain geometric candidates. Circulation, occupancy, accessibility and principal gathering-void continuity require review. Current 0.5 ft plan sampling, dominant-axis bay projection and type-based soffit profiles limit smooth feature correspondence. Increased population does not fill the full height or guarantee more accepted cuts.

Browser verification extended 8 to 9, saved, removed, restored, and generated study e1f5d69b-aa17-4fd1-9d7f-e63f6c3114b3. Result 9 instances, 31733.498 ft³, zero crossings in 595828 pairs. Production build, TypeScript, build lint, 29 selection-height regressions and 5 Composition refresh tests passed. Existing unrelated build warnings remain.

Start with npm run start -- --hostname 127.0.0.1 --port 4184 from the isolated worktree. Runtime study links require .amphitheater-runs; committed evidence contains exact requests and meshes. To restore a study copy its evidence directory under .amphitheater-runs/<result.id>.
