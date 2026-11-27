const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),T=require('three');
require('../proof/rule-amphitheater.cjs');const {heightAt}=require('./source-vertical-envelope.cjs'),{derive}=require('./source-envelope.cjs');
const scale=13/.92,folder='reports/vertical-envelope';fs.mkdirSync(folder,{recursive:true});
const placement=(letter,x,y,z,rx,ry,rz,architecturalRole)=>({letter,x,y,z,rx,ry,rz,scale,scaleX:1,scaleY:1,scaleZ:1,architecturalRole,supportZ:0});
const rows=[];
for(const [i,yaw] of [75,90,105].entries()){
 const source=[placement(['L','U','L'][i],-8,-6,0,15,6,0,'perimeter'),placement(['V','L','V'][i],8,1,7,-12,8,15,'perimeter'),placement('U',0,0,-9,0,0,yaw,'interior')];
 const request={generator:'source-preserving',envelopeVersion:'vertical-walls',field:{width:40,depth:40,height:60},preferredFeet:13,population:'auto',sourceId:'vertical-wall-verification-'+yaw,sourceName:'Inclined source walls and interior U at '+yaw+' degrees',source,articulation:.75};
 const id='11111111-1111-4111-8111-111111111'+String(yaw).padStart(3,'0'),out=path.resolve('.amphitheater-runs',id);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'request.json'),JSON.stringify(request));
 const start=performance.now();
 try{
  cp.execFileSync(process.execPath,['scripts/amphitheater-interactive-worker.cjs',path.join(out,'request.json'),out],{stdio:'pipe',maxBuffer:4e6});
  const result=JSON.parse(fs.readFileSync(path.join(out,'result.json')));
  assert.deepEqual(result.request.source,source);assert.deepEqual(result.letters,derive({...request,envelopeVersion:'profiles'}).letters);
  const wallRows=[];
  for(const wall of result.boundaryReport.walls){let vertical=0,roof=0,bottom=0,error=0,minZ=Infinity,maxZ=-Infinity;
   const m=wall.mesh;for(let j=0;j<m.indices.length;j+=3){const tri=[0,1,2].map(k=>new T.Vector3().fromArray(m.positions,m.indices[j+k]*3));const normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));if(normal.length()<1e-12)continue;normal.normalize();
    const xyLength=Math.max(...tri.map((p,k)=>Math.hypot(p.x-tri[(k+1)%3].x,p.y-tri[(k+1)%3].y)));const xyAltitude=Math.abs(tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).z)/(xyLength||1);if(xyAltitude<1e-5){vertical++;continue;}
    if(normal.z<0){bottom++;assert(Math.abs(normal.x)<1e-6&&Math.abs(normal.y)<1e-6);assert(tri.every(p=>Math.abs(p.z-wall.supportZ)<1e-5));continue;}
    roof++;for(const p of tri){const distance=Math.min(...wall.upperTriangles.map(t=>new T.Triangle(...t.map(q=>new T.Vector3(...q))).closestPointToPoint(p,new T.Vector3()).distanceTo(p)));error=Math.max(error,distance);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
   }
   assert(vertical>0&&roof>0&&bottom>0);assert(error<1e-4);assert(maxZ-minZ>.5);wallRows.push({source:wall.source,verticalFaces:vertical,roofFaces:roof,bottomFaces:bottom,maximumRoofErrorFeet:error,roofRange:[minZ,maxZ],supportZ:wall.supportZ});
  }
  assert.equal(result.validation.selfIntersectionPairs,0);assert.equal(result.articulationReport.components,1);assert(result.contributions.every(c=>c.exposedArea>=1));
  const floors=source.map((p,index)=>{
   const z=Math.min(...result.letters[index].mesh.positions.filter((_,k)=>k%3===2));let area=0;const m=result.architecture;
   for(let j=0;j<m.indices.length;j+=3){const t=[0,1,2].map(k=>new T.Vector3().fromArray(m.positions,m.indices[j+k]*3));if(t.every(v=>Math.abs(v.z-z)<1e-4)){const n=t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0]));if(n.z>0)area+=n.length()/2;}}
   assert(area>.1,'Horizontal source floor lost: '+index);return {source:result.letters[index].id,elevation:z,horizontalExposedArea:area};
  });
  const row={floors,id,yaw,passed:true,milliseconds:performance.now()-start,triangles:result.architecture.indices.length/3,volume:result.volume,validation:result.validation,walls:wallRows,voids:result.boundaryReport.voids,ambiguities:result.boundaryReport.ambiguities};rows.push(row);
  fs.writeFileSync(folder+'/result-'+yaw+'.json',JSON.stringify(result));fs.copyFileSync(path.join(out,'validation.json'),folder+'/validation-'+yaw+'.json');console.log('PASS '+yaw+' '+id);
 }catch(e){rows.push({yaw,passed:false,error:(e.stderr?.toString()||e.stack||String(e)).slice(-3500)});console.error('FAIL '+yaw,rows.at(-1).error);}
}
fs.writeFileSync(folder+'/geometry-tests.json',JSON.stringify(rows,null,2));if(rows.some(r=>!r.passed))process.exitCode=1;
