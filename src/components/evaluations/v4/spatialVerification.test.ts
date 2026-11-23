import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateVerification, scoreVerifiedDestinations, VERIFICATION_VERSION, VERIFIED_CENTRALIZED_VERSION, type SpatialVerification } from './spatialVerification';
function fixture(): SpatialVerification { return { version: VERIFICATION_VERSION, method: VERIFIED_CENTRALIZED_VERSION, geometryHash: 'hash', sourceId: 'source', filename: 'model.obj', up: 'z', unit: 'ft', updatedAt: 'now', coverageConfirmed: true, regions: [0, 1, 2, 3, 4].map(id => ({ id, sampleIds: [id], boundaryCells: [[id, 0, 0]], levelFeet: 0, area: 200, width: 12, clearHeight: 7.5, openSky: false, role: id === 0 ? 'gathering' : 'occupied', note: 'Reviewed geometry' })), connections: [1, 2, 3, 4].map(to => ({ from: 0, to, state: 'connected', type: 'doorway', path: [[0, 0, 0], [to, 0, 0]], note: 'Reviewed passage' })) }; }
it('rejects metadata for changed geometry or transform hash', () => assert.throws(() => validateVerification(fixture(), 'changed')));
it('round-trips metadata including coordinates without changing the score', () => { const v = fixture(), copy = validateVerification(JSON.parse(JSON.stringify(v)), 'hash'); assert.deepEqual(copy, v); assert.equal(scoreVerifiedDestinations(copy)[0].score, 80); });
it('requires explicit user coverage confirmation', () => { const v = fixture(); v.coverageConfirmed = false; assert.equal(scoreVerifiedDestinations(v)[0].score, null); });
it('keeps uncertain relations unavailable and preserves a bounded result', () => { const v = fixture(); v.connections[0].state = 'unknown'; const r = scoreVerifiedDestinations(v)[0]; assert.equal(r.score, null); assert.ok(r.metrics!.scoreUpper! > r.metrics!.scoreLower!); });
it('scores a confirmed physical separation as unreachable', () => { const v = fixture(); v.connections[0].state = 'separated'; for (const from of [2, 3, 4])
    v.connections.push({ from, to: 1, state: 'separated', type: 'passage', path: [], note: 'Confirmed disconnected component' }); const r = scoreVerifiedDestinations(v)[0]; assert.ok(Math.abs(r.score! - 65) < 1e-10); });
