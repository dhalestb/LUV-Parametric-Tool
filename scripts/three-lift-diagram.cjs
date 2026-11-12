const fs=require('fs'),sharp=require('sharp');
(async()=>{
 const r=JSON.parse(fs.readFileSync('proof/interactive-check/three-lifts/19/result.json'));
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const mk=mesh=>{const m=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)});m.merge();return new w.Manifold(m);};
 const colors={lower:'#8bbfac',middle:'#e6aa77',top:'#a999d4'};
 const text=(x,y,s,size=18)=>'<text x="'+x+'" y="'+y+'" font-family="Arial" font-size="'+size+'" fill="#e9eef4">'+s+'</text>';
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="1200" height="760" fill="#111b25"/>';
 svg+=text(30,40,'Three lifts · source elevation and actual architectural section',26);
 svg+=text(30,72,'40 × 40 × 60 ft field · 13 ft preferred letters · 12 sources · seed 19');
 svg+=text(50,110,'Source letters viewed along Y');
 svg+=text(640,110,'Architecture section at Y = 0');
 const project=(x,z,left)=>[left+230+x*8,650-z*8];
 for(const left of [40,630]){
  svg+='<rect x="'+(left+70)+'" y="170" width="320" height="480" fill="none" stroke="#60798e"/>';
  for(const z of [0,10,20,30,40,50,60]){
   const p=project(-20,z,left);svg+='<path d="M'+p.join(',')+'h320" stroke="#60798e" opacity=".2"/>';
   svg+=text(left+30,p[1]+5,z+'′',13);
  }
 }
 for(const [index,l] of r.letters.entries()){
  const p=r.request.source[index],m=l.mesh;
  for(let i=0;i<m.indices.length;i+=3){
   const points=m.indices.slice(i,i+3).map(j=>project(m.positions[j*3],m.positions[j*3+2],40).join(',')).join(' ');
   svg+='<polygon points="'+points+'" fill="'+colors[p.lift]+'" fill-opacity=".8"/>';
  }
 }
 const slice=mesh=>mk(mesh).rotate([-90,0,0]).slice(0).toPolygons();
 const path=loops=>loops.map(loop=>'M'+loop.map(p=>project(p[0],p[1],630).join(',')).join(' L')+' Z').join(' ');
 svg+='<path d="'+path(slice(r.primary))+'" fill="#ca8c5c" fill-rule="evenodd"/>';
 svg+='<path d="'+path(slice(r.architecture))+'" fill="#ded5bd" fill-rule="evenodd"/>';
 let x=50;
 for(const lift of ['lower','middle','top']){
  svg+='<rect x="'+x+'" y="695" width="18" height="18" fill="'+colors[lift]+'"/>'+text(x+27,710,lift+' · 4 letters',16);x+=200;
 }
 svg+=text(640,710,'Orange marks removed material at this section',15);
 svg+='</svg>';
 fs.writeFileSync('reports/three-lifts/lift-section.svg',svg);
 await sharp(Buffer.from(svg)).png().toFile('reports/three-lifts/lift-section.png');
})().catch(e=>{console.error(e);process.exitCode=1});
