require('../scripts/ts-test-register.cjs');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { parseObj } = require('../src/components/lattice/parseObj.ts');
const { buildV4Context } = require('../src/components/evaluations/v4/evaluateV4.ts');
const { centralizedContext } = require('../src/components/evaluations/v4/centralizedContext.ts');
const { reconstructArchitecturalRegions } = require('../src/components/evaluations/v4/architecturalRegions.ts');
const { regionDiagnosticSvg } = require('../src/components/evaluations/v4/architecturalRegionDiagnostics.ts');
const { VERIFICATION_VERSION, VERIFIED_CENTRALIZED_VERSION } = require('../src/components/evaluations/v4/spatialVerification.ts');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const refs = require('./centralized-phase2/model-evidence.json');
const dir = process.argv[2];
if (!dir)
    throw Error('Provide source OBJ directory');
const out = 'reports/spatial-review';
fs.mkdirSync(out, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/arial.ttf', 'Arial');
(async () => { const summary = []; for (const ref of refs) {
    const m = parseObj(fs.readFileSync(path.join(dir, ref.filename), 'utf8'), ref.filename), source = { positions: m.positions, faces: m.faces, up: 'z', unitScale: 1 }, ctx = centralizedContext(buildV4Context(source, ref.result.sourceId));
    if (ctx.mesh.sourceHash !== ref.result.sourceHash)
        throw Error('Source mismatch');
    const r = reconstructArchitecturalRegions(ctx, { enabled: true });
    const hash = crypto.createHash('sha256').update(JSON.stringify({ positions: Array.from(m.positions), faces: m.faces.map(f => f.vertices), up: 'z', scale: 1 })).digest('hex');
    const meta = require('../src/components/evaluations/v4/spatialReviewFactory.ts').createSpatialReview(ctx, r, { hash, id: ref.result.sourceId, filename: ref.filename, unit: 'feet', up: 'z' });
    fs.writeFileSync(path.join(out, ref.filename + '.spatial-review.json'), JSON.stringify(meta));
    const largest = [...r.regions].sort((a, b) => b.area - a.area).slice(0, 3);
    summary.push({ filename: ref.filename, geometryHash: hash, locations: largest.map(v => ({ id: v.id, centroid: v.centroid, area: v.area, clearHeight: meta.regions.find(x => x.id === v.id).clearHeight, proposedConnections: meta.connections.filter(c => c.from === v.id || c.to === v.id) })) });
    for (const v of largest)
        for (const iso of [false, true]) {
            const svg = regionDiagnosticSvg(ctx, r, { selectedRegion: v.id, isometric: iso, levelId: iso ? undefined : v.levelId }), stem = ref.filename + '-R' + v.id + (iso ? '-3D' : '-plan');
            fs.writeFileSync(path.join(out, stem + '.svg'), svg);
            const c = createCanvas(640, 510);
            c.getContext('2d').drawImage(await loadImage(Buffer.from(svg)), 0, 0);
            fs.writeFileSync(path.join(out, stem + '.png'), c.toBuffer('image/png'));
        }
} fs.writeFileSync(path.join(out, 'confirmations.json'), JSON.stringify(summary, null, 2)); console.log(summary.map(x => ({ filename: x.filename, locations: x.locations.map(v => ({ id: v.id, centroid: v.centroid, area: v.area })) }))); })().catch(e => { console.error(e); process.exitCode = 1; });
