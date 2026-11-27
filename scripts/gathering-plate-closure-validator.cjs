const path=require('node:path'),Module=require('node:module');
const REVISION='study135-terminal-closure-v2';
function validateClosedTerminalCorners(w,data,nodes){
 const report=data.boundaryReport,byId=new Map(nodes.map(n=>[n.id,n])),walls=data.bands.filter(b=>b.id.startsWith('boundary-')),solid=id=>walls.find(b=>b.owner===id)?.solid;
 const levels=[...new Set(nodes.filter(n=>n.id!==report.pier?.source).map(n=>n.p.levelIndex))].sort((a,b)=>a-b),checks=[];
 for(const level of [...new Set([levels[0],levels.at(-1)])]){
  const group=nodes.filter(n=>n.id!==report.pier?.source&&n.p.levelIndex===level),us=group.filter(n=>n.p.letter==='U'),ls=group.filter(n=>n.p.letter==='L'),vs=group.filter(n=>n.p.letter==='V');
  if(group.length!==3||us.length!==1||ls.length!==1||vs.length!==1)throw Error('No clear plate landing: terminal level '+(level+1)+' does not have the approved L/U/V perimeter.');
  const [u,l,v]=[us[0],ls[0],vs[0]],joints=[];
  // The U/V near flank is intentionally replaced by the native far-flank
  // continuation. Its final contacts are checked below, not on the old plane.
  for(const receiver of [l]){
   const seam=report.seams.find(s=>s.source===u.id&&s.receiver===receiver.id&&s.face&&s.offset!==undefined&&s.uncovered!==undefined);
   if(!seam||seam.uncovered>1e-4)throw Error('No clear plate landing: open terminal U-to-'+receiver.p.letter+' corner at level '+(level+1)+'.');
   const n=seam.face,az=Math.atan2(n[1],n[0])*180/Math.PI,tilt=Math.acos(Math.max(-1,Math.min(1,n[2])))*180/Math.PI;
   const section=id=>solid(id).rotate([0,0,-az]).rotate([0,-tilt,0]).slice(seam.offset-.001);
   const panel=section(u.id),bearing=section(receiver.id),area=panel.area(),uncovered=panel.subtract(bearing).area();
   if(area<.1||uncovered>1e-4)throw Error('No clear plate landing: incomplete final terminal corner '+u.id+' / '+receiver.id+' ('+uncovered+' sq ft).');
   joints.push({source:u.id,receiver:receiver.id,sectionArea:area,uncovered});
  }
  const direct=report.seams.find(s=>s.source===v.id&&s.kind==='direct B-to-A perimeter joint'&&[s.receiver,s.otherReceiver].includes(l.id)&&[s.receiver,s.otherReceiver].includes(u.id));
  if(!direct)throw Error('No clear plate landing: missing final V continuation at level '+(level+1)+'.');
  for(const receiver of [l,u]){const contact=solid(v.id).intersect(solid(receiver.id)),box=contact.boundingBox(),sections=Array.from({length:19},(_,i)=>contact.slice(box.min[2]+(box.max[2]-box.min[2])*(i+1)/20).area());
   if(contact.volume()<=.1||sections.some(a=>a<=1e-6))throw Error('No clear plate landing: open final '+receiver.p.letter+'-to-V terminal corner at level '+(level+1)+'.');
   joints.push({source:v.id,receiver:receiver.id,volume:contact.volume(),sectionAreas:sections});}
  checks.push({level,closed:true,joints});
 }
 report.terminalClosure={revision:REVISION,passed:true,levels:checks};return report.terminalClosure;
}
module.exports={REVISION,validateClosedTerminalCorners};
if(process.env.LUV_GATHERING_PLATE_CLOSURE_V2==='1'){
 const target=path.resolve(__dirname,'../vendor/gathering-preserved/scripts/source-edge-envelope.cjs').toLowerCase(),load=Module._load,wrapped=new WeakSet();
 Module._load=function(id,parent,...rest){const value=load.call(this,id,parent,...rest);let resolved;try{resolved=Module._resolveFilename(id,parent);}catch{return value;}
  if(typeof resolved==='string'&&resolved.toLowerCase()===target&&!wrapped.has(value)){const original=value.edgeEnvelope;value.edgeEnvelope=function(w,nodes,...args){const data=original(w,nodes,...args);validateClosedTerminalCorners(w,data,nodes);return data;};wrapped.add(value);}return value;
 };
}
