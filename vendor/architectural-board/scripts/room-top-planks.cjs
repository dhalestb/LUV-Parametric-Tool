const THREE=require('three');
const {contours}=require('./room-edge-platforms.cjs');
const {getLetterShape}=require('../src/components/letterGeometry3d.ts');

// Connect the actual inner contours at the last perimeter tier on one horizontal plane.
module.exports=function topPlanks(w,nodes,panels,mode,profiles){
  const perimeter=nodes.filter(n=>n.p.architecturalRole==='perimeter');
  const level=Math.max(...perimeter.map(n=>n.p.levelIndex));
  const tier=perimeter.filter(n=>n.p.levelIndex===level).sort((a,b)=>Math.atan2(a.p.y,a.p.x)-Math.atan2(b.p.y,b.p.x));
  if(tier.length<3)throw Error('The open top needs at least three perimeter sources.');
  const thickness=.5;
  const top=Math.min(...tier.map(n=>n.matrix[14]));
  const fullRim=mode==='full-rim';
  const centered=fullRim||mode==='center';
  const inclined=[];
  const guides=tier.map(n=>{
    if(n.p.letter!=='V')return contours(n);
    const shape=getLetterShape('V'),center=new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
    const matrix=new THREE.Matrix4().fromArray(n.matrix);
    const at=(i,t)=>{const p=shape.curves[i].getPoint(t).sub(center),v=new THREE.Vector3(p.x,p.y,0).applyMatrix4(matrix);return [v.x,v.y];};
    const flank=fullRim?4:[4,6].sort((a,b)=>Math.hypot(...at(b,.5))-Math.hypot(...at(a,.5)))[0];
    const inner=flank===4?2:1;
    if(fullRim)return {outer:[at(4,0),at(4,1)],inner:[at(2,1),at(2,0)]};
    return {outer:[at(flank,.2),at(flank,.8)],inner:[at(inner,.8),at(inner,.2)]};
  });
  const stations=guides.map(g=>{const p=g.inner.reduce((s,v)=>s.add(new THREE.Vector3(v[0],v[1],0)),new THREE.Vector3());return p.divideScalar(g.inner.length);});
  let plan,levelArms;
  if(centered){
    const bounds=new THREE.Box3().setFromPoints(tier.flatMap(n=>n.line));
    const center=bounds.getCenter(new THREE.Vector3());
    levelArms=[];
    const arms=guides.map((g,i)=>{
      const direction=new THREE.Vector2(center.x-stations[i].x,center.y-stations[i].y).normalize();
      const width=tier[i].p.scale*.095;
      // Carry a finite end section past the center so every plank shares material.
      const tip=[-1,1].map(sign=>[center.x+width*(direction.x-sign*direction.y),
        center.y+width*(direction.y+sign*direction.x)]);
      if(fullRim&&tier[i].p.letter!=='U'){
        const node=tier[i],matrix=new THREE.Matrix4().fromArray(node.matrix);
        const plane=new THREE.Vector3(0,0,1).transformDirection(matrix);
        const height=([x,y])=>node.matrix[14]-(plane.x*(x-node.matrix[12])+plane.y*(y-node.matrix[13]))/plane.z;
        const rim=profiles.find(p=>p.upperSource===node.id).upperProfile;
        const innerRim=rim.map(([x,y])=>{const d=Math.hypot(x,y);return [x-.45*x/d,y-.45*y/d];});
        const outline=w.CrossSection.hull([...g.inner,...g.outer,...innerRim,...rim.map(([x,y])=>[x,y])]);
        // This seat follows the tilted top edge on both sides of the wall.
        const seat=outline.offset(.025,'Round').extrude(thickness).warp(v=>{v[2]+=height(v)-thickness;});
        const vertices=(points,z)=>points.flatMap(pt=>[0,-thickness].map(d=>[...pt,z(pt)+d]));
        const arm=w.Manifold.hull([...vertices(g.inner,height),...vertices(tip,()=>top)]);
        const joined=seat.add(arm);
        for(const [x,y,z] of rim){
          const d=Math.hypot(x,y),p=[x-.20*x/d,y-.20*y/d];
          if(!joined.rayCast([...p,z+1],[...p,z-1]).length)throw Error('Uncovered wall rim on '+node.id);
        }
        inclined.push(joined);
        return joined.project();
      }
      const reach=w.CrossSection.hull([...g.inner,...tip]);
      const seat=w.CrossSection.hull([...g.outer,...g.inner]).offset(.12,'Round');
      const wall=w.Manifold.union(panels.filter(p=>p.sources.includes(tier[i].id)).map(p=>p.solid));
      const footprint=wall.slice(top-thickness/2);
      const support=footprint.toPolygons().flat().sort((a,b)=>
        Math.hypot(a[0]-stations[i].x,a[1]-stations[i].y)-Math.hypot(b[0]-stations[i].x,b[1]-stations[i].y))[0];
      if(!support)throw Error('No supporting wall at top plank elevation for '+tier[i].id);
      const bearing=footprint.intersect(w.CrossSection.circle(width,24).translate(support));
      const arm=reach.add(w.CrossSection.hull([seat,bearing]));
      levelArms.push(arm);return arm;
    });
    const probe=w.CrossSection.circle(.2,24).translate([center.x,center.y]);
    if(arms.some(arm=>probe.subtract(arm).area()>.00001))throw Error('A top plank misses the shared center.');
    plan=w.CrossSection.union(arms).offset(.35,'Round').offset(-.35,'Round');
  }else{
    const curve=new THREE.CatmullRomCurve3(stations,true);
    const loop=new w.CrossSection([curve.getPoints(tier.length*24).slice(0,-1).map(p=>[p.x,p.y])],'EvenOdd');
    const halfWidth=Math.min(...tier.map(n=>n.p.scale))*.085;
    const ribbon=loop.offset(halfWidth,'Round').subtract(loop.offset(-halfWidth,'Round'));
    plan=w.CrossSection.union([ribbon,...guides.map(g=>w.CrossSection.hull([...g.outer,...g.inner]).offset(.12,'Round'))]);
  }
  const flat=p=>p.extrude(thickness).translate([0,0,top-thickness]);
  const solid=inclined.length?w.Manifold.union([...levelArms.map(flat),...inclined]):flat(plan);
  if(solid.decompose().length!==1||plan.toPolygons().length!==(centered?1:2))throw Error('Top planks must form one connected span with the requested center joint.');
  const contacts=tier.map(n=>{const wall=w.Manifold.union(panels.filter(p=>p.sources.includes(n.id)).map(p=>p.solid));return {source:n.id,overlap:wall.intersect(solid).volume()};});
  if(contacts.some(c=>c.overlap<.001))throw Error('Top plank missing perimeter contact: '+JSON.stringify(contacts));
  return {solid,contacts,top,thickness};
};
