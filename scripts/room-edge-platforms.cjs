const THREE = require('three');
const { getLetterShape } = require('../src/components/letterGeometry3d.ts');

// Project the tilted glyph edges onto the horizontal plane of the finished floor.
function contours(node) {
  const shape = getLetterShape(node.p.letter);
  const center = new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
  const matrix = new THREE.Matrix4().fromArray(node.matrix);
  function sample(index,t) {
    const q=shape.curves[index].getPoint(t).sub(center);
    const p=new THREE.Vector3(q.x,q.y,0).applyMatrix4(matrix);
    return [p.x,p.y];
  }
  if(node.p.letter==='U'){
    // Middle of the bowl, with corresponding points on its inner and outer arcs.
    const edge=(a,b,t)=> t<.5 ? sample(a,t*2) : sample(b,t*2-1);
    const t=Array.from({length:17},(_,i)=>.25+i/32);
    return {outer:t.map(v=>edge(1,2,v)), inner:t.map(v=>edge(6,7,1-v))};
  }
  // Pair the cell-facing long stroke with the parallel inside edge of that stroke.
  const radius=i=>Math.hypot(...sample(i,.5));
  const [outside,inside]=radius(0)>radius(5)?[0,2]:[5,3];
  const inner=[sample(inside,.18),sample(inside,.82)];
  const a=sample(outside,0), b=sample(outside,1);
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const outer=inner.map(p=>{
    const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy);
    return [a[0]+t*dx,a[1]+t*dy];
  });
  return {outer,inner};
}

module.exports=function platforms(w,nodes,panels,shell,floor,thickness){
  const solids=[], measurements=[];
  const z=floor+thickness/2;
  const section=shell.slice(z);
  const bounds=section.bounds();
  const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2);
  for(const node of nodes){
    const {inner,outer}=contours(node);
    const wall=w.Manifold.union(panels.filter(p=>p.sources.includes(node.id)).map(p=>p.solid));
    const ends=inner.map(p=>{
      const hits=shell.rayCast([...p,z],[...center,z]);
      if(!hits.length)throw Error('No room-floor intersection for '+node.id);
      const [x,y]=hits[0].position;
      const d=Math.hypot(center[0]-x,center[1]-y);
      return [x+.25*(center[0]-x)/d,y+.25*(center[1]-y)/d];
    });
    const polygons=[];
    for(let i=1;i<inner.length;i++){
      polygons.push([outer[i-1],outer[i],inner[i],inner[i-1]],[inner[i-1],inner[i],ends[i],ends[i-1]]);
    }
    const plan=w.CrossSection.union(polygons.map(p=>new w.CrossSection([p],'EvenOdd')));
    const plate=plan.extrude(thickness).translate([0,0,floor]);
    const wallOverlap=plate.intersect(wall).volume(), roomOverlap=plate.intersect(shell).volume();
    if(plate.decompose().length!==1 || Math.min(roomOverlap,wallOverlap)<.005)throw Error('Incomplete room or perimeter joint for '+node.id);
    solids.push(plate); measurements.push({source:node.id,wallOverlap,roomOverlap,topZ:floor+thickness});
  }
  return {solids,measurements};
};
