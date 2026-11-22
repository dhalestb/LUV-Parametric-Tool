import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateVerification, scoreVerifiedDestinations, VERIFICATION_VERSION, VERIFIED_CENTRALIZED_VERSION, type SpatialVerification } from './spatialVerification';
function fixture(): SpatialVerification { return { version: VERIFICATION_VERSION, method: VERIFIED_CENTRALIZED_VERSION, geometryHash: 'hash', sourceId: 'source', filename: 'model.obj', up: 'z', unit: 'ft', updatedAt: 'now', coverageConfirmed: true, regions: [0, 1, 2, 3, 4].map(id => ({ id, sampleIds: [id], boundaryCells: [[id, 0, 0]], levelFeet: 0, area: 200, width: 12, clearHeight: 7.5, openSky: false, role: id === 0 ? 'gathering' : 'occupied', note: 'Reviewed geometry' })), connections: [1, 2, 3, 4].map(to => ({ from: 0, to, state: 'connected', type: 'doorway', path: [[0, 0, 0], [to, 0, 0]], note: 'Reviewed passage' })) }; }
it('rejects metadata for changed geometry or transform hash', () => assert.throws(() => validateVerification(fixture(), 'changed')));
it('round-trips metadata including coordinates without changing the score', () => { const v = fixture(), copy = validateVerification(JSON.parse(JSON.stringify(v)), 'hash'); assert.deepEqual(copy, v); assert.equal(scoreVerifiedDestinations(copy)[0].score, 100); });
it('requires explicit user coverage confirmation', () => { const v = fixture(); v.coverageConfirmed = false; assert.equal(scoreVerifiedDestinations(v)[0].score, null); });
it('keeps uncertain relations unavailable and preserves a bounded result', () => { const v = fixture(); v.connections[0].state = 'unknown'; const r = scoreVerifiedDestinations(v)[0]; assert.equal(r.score, null); assert.ok(r.metrics!.scoreUpper! > r.metrics!.scoreLower!); });
it('scores a confirmed physical separation as unreachable', () => { const v = fixture(); v.connections[0].state = 'separated'; for (const from of [2, 3, 4])
    v.connections.push({ from, to: 1, state: 'separated', type: 'passage', path: [], note: 'Confirmed disconnected component' }); const r = scoreVerifiedDestinations(v)[0]; assert.ok(Math.abs(r.score! - 85) < 1e-10); });
it('rejects connected annotations with no spatial route', () => { const v = fixture(); v.connections[0].path = []; assert.throws(() => validateVerification(v, 'hash')); });
it('scores a confirmed seven-foot gallery using the measured headroom', () => { const v = fixture(); v.regions[0].clearHeight = 7; assert.equal(scoreVerifiedDestinations(v)[0].score, 100); assert.equal(v.regions[0].clearHeight, 7); });
it('requires an unobstructed width measurement', () => { const v = fixture(); v.regions[0].width = null; assert.equal(scoreVerifiedDestinations(v)[0].score, null); });
it('does not elevate a narrow corridor to a gathering destination', () => { const v = fixture(); v.regions[0].width = 2; assert.equal(scoreVerifiedDestinations(v)[0].score, null); });
it('rejects altered imported region support', () => { const original = fixture(), v = fixture(); v.regions[0].boundaryCells = [[99, 0, 0]]; assert.throws(() => validateVerification(v, 'hash', original.regions), /support changed/); });
it('rejects floating imported routes', () => { const v = fixture(); v.connections[0].path.push([100, 100, 100]); assert.throws(() => validateVerification(v, 'hash'), /model support/); });
it('rejects conflicting connected and separated relationships', () => { const v = fixture(); v.connections.push({ ...v.connections[0], state: 'separated' }); assert.throws(() => validateVerification(v, 'hash'), /both connected/); });
it('does not double-count repeated portal evidence', () => { const v = fixture(); v.connections.push({ ...v.connections[0] }); assert.equal(scoreVerifiedDestinations(v)[0].approaches, 4); });
it('collapses branches sharing an upstream approach', () => { const v = fixture(); v.connections.push({ from: 1, to: 2, state: 'connected', type: 'passage', path: [[1, 0, 0], [2, 0, 0]], note: 'Shared upstream space' }); assert.equal(scoreVerifiedDestinations(v)[0].approaches, 3); });
it('does not navigate through excluded mesh fragments', () => { const v = fixture(); v.regions[1].role = 'excluded'; assert.equal(scoreVerifiedDestinations(v)[0].approaches, 3); });
it('preserves the 100-square-foot area and 10-foot width gates', () => { const v = fixture(); v.regions[0].area = 99; assert.equal(scoreVerifiedDestinations(v)[0].score, null); v.regions[0].area = 100; v.regions[0].width = 9.99; assert.equal(scoreVerifiedDestinations(v)[0].score, null); });
import { verifiedResult } from './verifiedCentralizedResult';
import { presentLayers } from '../presentEvidence';
it('passes the gold destination and cyan route geometry through the comparison viewer', () => {
    const v = fixture();
    const result = verifiedResult(v, { mesh: { sourceHash: 'fixture' }, field: { sampleFeet: 1 } } as Parameters<typeof verifiedResult>[1]);
    assert.equal(result.version, VERIFIED_CENTRALIZED_VERSION);
    assert.deepEqual(result.components.map(c => c.contribution), [40, 40, 20]);
    const layers = presentLayers(result.evidence!.layers, 'centralized');
    assert.deepEqual(layers.map(l => l.id), ['ce-gathering', 'ce-approaches']);
    assert.equal(layers[1].polylines?.length, 4);
});
it('keeps the normal evaluation pending without a gathering destination', () => {
    const v = fixture();
    v.regions[0].role = 'occupied';
    const r = verifiedResult(v, {} as Parameters<typeof verifiedResult>[1]);
    assert.equal(r.available, false);
    assert.equal(Number.isFinite(r.absoluteScore), false);
});
