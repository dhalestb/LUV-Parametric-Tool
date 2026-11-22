require('../scripts/ts-test-register.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parseObj}=require('../src/components/lattice/parseObj.ts');
const {buildV4Context,evaluateV4}=require('../src/components/evaluations/v4/evaluateV4.ts');
const refs=require('./centralized-phase2/model-evidence.json');
if(!process.argv[2])throw new Error('Provide original OBJ directory.');
const results=refs.map(ref=>{const raw=fs.readFileSync(path.join(process.argv[2],ref.filename));const m=parseObj(raw.toString('utf8'),ref.filename);const source={positions:m.positions,faces:m.faces,up:'z',unitScale:1};const ctx=buildV4Context(source,ref.result.sourceId);const r=evaluateV4(source,ref.result.sourceId);if(r.sourceHash!==ref.result.sourceHash)throw new Error('Source identity differs');return {filename:ref.filename,sha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceHash:r.sourceHash,bounds:r.summary.bounds,descriptors:r.descriptors.filter(d=>['openVolume','visuallyConnected','circulationActivated','verticallyIntegrated','centralized'].includes(d.id)).map(d=>({id:d.id,score:d.absoluteScore,available:d.available,reason:d.unavailableReason})),clearanceHistogram:ctx.field.samples.filter(s=>s.clearance!==null&&!s.roofLid).reduce((out,s)=>{const band=Math.round(s.clearance*2)/2;out[band]=(out[band]||0)+s.area;return out;},{})};});
fs.writeFileSync(path.join(__dirname,'completion-model-baseline.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({filename,descriptors})=>({filename,descriptors})),null,2));
