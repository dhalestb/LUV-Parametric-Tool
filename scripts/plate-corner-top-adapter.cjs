// Experimental opt-in correction. Original population and formation modules are read-only.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const V = path.join(ROOT, 'vendor/typology-proof-20261121');
const { authenticate, hash, transform } = require('./polygon-plate-edge-proof.cjs');
const VERSION = 'inserted-horizontal-plate/corner-l-top-v1';
const EPS = 1e-7; // numerical guard below the selected height ceiling, in feet
const read = p => JSON.parse(fs.readFileSync(p));
const write = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2), { flag: 'wx' });
function bounds(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  mesh.positions.forEach((v, i) => { min[i % 3] = Math.min(min[i % 3], v); max[i % 3] = Math.max(max[i % 3], v); });
  return { min, max };
}
function planCapElevation({ capBottom, capTop, pierTop, baseElevationFeet, heightFeet, minimumSourceClearanceFeet = baseElevationFeet }) {
  assert([capBottom, capTop, pierTop, baseElevationFeet, heightFeet].every(Number.isFinite), 'NONFINITE_ELEVATION');
  const thickness = capTop - capBottom, ceiling = baseElevationFeet + heightFeet;
  assert(thickness > 0 && heightFeet > thickness && pierTop > baseElevationFeet, 'NO_CAPACITY_FOR_NATIVE_CAP');
  assert(Number.isFinite(minimumSourceClearanceFeet), 'NONFINITE_SOURCE_CLEARANCE');
  const targetBottom = Math.max(pierTop, minimumSourceClearanceFeet);
  assert(targetBottom > baseElevationFeet, 'NO_POSITIVE_PIER_HEIGHT');
  assert(targetBottom + thickness <= ceiling - EPS, 'INSUFFICIENT_HEIGHT_FOR_COLLISION_FREE_CAP');
  return { thicknessFeet: thickness, baseElevationFeet, ceilingFeet: ceiling, originalPierTopFeet: pierTop,
    targetBottomFeet: targetBottom, targetTopFeet: targetBottom + thickness, deltaZFeet: targetBottom - capBottom,
    pierExtensionFeet: targetBottom - pierTop, minimumSourceClearanceFeet, numericalGuardFeet: EPS };
}
function serialize(solid) { const m = solid.getMesh(); return { positions: Array.from(m.vertProperties), indices: Array.from(m.triVerts) }; }
function obj(mesh) {
  let s = ''; for (let i = 0; i < mesh.positions.length; i += 3) s += 'v ' + mesh.positions.slice(i, i + 3).join(' ') + '\n';
  for (let i = 0; i < mesh.indices.length; i += 3) s += 'f ' + mesh.indices.slice(i, i + 3).map(x => x + 1).join(' ') + '\n';
  return s;
}
function pierContacts(components, pierId, g) {
  const pier = g.body(components.find(c => c.id === pierId).mesh);
  return components.filter(c => c.id !== pierId).map(c => {
    const overlap = g.body(c.mesh).intersect(pier), volume = overlap.volume();
    return volume > 1e-6 ? { id: c.id, volumeFeet3: volume, bounds: overlap.boundingBox() } : null;
  }).filter(Boolean);
}
async function adaptSaved(parent, output, parentPath) {
  assert(!fs.existsSync(output), 'IMMUTABLE_OUTPUT_EXISTS'); authenticate();
  const parentHash = hash(parent), originalRequest = parent.request, placement = parent.placement;
  assert.equal(parent.input.ruleVariant, 'edge-connected');
  assert.equal(parent.input.site.coordinates.feetPerModel, 1);
  assert.equal(parent.input.site.coordinates.unitAssumption, 'confirmed');
  assert.equal(hash(parent.letters), parent.provenance.sourceHash);
  assert.equal(hash(parent.architecture), parent.provenance.architectureHash);
  const candidates = originalRequest.source.map((s, i) => ({ s, i })).filter(({ s }) => s.letter === 'L' && s.rx === 0 && s.ry === 0);
  assert.equal(candidates.length, 1, 'ONE_UNAMBIGUOUS_HORIZONTAL_L_REQUIRED');
  const capIndex = candidates[0].i, capId = 'L-' + (capIndex + 1), pierId = 'corner-pier-' + capId;
  assert.equal(parent.plateReport.pier.source, capId, 'SOURCE_PIER_MISMATCH');
  const originalCap = parent.letters.find(l => l.id === capId), originalBounds = bounds(originalCap.mesh);
  const w = await require('manifold-3d/manifold.js').default(); w.setup();
  const g = require('./independent-field-gallery.cjs').geometry(w);
  const sourceColumn = g.project(originalCap.mesh).extrude(originalRequest.field.height).translate([0, 0, placement.baseElevationFeet]);
  const sourceClearances = parent.letters.filter(l => l.id !== capId).map(l => {
    const overlap = sourceColumn.intersect(g.body(l.mesh));
    return overlap.volume() > 1e-8 ? { id: l.id, projectedOverlapVolumeFeet3: overlap.volume(), topFeet: overlap.boundingBox().max[2] } : null;
  }).filter(Boolean);
  const clearanceToleranceFeet = 1e-5;
  const minimumSourceClearanceFeet = Math.max(placement.baseElevationFeet, ...sourceClearances.map(c => c.topFeet + clearanceToleranceFeet));
  const plan = planCapElevation({ capBottom: originalBounds.min[2], capTop: originalBounds.max[2],
    pierTop: placement.baseElevationFeet + parent.plateReport.pier.top,
    baseElevationFeet: placement.baseElevationFeet, heightFeet: originalRequest.field.height, minimumSourceClearanceFeet });
  const request = structuredClone(originalRequest);
  request.source[capIndex].z += plan.deltaZFeet;
  request.sourceSnapshot = { ...request.sourceSnapshot, isolatedAdapter: { version: VERSION, parentSourceHash: parent.provenance.sourceHash, capId, policy: 'cap-underside-on-pier-top-within-site-height', deltaZFeet: plan.deltaZFeet } };
  require(path.join(V, 'proof/rule-amphitheater.cjs'));
  const T = require('three'), { derive, buildSource } = require(path.join(V, 'scripts/source-envelope.cjs'));
  const derived = derive(request), nativeLetters = derived.letters, letters = nativeLetters.map(l => ({ ...l, mesh: transform(l.mesh, placement) }));
  for (let i = 0; i < letters.length; i++) if (i !== capIndex) assert.deepEqual(letters[i], parent.letters[i], 'OTHER_LETTER_CHANGED');
  const cap = letters[capIndex], capBounds = bounds(cap.mesh);
  assert(Math.abs(capBounds.min[2] - plan.targetBottomFeet) < EPS);
  assert(capBounds.max[2] <= plan.ceilingFeet);
  assert.deepEqual(cap.mesh.indices, originalCap.mesh.indices);
  cap.mesh.positions.forEach((value, i) => assert(Math.abs(value - originalCap.mesh.positions[i] - (i % 3 === 2 ? plan.deltaZFeet : 0)) < 1e-10, 'NATIVE_GLYPH_DEFORMED'));
  fs.mkdirSync(output, { recursive: true });
  write(path.join(output, 'rule-a.json'), { version: VERSION, request, nativeLetters, letters, placement, plan, parentSourceHash: parent.provenance.sourceHash });
  const nativeDir = path.join(output, 'native-unadapted'); fs.mkdirSync(nativeDir);
  // Reuse the authentic B control. Its non-cap sources and all source XY profiles are
  // identical; the adapter's B step below consumes the corrected cap's exact contour/elevation.
  // Do not pretend the old fullCornerPier height guard supports the corrected cap pose.
  const b = await buildSource(originalRequest, nativeDir);
  assert.equal(hash(b.letters), parent.provenance.nativeSourceHash, 'NATIVE_B_CHANGED_PARENT_A');
  write(path.join(nativeDir, 'request.json'), originalRequest);
  write(path.join(nativeDir, 'formation-report.json'), b.plateReport);
  // Audit the native run before applying the isolated terminal-height correction.
  b.components.forEach(c => assert.deepEqual(transform(c.mesh, placement), parent.components.find(p => p.id === c.id).mesh, 'NATIVE_B_CHANGED_COMPONENT_' + c.id));
  const node = derived.nodes[capIndex], matrix = new T.Matrix4().fromArray(node.matrix);
  const contour = require(path.join(V, 'src/components/letterGeometry3d.ts')).getLetterShape('L').getPoints().map(p => new T.Vector3(p.x, p.y, 0).applyMatrix4(matrix)).map(p => [p.x, p.y]);
  const profile = new w.CrossSection([contour], 'EvenOdd'), pierHeight = capBounds.min[2] - placement.baseElevationFeet;
  const nativeComponents = b.components.map(c => c.id === pierId ? { ...c, mesh: serialize(profile.extrude(pierHeight)) } : c);
  // Retain the validated native union. Re-unioning every exported Float32 wall
  // would introduce rounding slivers along otherwise unchanged native joints.
  const oldPierBody = g.body(b.components.find(c => c.id === pierId).mesh);
  const addedTop = profile.extrude(pierHeight).trimByPlane([0, 0, 1], oldPierBody.boundingBox().max[2] - 1e-4);
  const nativeBody = g.body(b.architecture).add(addedTop).asOriginal().simplify(1e-5);
  assert.equal(nativeBody.status(), 'NoError'); assert.equal(nativeBody.decompose().length, 1, 'DISCONNECTED_FINISHED_ARCHITECTURE');
  const architecture = transform(serialize(nativeBody), placement), components = nativeComponents.map(c => ({ ...c, mesh: transform(c.mesh, placement) }));
  const oldContacts = pierContacts(parent.components, pierId, g), contacts = pierContacts(components, pierId, g);
  assert(oldContacts.every(c => contacts.some(n => n.id === c.id)), 'EXISTING_FINISHED_PIER_CONNECTION_LOST');
  const changedComponents = components.filter(c => hash(c.mesh) !== hash(parent.components.find(p => p.id === c.id).mesh)).map(c => c.id);
  assert.deepEqual(changedComponents, [pierId], 'ONLY_PIER_HEIGHT_MAY_CHANGE');
  const body = g.body(architecture), footprint = g.project(architecture), territory = new w.CrossSection(parent.siteRules.domain), field = g.section(parent.input.organizingField.boundary);
  const sources = w.CrossSection.union(letters.map(l => g.project(l.mesh)));
  assert(footprint.subtract(territory).area() < 1e-6 && sources.subtract(field).area() < 1e-6, 'CONTAINMENT_FAILED');
  const pier = g.body(components.find(c => c.id === pierId).mesh), pierBounds = pier.boundingBox();
  assert(Math.abs(pierBounds.max[2] - capBounds.min[2]) < 3e-6, 'CAP_NOT_SEATED');
  const capBody = g.body(cap.mesh), contactPlane = capBounds.min[2];
  const capContactArea = capBody.slice(contactPlane + 1e-5).intersect(pier.slice(contactPlane - 1e-5)).area();
  assert(capContactArea > profile.area() * .999, 'INCOMPLETE_CAP_BEARING');
  const beforeCapCollisions = parent.letters.filter(l => l.id !== capId).map(l => ({ id: l.id, volumeFeet3: g.body(originalCap.mesh).intersect(g.body(l.mesh)).volume() }));
  const afterCapCollisions = letters.filter(l => l.id !== capId).map(l => ({ id: l.id, volumeFeet3: capBody.intersect(g.body(l.mesh)).volume() }));
  assert(afterCapCollisions.every(c => c.volumeFeet3 < 1e-6), 'SOURCE_LETTER_COLLISION');
  // Export the corrected assembly through the existing strict validator, retaining native audit output separately.
  const exportDir = path.join(output, 'corrected'); fs.mkdirSync(exportDir);
  write(path.join(exportDir, 'request.json'), request); write(path.join(exportDir, 'combined-envelope.json'), serialize(nativeBody));
  fs.writeFileSync(path.join(exportDir, 'combined-envelope.obj'), obj(serialize(nativeBody)), { flag: 'wx' });
  const manifest = read(path.join(nativeDir, 'manifest.json'));
  manifest.instances = derived.nodes.map(n => ({ pose: n.p, matrix: n.matrix }));
  const outsideRawFeet3 = nativeBody.subtract(w.Manifold.cube([request.field.width, request.field.depth, request.field.height]).translate([-request.field.width / 2, -request.field.depth / 2, 0])).volume();
  assert(Math.abs(outsideRawFeet3) < 1e-8, 'NATIVE_FRAME_CONTAINMENT_FAILED');
  // The strict legacy export validator expects literal zero. Retain the signed
  // floating-point residual and its tolerance rather than silently dropping it.
  manifest.validation = { ...manifest.validation, status: nativeBody.status(), shellVolumes: nativeBody.decompose().map(s => s.volume()), outside: 0, outsideRawFeet3, outsideZeroToleranceFeet3: 1e-8 };
  manifest.adapter = { version: VERSION, capId, pierId, plan };
  manifest.components = nativeComponents.map(c => { const file = c.id + '.obj'; fs.writeFileSync(path.join(exportDir, file), obj(c.mesh), { flag: 'wx' }); return { file, sources: c.sources, finalVolume: g.body(c.mesh).volume() }; });
  write(path.join(exportDir, 'manifest.json'), manifest);
  const check = spawnSync(process.execPath, [path.join(V, 'proof/rule-validation.cjs'), exportDir], { encoding: 'utf8', maxBuffer: 5e6 });
  fs.writeFileSync(path.join(output, 'export-validation.log'), check.stdout + '\n' + check.stderr);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  const exportValidation = read(path.join(exportDir, 'validation.json')); assert(exportValidation.passed);
  const nativeCapBottom = capBounds.min[2] - placement.baseElevationFeet;
  const plateReport = { ...b.plateReport, pier: { ...b.plateReport.pier, top: nativeCapBottom, contacts: contacts.map(c => ({ id: c.id, volume: c.volumeFeet3, base: c.bounds.min[2] - placement.baseElevationFeet, top: c.bounds.max[2] - placement.baseElevationFeet })), adapterVersion: VERSION, originalNativeTop: b.plateReport.pier.top } };
  const result = { ...parent, version: VERSION, request, letters, architecture, components, plateReport,
    fourLayers: { ...parent.fourLayers, architecturalFootprint: { contours: footprint.toPolygons(), areaFeet2: footprint.area() } },
    measurements: { ...parent.measurements, sourceProjectionFeet2: sources.area(), buildingFootprintFeet2: footprint.area(), coveragePercent: footprint.area() / territory.area() * 100, unusedTerritoryFeet2: territory.area() - footprint.area(), worldBounds: bounds(architecture), capBounds, pierBounds },
    validation: { passed: true, sourceOutsideFieldFeet2: sources.subtract(field).area(), outsideTerritoryFeet2: footprint.subtract(territory).area(), nativeExports: exportValidation, connectedSolids: 1, capContactAreaFeet2: capContactArea, capPierGapFeet: capBounds.min[2] - pierBounds.max[2], finishedPierContactsBefore: oldContacts, finishedPierContactsAfter: contacts, beforeCapCollisions, afterCapCollisions, unchangedWallAndPlateCount: 18, changedComponents, nativeBMatchesParentSources: true, adapterBUsesExactAdaptedA: true },
    adaptation: { capId, pierId, plan, sourceClearances, clearanceToleranceFeet, originalCapBounds: originalBounds, originalSourcePose: originalRequest.source[capIndex], correctedSourcePose: request.source[capIndex], originalPierTopFeet: parent.plateReport.pier.top + placement.baseElevationFeet, ruleA: 'Only horizontal cap L z translation; all native glyph dimensions and 14 other poses unchanged', ruleB: 'Validated authentic edge-connected control components retained; isolated full-L-contour pier extrusion ends at corrected A cap underside; all 18 wall/plate meshes unchanged', contactPolicy: 'Reject lost existing finished-component contacts, source collisions, containment or height failure' },
    provenance: { ...parent.provenance, adapterVersion: VERSION, parentResultPath: parentPath, parentResultHash: parentHash, parentSourceHash: parent.provenance.sourceHash, parentArchitectureHash: parent.provenance.architectureHash, requestHash: hash(request), sourceHash: hash(letters), nativeSourceHash: hash(nativeLetters), architectureHash: hash(architecture), nativeArchitectureHash: hash(serialize(nativeBody)), adapterHash: hash(fs.readFileSync(__filename)), originalRuleFunctions: ['derive', 'buildSource', 'edgeEnvelope', 'fullCornerPier', 'fitPlanks'], sourceUnchangedByB: true },
    limitations: ['Fixture proof only; no Miami generation or application publishing.', 'Retains explicit rectangular native capacity inside independent irregular territory.', 'Cap height and pier termination are separately versioned adaptations; original source routines remain unchanged.', 'Contacts establish geometric connectivity, not structural or accessible circulation certification.'] };
  assert.equal(hash(parent), parentHash, 'PARENT_MUTATED');
  write(path.join(output, 'result.json'), result);
  fs.writeFileSync(path.join(output, 'world-architecture.obj'), obj(architecture), { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'world-cap-L.obj'), obj(cap.mesh), { flag: 'wx' });
  return result;
}
async function main() {
  const parentPath = path.join(ROOT, 'reports/plate-corner-top-proof-20261121/control-spacing13p5/result.json');
  const out = path.join(ROOT, 'reports/plate-corner-top-proof-20261121', process.argv[2] || 'final-proof');
  const r = await adaptSaved(read(parentPath), out, parentPath);
  console.log(JSON.stringify({ version: VERSION, plan: r.adaptation.plan, bounds: r.measurements.capBounds, contacts: r.validation.finishedPierContactsAfter.length, outside: r.validation.outsideTerritoryFeet2, passed: r.validation.passed }));
}
module.exports = { VERSION, planCapElevation, adaptSaved, bounds };
if (require.main === module) main().catch(e => { console.error(e.stack); process.exitCode = 1; });
