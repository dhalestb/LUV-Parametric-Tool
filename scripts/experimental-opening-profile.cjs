// Profiles reuse the original glyph curves, in their existing order and orientation.
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');
const {featurePoints}=require('./source-profile-envelope.cjs');
function localOpening(w,node,field,plateZ,bearing){
 if(Math.abs(node.p.rx-90)<1e-8&&Math.abs(node.p.ry)<1e-8&&node.p.rotationOrder==='ZYX'){
  return require('./upright-opening-profile.cjs').uprightOpening(w,node,field,bearing);
 }
 const p=node.p,source=node.id,shape=getLetterShape(p.letter);
 const range={L:[2,4],U:[5,9],V:[1,3]}[p.letter];
 const curves=shape.curves.slice(...range);
 const pts=featurePoints({curves},p.scale*Math.max(p.scaleX,p.scaleY));
 const center=shape.getPoints(16);
 const cx=(Math.min(...center.map(q=>q.x))+Math.max(...center.map(q=>q.x)))/2;
 const section=pts.map(q=>[(q.x-cx)*p.scale*p.scaleX,q.y*p.scale*p.scaleY]);
 if(p.letter==='L')section.push([section[0][0],section.at(-1)[1]]);
 const ymin=Math.min(...section.map(q=>q[1])),ymax=Math.max(...section.map(q=>q[1]));
 const height=Math.min((ymax-ymin)*.65,plateZ-.8);
 if(height<.6)throw Error(source+': insufficient height beneath terrace for opening.');
 const floor=plateZ-height;
 const points=section.map(([x,y])=>[x,floor+(ymax-y)/(ymax-ymin)*height]);
 const cs=new w.CrossSection([points],'NonZero');
 if(cs.isEmpty())throw Error(source+': empty source opening.');
 const xmin=Math.min(...points.map(q=>q[0])),xmax=Math.max(...points.map(q=>q[0]));
 const mid=(xmin+xmax)/2, z=floor+height*.35;
 const yaw=p.rz*Math.PI/180,axis=[Math.sin(yaw),-Math.cos(yaw),0],side=[Math.cos(yaw),Math.sin(yaw),0];
 const point=(x,d,z)=>[p.x+side[0]*x+axis[0]*d,p.y+side[1]*x+axis[1]*d,z];
 let sign=1;
 const sweep=(profile,start,end)=>profile.extrude(end-start).translate([0,0,sign===1?start:-end]).rotate([90,0,p.rz]).translate([p.x,p.y,0]);
 const depth=p.alcoveDepth??Math.min(p.scale*.42,field.depth*.2);
 const alcove=p.voidKind==='alcove';
 if(alcove&&(!Number.isFinite(depth)||depth<=0||depth>Math.hypot(field.width,field.depth)))throw Error(source+': alcove depth does not fit field.');
 const reach=Math.hypot(field.width,field.depth)*1.2;
 let mouth=-depth*.45;
 if(alcove){
  // Find the entrance on the actual outer bank along this source corridor.
  const contact=bearing.intersect(sweep(cs,-reach,reach));
  if(!contact.isEmpty()){
   const mesh=contact.getMesh(),d=[];
   for(let i=0;i<mesh.vertProperties.length;i+=3)d.push((mesh.vertProperties[i]-p.x)*axis[0]+(mesh.vertProperties[i+1]-p.y)*axis[1]);
   const first=Math.min(...d),last=Math.max(...d);
   if(Math.abs(last)<Math.abs(first)){sign=-1;axis[0]*=-1;axis[1]*=-1;mouth=-last-.06;}
   else mouth=first-.06;
  }
 }
 const back=mouth+depth;
 const end=alcove?back:reach;
 const solid=sweep(cs,alcove?mouth-.04:-reach,end);
 // Test the entire source-shaped corridor up to the mouth, including the cutter seam.
 const approach=alcove?sweep(cs,-reach,mouth):null;
 const wall=Math.min(.8,height*.2);
 // This local bay has an open entrance at the mouth and a solid backing at the far end.
 // Project its floor down to its bearing, and keep the soffit level with the source terrace.
 const outline=new w.CrossSection([[[xmin-wall,0],[xmax+wall,0],[xmax+wall,plateZ+.42],[xmin-wall,plateZ+.42]]]);
 const host=alcove?sweep(outline,mouth,back+wall):null;
 const probe={start:point(mid,-reach,z),end:point(mid,alcove?back-.04:reach,z)};
 const checks=alcove?{back:point(mid,back+wall*.5,z),roof:point(mid,mouth+depth*.5,plateZ+.18)}:null;
 const backing=alcove?sweep(cs,back+wall*.2,back+wall*.7):null;
 const roofSection=new w.CrossSection([[[xmin,.10+plateZ],[xmax,.10+plateZ],[xmax,.30+plateZ],[xmin,.30+plateZ]]]);
 const soffit=alcove?sweep(roofSection,mouth+depth*.1,back-depth*.1):null;
 return {host,tool:{approach,backing,soffit,id:'directional-'+source,source,solid,cuttingSolid:solid.minkowskiSum(w.Manifold.cube([.00004,.00004,.00004],true)),...probe,checks,alcove,width:xmax-xmin,height,depth:alcove?depth:2*reach},report:{source,axis,yaw:p.rz,profile:p.letter+' inner contour',section:points,probe,alcove,depth:alcove?depth:undefined,checks}};
}
module.exports={localOpening};
