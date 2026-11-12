// Native source-normal extrusion coordinates; global Z and source caps are preserved.
// The source is transformed BEFORE construction. No existing architectural mesh is warped.
const T=require('three');
const {heightAt}=require('./source-vertical-envelope.cjs');
const pack=s=>{const m=s.getMesh();return {positions:Array.from(m.vertProperties),indices:Array.from(m.triVerts)};};
function faceNormalWall(w,node,triangles,field,support,clip,focus){
 const M=w.Manifold,CS=w.CrossSection,matrix=new T.Matrix4().fromArray(node.matrix);
 const n=new T.Vector3(0,0,1).applyMatrix3(new T.Matrix3().getNormalMatrix(matrix)).normalize();
 if(n.z<0)n.negate();
 if(n.z<1e-6)throw Error(node.id+': face normal is parallel to the horizontal support. Choose vertical mode or edit the source intentionally; no automatic rotation was applied.');
 const kx=n.x/n.z,ky=n.y/n.z;
 // S maps the desired extrusion direction to its local Z axis while retaining world Z.
 const worldToFlow=new T.Matrix4().set(1,0,-kx,kx*support,0,1,-ky,ky*support,0,0,1,0,0,0,0,1),flowToWorld=worldToFlow.clone().invert();
 const transform=(p,m)=>new T.Vector3(...p).applyMatrix4(m).toArray();
 const flowTriangles=triangles.map(t=>t.map(p=>transform(p,worldToFlow))).filter(t=>{
  const [a,b,c]=t.map(p=>new T.Vector3(...p));return b.sub(a).cross(c.sub(a)).z>1e-8;
 });
 const footprint=CS.union(flowTriangles.map(t=>new CS([t.map(p=>p.slice(0,2))],'NonZero')));
 const flowFocus=transform([focus[0],focus[1],node.matrix[14]],worldToFlow),segments=[],strips=[];
 for(const polygon of footprint.toPolygons()){
  const area=polygon.reduce((sum,a,i)=>{const b=polygon[(i+1)%polygon.length];return sum+a[0]*b[1]-b[0]*a[1];},0);if(area<=0)continue;
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.01)continue;
   const normal=[(b[1]-a[1])/length,(a[0]-b[0])/length],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   if(!polygon.every(p=>(p[0]-mid[0])*normal[0]+(p[1]-mid[1])*normal[1]<1e-5)||(mid[0]-flowFocus[0])*normal[0]+(mid[1]-flowFocus[1])*normal[1]<0)continue;
   strips.push(CS.hull([CS.circle(.85,32).translate(a),CS.circle(.85,32).translate(b)]));segments.push({a,b,normal});
  }
 }
 if(!strips.length)throw Error(node.id+': no exterior-facing source boundary in face-normal coordinates.');
 const plan=CS.union(strips).intersect(footprint);
 const ceiling=Math.max(...flowTriangles.flat().map(p=>p[2]));
 const roofPrisms=flowTriangles.map(t=>M.hull([...t,...t.map(p=>[p[0],p[1],support])]));
 const local=M.union(roofPrisms).intersect(plan.extrude(field.height-support).translate([0,0,support]));
 const supported=local.transform(flowToWorld.elements),wall=supported.intersect(clip);
 if(wall.isEmpty())throw Error(node.id+': face-normal façade was entirely clipped by the selected field.');
 const probe=segments.map(s=>{
  const xy=[(s.a[0]+s.b[0])/2-s.normal[0]*.15,(s.a[1]+s.b[1])/2-s.normal[1]*.15],height=heightAt(flowTriangles,...xy);
  if(!Number.isFinite(height.height))return null;
  const roof=transform([...xy,height.height],flowToWorld),bottom=transform([...xy,support],flowToWorld);
  return {roof,support:bottom,planShift:Math.hypot(bottom[0]-roof[0],bottom[1]-roof[1]),supportInsideField:Math.abs(bottom[0])<=field.width/2&&Math.abs(bottom[1])<=field.depth/2,surfaces:height.surfaces};
 }).filter(Boolean);
 const minRoof=Math.min(...flowTriangles.flat().map(p=>p[2])),za=support+(minRoof-support)*.25,zb=support+(minRoof-support)*.60;
 return {wall,report:{mode:'face-normal',normal:n.toArray(),sweepDirection:n.clone().negate().toArray(),supportZ:support,sourceMatrix:node.matrix,worldToFlow:worldToFlow.toArray(),flowToWorld:flowToWorld.toArray(),flowSegments:segments,sourceCapTriangles:flowTriangles.map(t=>t.map(p=>transform(p,flowToWorld))),roofPatchCount:flowTriangles.length,unclippedVolume:supported.volume(),fieldTrimVolume:supported.subtract(clip).volume(),maximumPlanShift:(supported.boundingBox().max[2]-support)*Math.hypot(kx,ky),trace:probe,ceiling,translationCheck:{lowerZ:za,upperZ:zb,untrimmedLowerPolygons:supported.slice(za).toPolygons(),expectedShift:[(zb-za)*kx,(zb-za)*ky]},mesh:pack(wall)}};
}
module.exports={faceNormalWall};
