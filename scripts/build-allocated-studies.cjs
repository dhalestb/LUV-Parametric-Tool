// Rebuild the five independent Rule A/B studies used for site-wide placement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {gzipSync} = require('node:zlib');
const {createHash} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const board = path.join(root, 'vendor/architectural-board');
const output = path.join(root, 'public/allocated-studies');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const study = (id, file) => path.join(root, 'public/experiment-designs', id, file);
const gallery = '2c4511e2-814d-4e19-9c65-8350a7ced2b1';
const stepped = '0aef1f14-66a5-45b3-a2ba-a31248841e7f';
const room = '0b1ad2d5-083f-4557-88be-f83987059f07';
const plate = '3361a174-dfda-4e02-8125-3e8bb0d3475a';

function reference(id) {
  const {orientation, architecture, status} = read(study(id, 'response.json'));
  const b = read(path.join(root, 'public', architecture.url));
  assert.equal(status, 'complete');
  assert.equal(hash(orientation.components), orientation.geometryHash);
  assert.equal(b.parentGeometryHash, orientation.geometryHash);
  assert.equal(hash(b.architecture), b.geometryHash);
  return {
    datum: orientation.parameters.datum,
    letters: orientation.components.map(({id, letter, nominalSizeFeet, mesh}) => ({id, letter, nominalSizeFeet, mesh})),
    architecture: b.architecture, components: b.components,
    provenance: {study: id, variant: orientation.parameters.recipe, orientationHash: orientation.geometryHash, architectureHash: b.geometryHash}
  };
}

function requestFor(type) {
  if (type === 'room-within-volume') {
    const q = read(study(room, 'rule-b/request.json'));
    q.source = q.source.filter(p => p.levelIndex !== 3);
    q.population = q.source.length;
    return q;
  }
  if (type === 'inserted-plate') {
    const q = read(study(plate, 'rule-b/request.json'));
    // Specify a smaller source population before running B. The walls and plates
    // are rebuilt by the native engine at these poses.
    const factor = .74;
    q.preferredFeet *= factor;
    for (const p of q.source) {
      p.x *= factor; p.y *= factor; p.scale *= factor;
      p.z = (p.z + q.field.height / 2) * factor - q.field.height / 2;
    }
    delete q.sourceSnapshot.cornerAdapter;
    return q;
  }
  const q = read(path.join(root, 'reports/void-field-integration-20261123/reference/request.json'));
  const population = require(board + '/src/components/voidFieldPopulation.ts');
  q.field = {width: 48, depth: 62, height: 40};
  q.population = 12; q.preferredFeet = 8; q.voidField.topZ = 40;
  q.source = population.populateVoidField(q.field, 8, 31, 13, 12, 3);
  q.sourceSnapshot = {...q.sourceSnapshot, arrangementSeed: 31, floorSpacing: 13};
  return q;
}

function siteAxes(mesh) {
  const positions = [], indices = [];
  for (let i = 0; i < mesh.positions.length; i += 3)
    positions.push(mesh.positions[i], mesh.positions[i+2], mesh.positions[i+1]);
  for (let i = 0; i < mesh.indices.length; i += 3)
    indices.push(mesh.indices[i], mesh.indices[i+2], mesh.indices[i+1]);
  return {positions, indices};
}

async function form(type, w, native) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luv-allocated-study-'));
  try {
    const q = requestFor(type);
    q.sourceId = hash(q.source); q.sourceName = 'Allocated ' + type;
    const a = native.derive(q);
    const contacts = type === 'room-within-volume'
      ? require('./room-source-contacts.cjs').createValidator(w, require(board + '/src/components/letterGeometry3d.ts').getLetterShape)(a.letters, a.nodes)
      : require('./void-source-collisions.cjs').validateSourceSolids(w, a.letters, q.source);
    assert(contacts.passed, type + ' source contact validation');
    const b = await native.buildSource(q, dir);
    assert.equal(hash(a.letters), hash(b.letters));
    const replay = await native.buildSource(structuredClone(q), dir);
    for (const key of ['letters', 'architecture', 'components']) assert.equal(hash(b[key]), hash(replay[key]));
    fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(q));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(b));
    execFileSync(process.execPath, [board + '/proof/rule-validation.cjs', dir], {stdio: 'pipe', windowsHide: true});
    const validation = read(path.join(dir, 'validation.json'));
    assert(validation.passed && validation.selfIntersectionPairs === 0);
    if (type === 'void-field') assert(b.voidFieldReport.visibility.passed);
    return {
      datum: 0,
      letters: b.letters.map((l,i) => ({id: l.id, letter: q.source[i].letter, nominalSizeFeet: q.source[i].scale * .92, mesh: siteAxes(l.mesh)})),
      components: b.components.map(c => ({id: c.id, sources: c.sources, mesh: siteAxes(c.mesh)})),
      architecture: siteAxes(b.architecture),
      provenance: {variant: q.envelopeVersion, request: q, nativeSourceHash: hash(a.letters), nativeArchitectureHash: hash(b.architecture),
        contactGate: contacts.version, replayMatched: true, selfIntersectionPairs: validation.selfIntersectionPairs}
    };
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Project indexed triangles into the site's X/Z plan, retaining holes.
function project(w, mesh) {
  const rings = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a,b,c] = mesh.indices.slice(i,i+3).map(j => [mesh.positions[3*j], mesh.positions[3*j+2]]);
    const cross = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    if (Math.abs(cross) > 1e-10) rings.push(cross > 0 ? [a,b,c] : [c,b,a]);
  }
  return new w.CrossSection(rings, 'NonZero');
}

async function main() {
  require(board + '/proof/rule-amphitheater.cjs');
  require('./void-polygon-domain.cjs').authenticate();
  const w = await require('manifold-3d/manifold.js').default(); w.setup();
  const native = require(board + '/scripts/source-envelope.cjs');
  const manifest = {};
  fs.mkdirSync(output, {recursive: true});
  for (const type of ['linear-edge-gallery','inserted-plate','vertical-walls','room-within-volume','void-field']) {
    const data = type === 'linear-edge-gallery' ? reference(gallery) : type === 'vertical-walls' ? reference(stepped) : await form(type, w, native);
    const b = project(w, data.architecture);
    const pieces = data.letters.map(l => project(w, l.mesh));
    const a = w.CrossSection.union(pieces), combined = a.add(b), hull = combined.hull();
    const envelope = hull.toPolygons()[0];
    const metrics = {sourceArea: a.area(), footprintArea: b.area()};
    for (const shape of [hull, combined, a, b, ...pieces]) shape.delete();
    assert(metrics.sourceArea > 0 && metrics.footprintArea > 0 && envelope.length >= 3);
    const bytes = Buffer.from(JSON.stringify({type, envelope, metrics, ...data}));
    manifest[type] = createHash('sha256').update(bytes).digest('hex');
    fs.writeFileSync(path.join(output, type + '.json.gz'), gzipSync(bytes, {level: 9}));
    console.log(type, data.letters.length, 'letters,', data.components.length, 'architectural components');
  }
  fs.writeFileSync(path.join(root, 'src/components/polygonExperiment/allocated-study-hashes.json'), JSON.stringify(manifest, null, 2) + '\n');
}
module.exports={project,siteAxes};
if(require.main===module)main().catch(e => {console.error(e); process.exitCode = 1;});
