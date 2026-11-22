# Centralized gathering visualization refinement

The former primary region was the harmonic-closeness winner. It did not establish suitability for gathering. Mathematical graph calculations and the `centralized-graph-v1.0.0` score are retained. Gathering display evidence has its own revision marker.

Eligibility uses an independently tested continuous subset of floor samples in a region, bounded clearance at least 7.5 ft, continuous area at least 100 ft², a supported neighbourhood with 5 ft radius, and at least one sampled verified connection to another region. Continuous area is found with the existing same-plate adjacency and wall checks. Open sky and unbounded/unknown heights do not qualify as measured usable volume. These initial conservative thresholds are not a certification of use or accessibility. A corridor wider than the threshold may still qualify; OBJ geometry cannot establish program semantics. Prominence is represented by area as a tie-breaker; qualifying candidates are ranked by harmonic closeness then betweenness, then continuous area. The gathering winner can differ from the network winner. No typology names enter selection.

The gold highlight is the qualifying sampled surface extent. Secondary candidates, inferred regions, network winner, geometric centroids and connections are hidden initially but individually available in the legends. Network score and gathering destination are displayed separately. No candidate triggers the explicit message `Gathering Space Not Reliably Identified`.

## Stepped.obj validation

The user-loaded G2 model still scores 6.1. None of its 64 inferred regions qualifies. Region 4, the network winner, has less than 100 ft² continuous qualifying floor and no sampled 10 ft-wide supported neighbourhood. Regions 6 and 28 have sufficient continuous area and graph connections but fail the width check. Region 27 fails width and connectivity. All remaining regions fail the continuous-area and/or width criteria, often connectivity as well. These are limitations of the sampled model, not proof that real gathering spaces do not exist.

The images are direct Evaluation viewer PNG exports. `diagnostics-3d.png` and `diagnostics-plan.png` reconstruct the prior all-diagnostics view by enabling its original layers. `focused-3d.png` and `focused-plan.png` show the new default with no unsupported gathering highlight. They are comparative viewer exports, not historical screenshots captured before editing. The browser was left on the focused 3D view.

Additional bundled O1 Open Hall, O3 Flat Deep Plan and G5 Linear Edge Gallery were checked. None passed all eligibility gates. Network results remained 30.0, unavailable and unavailable respectively, matching the prior graph-method results. No source geometry or unrelated descriptor scoring changed.

75 graph, cache, rank, evaluation and presentation checks passed. A regression verifies that an unsupported hall/slab does not get a substitute gathering highlight. Full project TypeScript/build checks remain limited by the previously documented incomplete review-copy dependencies and existing type errors; they were not asserted to pass in this change. No commit, merge, push or deployment occurred.

Changed code: `v4/evaluateV4.ts`, `v4/evaluateV4.test.ts`, `objDescriptorAnalysis.ts`, `presentEvidence.ts`, `DescriptorComparison.tsx`, `ArchitecturalEvaluations.tsx` under `src/components/evaluations`.