it('rejects connected annotations with no spatial route', () => { const v = fixture(); v.connections[0].path = []; assert.throws(() => validateVerification(v, 'hash')); });
it('scores a confirmed seven-foot gallery using the measured headroom', () => { const v = fixture(); v.regions[0].clearHeight = 7; assert.equal(scoreVerifiedDestinations(v)[0].score, 80); assert.equal(v.regions[0].clearHeight, 7); });
it('scores a confirmed gathering floor without a width measurement',()=>{const v=fixture();v.regions[0].width=null;assert.equal(scoreVerifiedDestinations(v)[0].score,80);});
it('keeps a circulation-only space out of the destination list',()=>{const v=fixture();v.regions[0].role='transition';assert.equal(scoreVerifiedDestinations(v).length,0);});
it('rejects altered imported region support', () => { const original = fixture(), v = fixture(); v.regions[0].boundaryCells = [[99, 0, 0]]; assert.throws(() => validateVerification(v, 'hash', original.regions), /support changed/); });
it('rejects floating imported routes', () => { const v = fixture(); v.connections[0].path.push([100, 100, 100]); assert.throws(() => validateVerification(v, 'hash'), /model support/); });
it('rejects conflicting connected and separated relationships', () => { const v = fixture(); v.connections.push({ ...v.connections[0], state: 'separated' }); assert.throws(() => validateVerification(v, 'hash'), /both connected/); });
it('does not double-count repeated portal evidence', () => { const v = fixture(); v.connections.push({ ...v.connections[0] }); assert.equal(scoreVerifiedDestinations(v)[0].approaches, 4); });
it('collapses branches sharing an upstream approach', () => { const v = fixture(); v.connections.push({ from: 1, to: 2, state: 'connected', type: 'passage', path: [[1, 0, 0], [2, 0, 0]], note: 'Shared upstream space' }); assert.equal(scoreVerifiedDestinations(v)[0].approaches, 3); });
it('does not navigate through excluded mesh fragments', () => { const v = fixture(); v.regions[1].role = 'excluded'; assert.equal(scoreVerifiedDestinations(v)[0].approaches, 3); });
it('reports actual area share and scores narrow irregular gathering regions',()=>{const v=fixture();v.regions[0].width=2;v.regions[0].area=50;const d=scoreVerifiedDestinations(v)[0];assert.equal(d.score,68);assert.equal(d.areaPercent,100*50/850);});
import { verifiedResult } from './verifiedCentralizedResult';
import { presentLayers } from '../presentEvidence';
it('passes the gold destination and cyan route geometry through the comparison viewer', () => {
    const v = fixture();
    const result = verifiedResult(v, { mesh: { sourceHash: 'fixture' }, field: { sampleFeet: 1 } } as Parameters<typeof verifiedResult>[1]);
    assert.equal(result.version, VERIFIED_CENTRALIZED_VERSION);
    assert.deepEqual(result.components.map(c => c.contribution), [20, 40, 20]);
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

import { evaluateFloors } from './spatialVerification';
function twoStoreys() {
    const v = fixture(), upper = fixture();
    for(const r of upper.regions) {
        r.id += 10;
        r.levelFeet = 10;
        r.sampleIds = [r.id];
        r.boundaryCells = r.boundaryCells.map(([x,y])=>[x,y,10]);
    }
    upper.connections = upper.connections.map(c=>({...c,from:c.from+10,to:c.to+10,path:c.path.map(([x,y])=>[x,y,10])}));
    v.regions.push(...upper.regions);
    v.connections.push(...upper.connections,{from:0,to:10,type:'stair',state:'unknown',path:[],note:'unresolved stair'});
    return v;
}
it('evaluates both gathering floors through an unresolved stair and averages their primary scores equally',()=>{
    const v=twoStoreys();
    v.regions.find(r=>r.id===10)!.area=100;
    const floors=evaluateFloors(v);
    assert.equal(floors[0].score,80);
    assert.ok(floors[1].score! < 80 && floors[1].score! > 70);
    const ctx={ mesh:{sourceHash:'test'},field:{sampleFeet:1}} as Parameters<typeof verifiedResult>[1];
    const result=verifiedResult(v,ctx);
    assert.equal(result.absoluteScore,(80+floors[1].score!)/2);
    assert.equal(result.evidence!.layers[1].polylines?.length,8);
    v.connections.at(-1)!.state='connected';
    v.connections.at(-1)!.path=[[0,0,0],[0,0,10]];
    assert.equal(verifiedResult(v,ctx).absoluteScore,result.absoluteScore);
    assert.equal(verifiedResult(v,ctx).evidence!.layers[1].polylines?.length,8);
});
it('keeps a completed floor available while another awaits review',()=>{
    const v=twoStoreys();v.coverageConfirmed=false;v.confirmedFloors=[0];
    const f=evaluateFloors(v);assert.deepEqual(f.map(x=>x.score),[80,null]);
});
it('ranks secondary destinations within their own floor without awarding extra building points',()=>{
    const v=twoStoreys();v.regions[1].role='gathering';
    const [lower,upper]=evaluateFloors(v);assert.equal(lower.primary?.region.id,0);
    assert.deepEqual(lower.secondary.map(d=>d.region.id),[1]);assert.equal(upper.secondary.length,0);
    assert.equal(lower.score,80);
});
it('groups split-elevation regions by reviewed architectural floor',()=>{
    const v=fixture();v.regions[1].levelFeet=.5;v.regions[1].floorFeet=0;
    assert.equal(evaluateFloors(v).length,1);assert.equal(evaluateFloors(v)[0].score,80);
});

it('measures zero convergence and accessibility on a fully reviewed disconnected floor',()=>{
    const v=fixture();v.connections=[];const s=scoreVerifiedDestinations(v)[0];
    assert.equal(s.approaches,0);assert.equal(s.metrics?.reachability,0);assert.equal(s.score,20);
});
