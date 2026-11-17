const fs=require('node:fs'),path=require('node:path');
const root=__dirname,folder=path.join(root,'abstract-studies');
const rows=JSON.parse(fs.readFileSync(path.join(folder,'results.json')));
const table=rows.map(r=>'|'+[r.id,r.field.join('/'),r.study?.requestedSize,r.study?.actualPopulation,r.components,r.validation?.volume.toFixed(2),r.study?.runtimeMs.toFixed(0),r.status].join('|')+'|').join(String.fromCharCode(10));
const report=[
'# Abstract geometric envelope and performance studies',
'',
'## Construction gate and protected baseline',
'',
'The protected 7e167b1 proof and production 12197f7 are preserved. The first new baseline used the same selected source fixture, 60/40/40 field, nominal 11-foot preferred size and 12 generated instances. construction-gate.json records a passed new-construction check before parameter studies began. All baseline triangle checks passed with zero intersection pairs.',
'',
'The old envelope swept complete U boundary rails and connected their thickened surfaces. The new lower rail interpolates cross-letter anchors derived from L corners and U curve centers. At each parameter sample, it adds a blend of measured curvature deviations from two different U curves relative to their endpoint chords. The upper rail uses L orthogonal directions and actual transformed V arm/apex interpolation. The principal generated rail is therefore a relationship trajectory, not a copied or enlarged source profile. Local ruled surfaces are thickened only after those rails have been constructed.',
'',
'No broad hull filling, preset boxes/cylinders as positive architecture, global smoothing or signed-distance reconstruction is used. Local overlapping ruled cells are unioned to resolve actual intersections. Explicit source-derived focal and recess tools carve the result. All three broad baseline masses reference at least six contributing source instances. The derivation manifest records each sampled U source point, curvature deviation, L direction, V fold point and generated lower/upper coordinate. Separate diagrams show original features and newly generated rails. Source U tangents/normals are evaluated diagnostically in feature-evaluation.json. This implementation uses selected edges and curves; general automatic planar-face patch selection remains unimplemented.',
'',
'The baseline volume changes from 5368.625 to 1433.654 ft3. Architectural acceptance is based on the changed primary construction and comparison views, not volume reduction or connectivity alone. The newer Rule A poses are generated from field margins and feature-region placement; they differ from the previous arranged poses and are fully recorded. Original selected source records remain unchanged.',
'',
'## Native studies',
'',
'|Study|Field X/Y/Z ft|Requested preferred ft|Actual letters|Primary components|Envelope volume ft3|Generation ms|Validation result|',
'|---|---|---:|---:|---:|---:|---:|---|',
table,
'',
'All reported successful actual footprints equal the explicit requested nominal preferred size, before the recorded preserved axis proportions and rotations. Per-instance bounding boxes and transformations are in results.json and each manifest. Default field studies use the existing height-dependent 9/11/13-foot presets. The 9/11/13-foot controlled size studies explicitly override only the preferred size. Source selection, deterministic seed 0, field and 12-letter population remain fixed; feasible pivot/region positions and surface thickness change with source size and are recorded. The generator uses no random sampling. No exact-size letter was silently resized.',
'',
'Widths and depths change source-region locations, boundary travel, fold geometry, protected polygons and envelope dimensions. The width-only, depth-only and height-only cases hold the 11-foot nominal size and 12-letter population fixed. The width-only 40/40/40 geometry fails and is reported, rather than represented as a supported solution.',
'',
'Generation timings include mesh construction, diagnostics and initial image export in separate Node processes. They exclude the subsequent validation and common-scale image re-render. They are local measurements rather than throughput guarantees. The entire performance study is not a claim that every dimensional combination is geometrically feasible.',
'',
'## Population and controls',
'',
'Existing independent field-config.cjs controls are unchanged and imported by the new study. The existing local controls still launch the preceding field study; the abstract solver is an isolated CLI/study workflow and is not wired into production or that form.',
'',
'An optional JSON population target accepts complementary L/U/V groups (multiples of three, at least nine) or the string auto. This grouping is an implementation constraint of the present complementary-region solver, not a new approved architectural rule. There is no fixed maximum. Targets must pass source containment, generated geometry, fragments and opening validation. Existing yaw defaults and explicit override activation/scope are retained.',
'',
'Automatic region quantity uses measured available boundary path length divided by 1.25 times representative source width, with at least three boundary regions. It does not use field-volume proportional population. The baseline field selects 18 letters automatically. The measured 15/18-letter cases insert more source-feature regions into the same three broad envelope components. Their trajectory sample records, folded rails, carved boundary and volumes change. They do not add an independent finished object for every letter.',
'',
'Automatic field studies may have equal populations despite different field volumes because letter sizes and feature reach also change. The larger 60/60/60 field uses 21 letters, not the previous 81-instance framework.',
'',
'## Failures and limits',
'',
'The 20/20/20 case generates nine exact 9-foot instances but fails the intersection test with 28 noncoplanar findings and two material shells. The width-only 40/40/40 case fails with one noncoplanar finding. The fixed 13-foot, 12-letter case has three material shells and fails fragment validation. Preview images and OBJ files remain available under their failed-study folders with explicit failure banners. They are excluded from the recommended mesh-export package. No failed fragments were discarded and no tolerances were increased.',
'',
'Nine cases pass: valid nonzero named/combined meshes, one material shell, required containment, actual removed volume for every tool, final cut clearance and zero crossing/positive-area overlap findings. Named OBJ meshes and tools re-import successfully in these cases. This verifies mesh reconstruction; it does not resolve the historical A/B/C Boolean comparison defect or establish native Rhino solids.',
'',
'Reference letters can overlap the focal tool; exact overlap volumes are reported per manifest. They are generative references and are excluded from the envelope-only mesh. No source-clear focal-volume claim is made.',
'',
'The three curved/angled components establish an open focal space and rising/folded envelope relationships. Full Rule 1B remains incomplete: occupied terraces, floor planning, valid circulation, headroom, alcove usability, accessibility, structure and auditorium sightlines are unverified. Recess tools retain 25 percent local bay depth. A successful cut does not certify an occupied alcove.',
'',
'Field-relative margin, boundary-region positioning, curvature-deviation weight, thickness, projection factors and focal inset are controlled proof parameters, not added architectural requirements. General arbitrary population composition, source-specific face selection, automatic architectural scoring and all-27 geometric feasibility are not implemented. Failed settings need geometric investigation before use.',
'',
'## Review and Rhino outputs',
'',
'index.html presents previous/new construction, all studies and their status. Every case provides A/B/C isometric, plan, elevation and section, named masses, actual source features, generated trajectory diagrams, tools, dimensions, bounds, removed volumes and validation diagnostics. Final A/B/C images use a common 60-foot framing cube. Section lines intersect the frame mid-Y plane, not a selected occupied room. Construction and results are polygonal sampled geometry.',
'',
'Passing case folders export combined-envelope.obj, three named mass OBJs, original-letters.obj, primary-gathering-void.obj, recess tool OBJs and manifests in feet/Z-up coordinates. Separate components overlap deliberately at shared mass interfaces; the combined export is Boolean-unioned. There is no native 3dm or editable NURBS output. Rhino application import itself was not tested.',
'',
'All 29 original height-routing/trim regressions pass. The existing independent field configuration remains unchanged. Production TypeScript/lint/build were not rerun because no production TypeScript/configuration was changed.',
'',
'Changed files comprise proof/abstract-amphitheater.cjs, abstract-validation.cjs, abstract-construction-gate.cjs, abstract-studies.cjs, abstract-review-render.cjs, abstract-recheck.cjs, abstract-review/*, abstract-studies/* and abstract-study-exports.zip. The implementation remains in the isolated proof and has not been pushed or merged.'
].join(String.fromCharCode(10));
fs.writeFileSync(path.join(folder,'README.md'),report);
fs.writeFileSync(path.join(root,'abstract-review/README.md'),report);
for(const r of rows){
 const d=path.join(folder,r.id);
 fs.writeFileSync(path.join(d,'README.md'),['# '+r.id,'','Validation result: '+r.status,'','See ../README.md and this folder manifest.json, validation.json, validation.log and intersection-diagnostics.json. Failed previews are not approved geometry.'].join(String.fromCharCode(10)));
}
let html=fs.readFileSync(path.join(folder,'index.html'),'utf8');
html=html.replace('<h1>Abstract geometric envelope studies</h1>','<h1>Abstract geometric envelope studies</h1><p><strong>9 geometry checks passed; 3 failed.</strong> Architectural compliance remains partial.</p><p><a href="README.md">Full report and limitations</a> · <a href="../abstract-study-exports.zip">Passing-study OBJ export package</a></p>');
fs.writeFileSync(path.join(folder,'index.html'),html);
console.log('Wrote full study report with failures and requested measurements');
