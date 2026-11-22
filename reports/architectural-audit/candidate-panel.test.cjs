require('../../scripts/ts-test-register.cjs');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.tsx']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}
}).outputText,file);
const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const Panel=require('../../src/components/evaluations/GatheringCandidatePanel.tsx').default;
const {verifiedResult}=require('../../src/components/evaluations/v4/verifiedCentralizedResult.ts');
const {VERIFIED_CENTRALIZED_VERSION,VERIFICATION_VERSION}=require('../../src/components/evaluations/v4/spatialVerification.ts');
const r={id:70,area:197.25,levelFeet:38.46,usableTotal:197.25,usablePatch:[0,0,38.46,1,0,38.46,0,1,38.46],role:'candidate',boundaryCells:[[0,0,38.46]],sampleIds:[1],width:null,clearHeight:7,openSky:false,note:''};
const review={filename:'example.obj',version:VERIFICATION_VERSION,method:VERIFIED_CENTRALIZED_VERSION,sourceId:'test',unit:'feet',up:'z',geometryHash:'test',coverageConfirmed:false,updatedAt:'',regions:[r],connections:[]};
function display(result){return renderToStaticMarkup(React.createElement(Panel,{models:[{id:'G2',name:review.filename,result}]}));}
test('pending building score retains the candidate footprint, level share and measured area points',()=>{
    const result=verifiedResult(review,{});
    assert.equal(result.available,false);
    assert.ok(Number.isNaN(result.absoluteScore));
    const html=display(result);
    for(const text of ['Gathering candidates','example.obj','38.46 ft','N/A · pending review','R70','197.25 ft²','100.0%','49.65/100','<svg','<path'])assert.ok(html.includes(text),text);
});
test('a measured empty floor has an explicit empty state',()=>{
    const result=verifiedResult({...review,regions:[{...r,role:'excluded'}]},{});
    assert.ok(display(result).includes('No gathering candidates on this floor.'));
});

const Comparison = require('../../src/components/evaluations/DescriptorComparison.tsx').default;
const { gatheringComparison } = require('../../src/components/evaluations/gatheringComparison.ts');
function row(id, area, absoluteScore = NaN) {
    const result = verifiedResult(review, {});
    const patch = [0,0,10, 1,0,10, 0,1,10];
    result.floorResults = [{ level:10, score:null, secondary:[], status:'Pending', candidates:[
        {region:20, area, percent:50, levelUsableArea:2*area, patch}
    ] }];
    result.absoluteScore = absoluteScore;
    const mesh = {id, filename:id+'.obj', positions:new Float32Array(patch), upAxis:'z', faces:[{vertices:[0,1,2], normals:null}], groups:[], normals:new Float32Array()};
    return {slotId:id, code:id, name:id, mesh, result:{status:'ready', descriptors:[result]}};
}
function cards(rows) {
    return renderToStaticMarkup(React.createElement(Comparison,{rows, descriptorId:'centralized', onDescriptor:()=>{}, unit:'feet', upAxisMode:'auto'}));
}
test('pending models render two comparison cards with measured area points and distinct building status',()=>{
    const rows=[row('Large',200),row('Small',100)];
    const html=cards(rows);
    const left=html.indexOf('data-analysis-panel="least"'),right=html.indexOf('data-analysis-panel="most"');
    assert.ok(left>=0 && right>left);
    assert.ok(html.indexOf('Explore gathering candidates by floor')>right);
    for(const [card,model,points,rank] of [[html.slice(left,right),'Small.obj','33.3','1 of 2'],[html.slice(right),'Large.obj','50.0','2 of 2']]){
        for (const text of [model,points,rank,'Provisional gathering area score','Provisional area rank','Overall Centralized score pending review','Floor 10 ft · R20','Legend · drawn layers']) assert.ok(card.includes(text),text);
    }
    for (const item of rows) assert.ok(Number.isNaN(item.result.descriptors[0].absoluteScore));
});
test('a completed building uses the overall score and keeps pending candidates in the floor explorer',()=>{
    const html=cards([row('Pending',400),row('Scored',100,60)]);
    const start=html.indexOf('data-analysis-panel="least"'),end=html.indexOf('data-analysis-panel="most"');
    assert.ok(html.slice(start,end).includes('Scored.obj'));
    assert.ok(html.slice(start,end).includes('60.0'));
    assert.ok(!html.slice(start,end).includes('Overall Centralized score pending review'));
    assert.ok(html.includes('Pending.obj'));
    assert.ok(html.includes('Compare Centralized results'));
});
test('ties use floor then region ID, retain exact recorded triangles and never create missing geometry',()=>{
    const d=row('A',200).result.descriptors[0], f=d.floorResults[0];
    d.floorResults.push({...f,level:0,candidates:[{...f.candidates[0],region:21},{...f.candidates[0],region:5,patch:undefined}]});
    const best=gatheringComparison(d, 'A');
    assert.equal(best.level,0);
    assert.equal(best.candidate.region,5);
    assert.equal(best.layers.length,1);
    assert.equal(best.layers[0].label,'Floor 10 ft · R20 · 200.00 ft²');
    assert.deepEqual(Array.from(best.layers[0].triangles),f.candidates[0].patch);
    d.floorResults.pop();
    assert.deepEqual(Array.from(gatheringComparison(d, 'A').layers[0].triangles),f.candidates[0].patch);
    assert.equal(gatheringComparison({...d,version:'centralized-graph-v1.0.0'}, 'A'),null);
});

