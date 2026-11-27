'use strict';
// Review-only source-arrangement facing context; no production policy changes.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),Module=require('module');
const R=path.resolve(__dirname,'../..'),V=R+'/vendor/typology-proof-20261121';
require(V+'/proof/rule-amphitheater.cjs');
const T=require('three'),native=require(V+'/scripts/source-envelope.cjs'),poly=require(R+'/scripts/plate-polygon-responsive.cjs'),glyph=require(V+'/src/components/letterGeometry3d.ts');
const VERSION='inserted-horizontal-plate/source-arrangement-facing-v1';
function perimeter(request){return native.derive(request).nodes.filter(n=>!(n.p.letter==='L'&&Math.abs(new T.Vector3(0,0,1).transformDirection(new T.Matrix4().fromArray(n.matrix)).z)>.999999));}
function contexts(nodes){
 const result={};
 for(const n of nodes){const peers=nodes.filter(p=>p.p.levelIndex===n.p.levelIndex);assert.equal(peers.length,3,'Review supports existing three perimeter sources per level only');
 const center=[0,1].map(k=>peers.reduce((s,p)=>s+(k?p.p.y:p.p.x),0)/peers.length),delta=[n.p.x-center[0],n.p.y-center[1]],len=Math.hypot(...delta);assert(len>1e-6);
 const normal=delta.map(x=>x/len),origin=[n.p.x,n.p.y];
 result[n.id]={id:n.id+'-source-arrangement',center,normal,origin,peers:peers.map(p=>p.id),gap:q=>normal[0]*(origin[0]-q.x)+normal[1]*(origin[1]-q.y)};
 }return result;
}
function audit(request,report){
 const ns=perimeter(request),ctx=contexts(ns),rows=[];
 for(const n of ns){
  const shape=glyph.getLetterShape(n.p.letter),matrix=new T.Matrix4().fromArray(n.matrix),normalMatrix=new T.Matrix3().getNormalMatrix(matrix),center=new T.Box2().setFromPoints(shape.getPoints(16)).getCenter(new T.Vector2()),world=q=>new T.Vector3(q.x-center.x,q.y-center.y,0).applyMatrix4(matrix);
  const points=shape.getPoints(64),winding=Math.sign(points.reduce((s,a,i)=>{const b=points[(i+1)%points.length];return s+a.x*b.y-b.x*a.y},0));
  const finalV=report?.seams.find(s=>s.source===n.id&&Number.isInteger(s.outerContour))?.outerContour;
  const edges=(n.p.letter==='L'?[5]:n.p.letter==='U'?[1,2]:[4,6]).map(index=>{
   const curve=shape.curves[index],t=curve.getTangent(.5),normal=new T.Vector3(t.y,-t.x,0).multiplyScalar(winding).applyMatrix3(normalMatrix).normalize(),plan=new T.Vector2(normal.x,normal.y).normalize(),outwardDot=plan.x*ctx[n.id].normal[0]+plan.y*ctx[n.id].normal[1];
   return {index,point:world(curve.getPoint(.5)).toArray(),path:Array.from({length:17},(_,i)=>world(curve.getPoint(i/16)).toArray()),normal:normal.toArray(),planNormal:plan.toArray(),outwardDot,selected:n.p.letter!=='V'||index===finalV};
  });
  const chosen=n.p.letter==='V'?(finalV??edges.slice().sort((a,b)=>b.outwardDot-a.outwardDot)[0].index):null;
  if(n.p.letter==='V')edges.forEach(e=>e.selected=e.index===chosen);
  const faceNormal=new T.Vector3(0,0,1).transformDirection(matrix).toArray();
  rows.push({id:n.id,level:n.p.levelIndex,letter:n.p.letter,role:'perimeter wall source (native B excludes only the horizontal pier L)',originalRoleLabel:n.p.architecturalRole,pose:n.p,center:[n.p.x,n.p.y,n.p.z+request.field.height/2],interiorReference:ctx[n.id].center,contextNormal:ctx[n.id].normal,edges,faceNormal,sweep:'both positive and negative source-face normal; original native operation',faceLeanDegrees:n.p.letter==='U'?90-n.p.ry:90-n.p.rx,selectedVContour:chosen,selectionFinal:!!report,allSelectedExterior:edges.filter(e=>e.selected).every(e=>e.outwardDot>1e-6)});
 }return rows;
}
function correct(request,report){const req=structuredClone(request),before=audit(request,report),changes=[];
 for(const row of before){if(row.allSelectedExterior)continue;assert(row.letter==='L','Non-L ambiguity requires separate review');const i=Number(row.id.split('-').at(-1))-1;req.source[i].rz+=180;changes.push({id:row.id,parameter:'rz',before:request.source[i].rz,after:req.source[i].rz,deltaDegrees:180,positionsUnchanged:true,faceLeanUnchanged:true});}
 return {request:req,changes,before,after:audit(req)};
}
function load(polygon,request){
 const configured=poly.loadContextEngine(polygon),file=V+'/scripts/source-edge-envelope.cjs';let body=configured.engine.edgeEnvelope.toString();
 for(const [from,to]of [
  ['const faces=polygonContext.faces;','const faces=[arrangementContext[n.id]];'],
  ['const face=polygonContext.nearest(position);','const face=arrangementContext[n.id];'],
  ["p.edge+' facing polygon edge '+p.face.id","p.edge+' facing source-arrangement context '+p.face.id"]
 ]){assert.equal(body.split(from).length,2,'Context replacement unique');body=body.replace(from,to);}
 // Capture evidence on native failure only; preserve every native exception and operation.
 body=body.replace("if(!floor)throw Error('No inward receiving edge for '+n.id);","if(!floor){globalThis.__exteriorReviewCapture?.({solids,perimeters,floors,failedSource:n.id,stage:'native initial inner-edge receiver'});throw Error('No inward receiving edge for '+n.id);}");
 const prelude="const T=require('three'),{getLetterShape}=require('../src/components/letterGeometry3d.ts');\nconst polygonContext=require("+JSON.stringify(R+'/scripts/plate-polygon-responsive.cjs')+").exteriorContext("+JSON.stringify(polygon)+");\nconst arrangementContext=require("+JSON.stringify(__filename)+").contexts(require("+JSON.stringify(__filename)+").perimeter("+JSON.stringify(request)+"));\n";
 const moduleInstance=new Module(file,module);moduleInstance.filename=file;moduleInstance.paths=Module._nodeModulePaths(path.dirname(file));moduleInstance._compile(prelude+'module.exports.edgeEnvelope='+body+';',file);
 return{engine:moduleInstance.exports,provenance:{version:VERSION,priorContext:configured.provenance,scope:'Only outward-facing context changes. Existing source-edge sweeps, inner-edge receivers, trims, joins, plate fitting and full corner pier remain unchanged.'}};
}
async function withContext(polygon,request,run){const module=require(V+'/scripts/source-edge-envelope.cjs'),old=module.edgeEnvelope,compiled=load(polygon,request);try{module.edgeEnvelope=compiled.engine.edgeEnvelope;return await run(compiled.provenance);}finally{module.edgeEnvelope=old;}}
module.exports={VERSION,perimeter,contexts,audit,correct,load,withContext};

