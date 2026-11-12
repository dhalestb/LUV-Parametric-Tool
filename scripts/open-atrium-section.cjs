const fs=require('fs'),T=require('three');
(async()=>{
 const before=JSON.parse(fs.readFileSync('proof/interactive-check/open-atrium/before-15/result.json'));
 const after=JSON.parse(fs.readFileSync('proof/interactive-check/open-atrium/after-15/result.json')),visibility=after.voidFieldReport.visibility;
 const candidates=visibility.crossLevel.flatMap(p=>p.views);
 const ray=candidates.sort((a,b)=>Math.hypot(b.end[0]-b.start[0],b.end[1]-b.start[1])-Math.hypot(a.end[0]-a.start[0],a.end[1]-a.start[1]))[0];
 const delta=new T.Vector2(ray.end[0]-ray.start[0],ray.end[1]-ray.start[1]).normalize(),u=[delta.x,delta.y],normal=[delta.y,-delta.x],origin=ray.start.slice(0,2);
 const frame=new T.Matrix4().set(u[0],u[1],0,-u[0]*origin[0]-u[1]*origin[1],0,0,1,0,normal[0],normal[1],0,-normal[0]*origin[0]-normal[1]*origin[1],0,0,0,1);
 const w=await require('manifold-3d/manifold.js').default();w.setup();
 const make=m=>new w.Manifold(new w.Mesh({numProp:3,vertProperties:new Float32Array(m.positions),triVerts:new Uint32Array(m.indices)}));
 const slices=[before,after].map(r=>make(r.architecture).transform(frame.elements).slice(0).toPolygons());
 const project=p=>new T.Vector3(...p).applyMatrix4(frame).toArray();
 const paths=candidates.filter(p=>Math.abs(project(p.start)[2])<.01&&Math.abs(project(p.end)[2])<.01);
 const all=slices.flat(),min=Math.min(...all.flatMap(p=>p.map(q=>q[0])))-1,max=Math.max(...all.flatMap(p=>p.map(q=>q[0])))+1,zmax=Math.max(...all.flatMap(p=>p.map(q=>q[1])))+2;
 const scale=Math.min(810/(max-min),865/zmax),point=(p,x)=>[x+(p[0]-min)*scale,1080-p[1]*scale];
 const polyPath=polys=>polys.map(p=>'M '+p.map(q=>point(q,0).join(',')).join(' L ')+' Z').join(' ');
 const source=after.letters.find(l=>l.id===visibility.source).mesh,sourceLines=[];
 for(let i=0;i<source.indices.length;i+=3){const triangle=[0,1,2].map(k=>project(source.positions.slice(source.indices[i+k]*3,source.indices[i+k]*3+3))),hits=[];for(let k=0;k<3;k++){const a=triangle[k],b=triangle[(k+1)%3];if(a[2]*b[2]<0){const t=a[2]/(a[2]-b[2]);hits.push(a.map((v,j)=>v+t*(b[j]-v)));}}if(hits.length===2)sourceLines.push(hits);}
 const text=(value,x,y,size=25,color='#F7F6F5')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" fill="'+color+'" font-family="Arial,sans-serif">'+value+'</text>';
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1300" viewBox="0 0 2000 1300"><rect width="2000" height="1300" fill="#080B10"/>';
 svg+=text('VOID FIELD GATHERING — OPEN ATRIUM',70,65,44)+text('Exact exported-mesh section through a tested sightline · identical source poses and 15-ft floor spacing',70,110,26);
 for(let side=0;side<2;side++){const x=70+side*1000;svg+=text(side?'AFTER — FLOOR-FACING BAYS':'BEFORE — ENCLOSED LIGHTWELL',x,175,29,'#D6AD4F');
 svg+='<g transform="translate('+x+',0)"><path d="'+polyPath(slices[side])+'" fill="#F7F6F5" fill-rule="evenodd"/></g>';
 for(const floor of after.voidFieldReport.floors){const y=point([0,floor.topZ],x)[1];svg+='<line x1="'+x+'" x2="'+(x+810)+'" y1="'+y+'" y2="'+y+'" stroke="#71BEDA" stroke-opacity=".35" stroke-dasharray="7 8"/>';svg+=text(floor.topZ.toFixed(2)+' ft',x+820,y+7,21,'#71BEDA');}
 for(const p of paths){const a=point(project(p.start),x),b=point(project(p.end),x);svg+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="#71BEDA" stroke-width="3" '+(side?'':'stroke-dasharray="12 9"')+'/>';for(const q of [a,b])svg+='<circle cx="'+q[0]+'" cy="'+q[1]+'" r="5" fill="#71BEDA"/>';}
 for(const segment of sourceLines){const a=point(segment[0],x),b=point(segment[1],x);svg+='<line x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'" stroke="#D6AD4F" stroke-width="4"/>';}
 svg+=text(side?'Clear paths through actual wall openings':'Dashed paths intersect the original enclosing walls',x,1140,24);
 }
 svg+=text('Gold: unchanged '+visibility.source+' source · Blue: tested cross-level lines in this section plane',70,1200,26);
 svg+=text('40 × 40 × 60-ft field unchanged · section cropped to the form · geometric visibility only; daylight performance not simulated',70,1250,23);
 svg+='</svg>';fs.mkdirSync('reports/open-atrium',{recursive:true});fs.writeFileSync('reports/open-atrium/section-comparison.svg',svg);
 await require('sharp')(Buffer.from(svg)).resize(3000).png().toFile('reports/open-atrium/section-comparison.png');
 fs.writeFileSync('reports/open-atrium/section-provenance.json',JSON.stringify({before:before.id,after:after.id,sectionMatrix:frame.elements,rayPaths:paths,source:visibility.source,method:'Exact Manifold cross-section of exported meshes; original source triangles intersected against the identical plane.'},null,2));
 console.log(JSON.stringify({sectionPaths:paths.length,sourceSegments:sourceLines.length,beforeContours:slices[0].length,afterContours:slices[1].length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
