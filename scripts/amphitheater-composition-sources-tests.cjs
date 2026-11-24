const test=require('node:test'),assert=require('node:assert/strict');
require('./ts-test-register.cjs');
const {mergeCompositionSources,collectCompositionSources,compositionRefreshMessage}=require('../src/components/amphitheaterCompositionSources.ts');
const fixture={id:'fixture',name:'Fixture',source:[]};
const selected={id:'shape-change',name:'U depth +3%',source:[{letter:'U',scaleY:1.03}]};
test('empty refresh preserves the loaded study source and valid selection',()=>{
 const refreshed=mergeCompositionSources([fixture,selected],[],selected.id);
 assert.deepEqual(refreshed,[fixture,selected]);assert(refreshed.some(s=>s.id===selected.id));
});
test('refresh replaces current Composition data by ID without duplicates',()=>{
 const old={id:'session:a',name:'Old',source:[]},latest={...old,name:'Latest',source:[{letter:'L'}]};
 assert.deepEqual(mergeCompositionSources([fixture,old],[latest],old.id),[fixture,latest]);
});
test('refresh removes unavailable unselected live entries but keeps selected snapshot',()=>{
 const missing={id:'saved:old:a',name:'Old',source:[]};
 assert.deepEqual(mergeCompositionSources([fixture,selected,missing],[],selected.id),[fixture,selected]);
});
test('collector retains Composition source transforms and current/saved identities',()=>{
 const placement={cell:{letter:'L'},x:3,y:4,z:5,rx:15,ry:30,rz:45,scale:2,scaleX:1,scaleY:1.2,scaleZ:.8};
 const a={id:'a',placements:[placement]};
 const rows=collectCompositionSources({alternatives:[a]},[{id:'design',name:'Saved',alternatives:[a]}]);
 assert.deepEqual(rows.map(r=>r.id),['session:a','saved:design:a']);
 assert.deepEqual(rows[0].source[0],{letter:'L',x:3,y:4,z:5,rx:15,ry:30,rz:45,scale:2,scaleX:1,scaleY:1.2,scaleZ:.8});
 assert.equal(rows[0].snapshot,a);
});
test('refresh feedback explains empty state and generation remains a separate action',()=>{
 assert.match(compositionRefreshMessage(0),/selected study source is retained/);
 assert.match(compositionRefreshMessage(2),/Refreshed 2 Composition sources/);
 assert.match(compositionRefreshMessage(2),/Generate baseline study/);
});