test('3D comparison draws one measured winner per floor and keeps the model rank based on its largest area',()=>{
    const measured=row('Floors',200), d=measured.result.descriptors[0], f=d.floorResults[0], c=f.candidates[0];
    const patch=[0,0,20, 2,0,20, 0,2,20];
    d.floorResults.push({...f,level:20,candidates:[{...c,region:22,area:50,patch},{...c,region:21,area:80,patch}]},
        {...f,level:30,candidates:[]});
    f.candidates.push({...c,area:300,region:2,patch:undefined},{...c,area:Infinity,region:99});
    const {presentLayers}=require('../../src/components/evaluations/presentEvidence.ts');
    const result=gatheringComparison(d,'Floors');
    assert.equal(result.areaScore,60);
    assert.deepEqual(result.layers.map(l=>l.label),['Floor 20 ft · R21 · 80.00 ft²']);
    assert.deepEqual(Array.from(result.layers[0].triangles),patch);
    f.candidates.pop(); f.candidates.pop();
    const layers=presentLayers(gatheringComparison(d,'Floors').layers,'centralized');
    assert.deepEqual(layers.map(l=>l.label),['Floor 10 ft · R20 · 200.00 ft²','Floor 20 ft · R21 · 80.00 ft²']);
    assert.ok(layers.every(l=>l.color==='#D6AD4F'));
    const html=cards([measured,row('Other',400)]);
    const left=html.slice(html.indexOf('data-analysis-panel="least"'),html.indexOf('data-analysis-panel="most"'));
    for(const label of layers.map(l=>l.label))assert.ok(left.includes(label));
    assert.ok(left.includes('>50.0<'));
});

test('area scale runs from zero toward 100 while the weighted contribution runs toward 40',()=>{
    const {gatheringAreaScore,gatheringAreaPoints}=require('../../src/components/evaluations/v4/gatheringMetrics.ts');
    for(const [area,score,weighted] of [[0,0,0],[200,50,20],[600,75,30],[1800,90,36]]){
        assert.equal(gatheringAreaScore(area),score);
        assert.equal(gatheringAreaPoints(area),weighted);
    }
    assert.ok(gatheringAreaScore(100000)>99 && gatheringAreaScore(100000)<100);
});

test('Centralized display ranks share ties, keep pending models ranked separately from completed building scores',()=>{
    const {gatheringScoreRanks}=require('../../src/components/evaluations/gatheringComparison.ts');
    const entries=[row('A',200),row('B',200),row('C',600),row('Empty',0)].map(r=>({id:r.code,result:r.result.descriptors[0]}));
    const ranks=gatheringScoreRanks(entries);
    assert.equal(ranks.size,3);
    assert.deepEqual(ranks.get('A'),{absoluteScore:50,comparativeRank:1,cohortSize:3});
    assert.deepEqual(ranks.get('A'),ranks.get('B'));
    assert.equal(ranks.get('C').comparativeRank,3);
    assert.ok(Number.isNaN(entries[0].result.absoluteScore));
    entries[0].result.absoluteScore=64;
    const mixed = gatheringScoreRanks(entries);
    assert.equal(mixed.size,2);
    assert.equal(mixed.has('A'),false);
    assert.deepEqual(mixed.get('B'),{absoluteScore:50,comparativeRank:1,cohortSize:2});
    assert.deepEqual(mixed.get('C'),{absoluteScore:75,comparativeRank:2,cohortSize:2});
});

test('completed comparison shows the reviewed destination even when a larger candidate exists',()=>{
    const completed=row('Reviewed',600,72);
    const descriptor=completed.result.descriptors[0];
    const floor=descriptor.floorResults[0];
    floor.score=72; floor.primary=7;
    const primary={...floor.candidates[0],region:7,area:90};
    floor.candidates.push(primary);
    const {patchLayer,PALETTE}=require('../../src/components/evaluations/v4/evidence.ts');
    descriptor.evidence={layers:[patchLayer({id:'ce-gathering',label:'Confirmed gathering destination',color:PALETTE.gold,status:'verified',components:[]},[primary.patch])],measurements:{},components:[],notes:[]};
    const html=cards([completed]);
    assert.ok(html.includes('Confirmed gathering destination'));
    assert.ok(!html.includes('Floor 10 ft · R20 · 600.00 ft²'));
    assert.ok(html.includes('R7'));
});
test('a failed OBJ leaves successes on both sides available for ranking',async()=>{
    const {evaluateBatch}=require('../../src/components/evaluations/evaluationBatch.ts');
    const results=await evaluateBatch(['first','broken','last'],async id=>{
        if(id==='broken')throw new Error('invalid mesh');
        return id;
    });
    assert.deepEqual(results,[{source:'first',ok:true,value:'first'},{source:'broken',ok:false,error:'invalid mesh'},{source:'last',ok:true,value:'last'}]);
});
