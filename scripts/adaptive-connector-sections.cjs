// Orthographic and axonometric projections of executed SYNTHETIC geometry.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../reports/stage2d-adaptive-connectors'),data=JSON.parse(fs.readFileSync(path.join(root,'synthetic-generated-geometry.json')));
const colors={original:'#F7F6F5',bearing:'#B9BEC6',landing:'#D6AD4F',support:'#71BEDA',circulation:'#D6AD4F'};
const objects=[...data.original,...data.geometry.filter(g=>g.category!=='derived-form')];
function triangleEdges(surface,section){
 const p=n=>surface.positions.slice(n*3,n*3+3),lines=[];
 for(let i=0;i<surface.indices.length;i+=3){const t=surface.indices.slice(i,i+3).map(p);
  if(section){const hits=[];for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3];if(Math.abs(a[1])<1e-8)hits.push(a);if(a[1]*b[1]<0){const u=-a[1]/(b[1]-a[1]);hits.push(a.map((v,k)=>v+(b[k]-v)*u));}}const unique=hits.filter((a,i)=>!hits.slice(0,i).some(b=>Math.hypot(...a.map((v,k)=>v-b[k]))<1e-7));if(unique.length>=2)lines.push([unique[0],unique[1]]);
  }else for(let j=0;j<3;j++)lines.push([t[j],t[(j+1)%3]]);
 }
 return lines;
}
for(const view of ['plan','section','axonometric']){
 const projection=view==='plan'?p=>[p[0],-p[1]]:view==='section'?p=>[p[0],-p[2]]:p=>[(p[0]-p[1])*.866,(p[0]+p[1])*.5-p[2]];
 const groups=objects.map(o=>({category:o.category,color:colors[o.category],lines:triangleEdges(o.surface,view==='section').map(line=>line.map(projection))}));
 const points=groups.flatMap(g=>g.lines.flat()),min=[0,1].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1].map(k=>Math.max(...points.map(p=>p[k]))),scale=Math.min(1030/(max[0]-min[0]),535/(max[1]-min[1]));
 const transform=p=>[60+(p[0]-min[0])*scale,105+(p[1]-min[1])*scale];
 const body=groups.map(g=>'<g fill="none" stroke="'+g.color+'" stroke-width="'+(g.category==='bearing'?'.6':'1')+'" opacity="'+(g.category==='bearing'?'.4':'.95')+'">'+g.lines.map(([a,b])=>{const [x,y]=transform(a),[u,v]=transform(b);return '<path d="M'+x.toFixed(2)+' '+y.toFixed(2)+'L'+u.toFixed(2)+' '+v.toFixed(2)+'"/>';}).join('')+'</g>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><rect width="1200" height="760" fill="#000"/><g fill="#F7F6F5" font-family="Arial"><text x="40" y="37" font-size="22">Stage 2D — '+view+' — SYNTHETIC VALIDATION FIXTURE</text><text x="40" y="65" font-size="15">Original OBJ adaptations remain blocked. This is generated mesh evidence, not an original-OBJ success.</text></g>'+body+'<g fill="#B9BEC6" font-family="Arial" font-size="15"><text x="40" y="690">White: original floors | Gold: flush extension + accepted stair | Cyan: conceptual bearing column</text><text x="40" y="717">Extension: 9 ft²; column: 2 × 2 ft, 7.75 ft high; local circulation validated; structural engineering unverified.</text><text x="40" y="741">'+(view==='section'?'Exact triangle intersections at y = 0; extension floor z = 0; landing underside z = −0.25 ft.':'Wire edges projected from actual emitted triangles; overlapping faces can appear dense.')+'</text></g></svg>';
 fs.writeFileSync(path.join(root,'synthetic-'+view+'.svg'),svg);
}
console.log('Wrote three actual-mesh SVG views.');
const opening=JSON.parse(fs.readFileSync(path.join(root,'synthetic-opening-geometry.json')));
const groups=[['original','#B9BEC6'],['removed','#D6AD4F'],['derived','#71BEDA']];
const body=groups.map(([category,color])=>'<g stroke="'+color+'" stroke-width="'+(category==='derived'?'2':'1')+'" fill="none">'+triangleEdges(opening[category],true).map(([a,b])=>'<path d="M'+(100+(a[0]+8)*55)+' '+(540-a[2]*55)+'L'+(100+(b[0]+8)*55)+' '+(540-b[2]*55)+'"/>').join('')+'</g>').join('');
fs.writeFileSync(path.join(root,'synthetic-opening-section.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760"><rect width="1200" height="760" fill="#000"/><g font-family="Arial" fill="#F7F6F5"><text x="40" y="38" font-size="22">SYNTHETIC ONLY — localized derived opening, y = 0 section</text><text x="40" y="66" font-size="15">Gray: original wall and floor | Gold: 14 ft³ removed | Cyan: resulting derived floor</text></g>'+body+'<g font-family="Arial" fill="#B9BEC6" font-size="15"><text x="40" y="690">Explicit test limits: removal 16 ft³, extent 12 ft. Default 8 ft³ limit correctly rejects this fixture.</text><text x="40" y="720">Original source remains unchanged. No original OBJ cut succeeded; Boolean topology remains blocked.</text></g></svg>');
