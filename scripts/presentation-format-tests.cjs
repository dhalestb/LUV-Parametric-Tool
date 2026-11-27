const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('./ts-test-register.cjs');
const {createCanvas}=require('@napi-rs/canvas');
const {SHARED_BOARD_RULES:s,PRESENTATION_EXPORT_WIDTHS,assertCanonicalBoardPNG}=require('../src/components/presentation/formatContract.ts');
const {assertLockedLine,lockedTextLines,assertLockedTextBottom,assertRuleContent}=require('../src/components/presentation/formatGuards.ts');
const {presentationExportDimensions}=require('../src/components/presentationExportSizing.ts');
const {adaptPresentationRecord}=require('../src/components/presentation/types.ts');
const {focusedRuleDetails}=require('../src/components/presentation/ruleIllustrations.ts');
const {verifyPresentationLock}=require('./presentation-format-lock.cjs');
const root=path.resolve(__dirname,'..');process.chdir(root);
async function main(){
 const integrity=verifyPresentationLock(root);assert.deepEqual([...PRESENTATION_EXPORT_WIDTHS],[2048,4096]);
 assert.deepEqual(presentationExportDimensions('board',4096),{width:4096,height:5156});assert.deepEqual(presentationExportDimensions('board',2048),{width:2048,height:2578});
 for(const bad of [0,-1,900,3000,4096.5,NaN])assert.throws(()=>presentationExportDimensions('board',bad),/approved PNG/);
 assert.equal(s.dpi,300);assert.equal(s.font,'Arial, sans-serif');assert.deepEqual(s.colors,{letters:'#D6AD4F',form:'#F7F6F5',rules:'#71BEDA'});assert.equal(s.background,'#000000');
 for(const value of [s,s.colors,s.layout,s.detail,s.camera,s.material,PRESENTATION_EXPORT_WIDTHS])assert(Object.isFrozen(value));assert.equal(Reflect.set(s.colors,'letters','#ff0000'),false);
 const ctx=createCanvas(1,1).getContext('2d'),width=s.width,col=(width-2*width*s.layout.margin-width*s.layout.columnGap)/2,top=width*s.layout.contentTop+col*s.layout.rowPitch,bottom=s.height-width*s.layout.margin;
 const catalog=JSON.parse(fs.readFileSync('data/presentation-review/v1/catalog.json')),finals=require('../data/lobby-final-studies/v1/MANIFEST.json').approved;
 const fixtures=catalog.map(e=>({name:e.name,type:e.typology,category:e.category,file:e.file?'data/presentation-review/v1/'+e.file:'data/lobby-final-studies/v1/'+finals.find(f=>f.studyNumber===e.lobbyNumber).folder+'/architecture.json'}));
 const spacing=JSON.parse(fs.readFileSync('reports/lobby-spacing-rules-2026-11-25/cases.json'));for(const r of spacing)fixtures.push({name:r.type==='continuous-hall-lobby'?'Continuous Hall Lobby':'Linear Gallery Lobby',type:r.type,category:'lobby',file:'data/lobby-generated/v1/'+r.id+'.json'});
 let editableExample;
 for(const f of fixtures){const bytes=fs.readFileSync(f.file),record=JSON.parse(bytes),before=JSON.stringify(record),study=adaptPresentationRecord(record,{category:f.category,typology:f.type,title:f.name});
  if(f.category!=='gathering'){
   const details=focusedRuleDetails(study);assertRuleContent(details);editableExample??=details;
   ctx.font=width*s.layout.titleSize+'px '+s.font;assertLockedLine(ctx,f.name.toUpperCase(),width*(1-2*s.layout.margin),'Board title');
   for(const [kind,rows]of [['orientation',[.10,.65]],['generation',[.10,.55,1.00]]])for(const [i,d]of details[kind].entries()){
    const rail=col*(1-s.detail.textLeft),y=top+col*rows[i],limit=Math.min(i+1<details[kind].length?top+col*rows[i+1]:Infinity,bottom);
    ctx.font=col*s.detail.headingSize+'px '+s.font;assertLockedLine(ctx,d.heading,rail,'Rule heading');let cursor=y+col*(s.detail.firstLine+.03);
    for(const bullet of d.bullets){ctx.font=col*s.detail.bodySize+'px '+s.font;const lines=lockedTextLines(ctx,'• '+bullet,rail);assertLockedTextBottom(ctx,lines,cursor,col*s.detail.lineSpacing,limit);cursor+=lines.length*col*s.detail.lineSpacing+col*.015;}
   }
  }
  assert.equal(JSON.stringify(record),before,'Rule rendering inputs were mutated');
 }
 const updated={...editableExample,orientation:editableExample.orientation.map(d=>({...d,heading:'UPDATED RULE',bullets:['A revised rule uses the same illustration frame.']}))};assertRuleContent(updated);
 assert.throws(()=>assertRuleContent({...updated,orientation:[...updated.orientation,...updated.orientation]}),/two orientation/);
 assert.throws(()=>assertRuleContent({...updated,orientation:[{...updated.orientation[0],layers:[{...updated.orientation[0].layers[0],color:'#ff0000'}]}]}),/color roles/);
 ctx.font='48px '+s.font;assert.throws(()=>assertLockedLine(ctx,'Very long heading '.repeat(30),100,'Heading'),/fixed presentation frame/);
 assert.throws(()=>lockedTextLines(ctx,'unbreakable'.repeat(100),100),/fixed text column/);assert.throws(()=>assertLockedTextBottom(ctx,['one','two'],100,80,110),/fixed presentation panel/);
 const pngPath='public/reports/lobby-spacing-rules-2026-11-25/boards/continuous-hall-lobby-4096px.png',png=fs.readFileSync(pngPath);await assertCanonicalBoardPNG(new Blob([png]));
 const wrongSize=Buffer.from(png);wrongSize.writeUInt32BE(3000,16);await assert.rejects(()=>assertCanonicalBoardPNG(new Blob([wrongSize])),/canonical/);
 const wrongDpi=Buffer.from(png);for(let at=8;at+12<=wrongDpi.length;){const n=wrongDpi.readUInt32BE(at);if(wrongDpi.toString('ascii',at+4,at+8)==='pHYs'){wrongDpi.writeUInt32BE(1,at+8);break;}at+=n+12;}await assert.rejects(()=>assertCanonicalBoardPNG(new Blob([wrongDpi])),/300 ppi/);
 assert.throws(()=>verifyPresentationLock(root,(file,encoding)=>file.endsWith(path.join('presentation','formatContract.ts'))?Buffer.concat([fs.readFileSync(file),Buffer.from('\n// simulated unauthorized change')]):fs.readFileSync(file,encoding)),/formatContract.ts/);
 console.log('PASS presentation contract: '+fixtures.length+' immutable rule fixtures, fixed fonts/palette/frames, approved export presets, 300 ppi, permitted rule edits, overflow rejection and simulated template tampering. '+JSON.stringify(integrity));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
