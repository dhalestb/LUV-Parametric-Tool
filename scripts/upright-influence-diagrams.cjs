const fs=require('fs'),path=require('path');
async function draw(input,output) {
  const r=JSON.parse(fs.readFileSync(input));
  const w=await require('manifold-3d/manifold.js').default();w.setup();
  const sharp=require('sharp');
  const solid=mesh=>{
    const m=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)});
    m.merge();return new w.Manifold(m);
  };
  const architecture=solid(r.architecture);
  const colors={ink:'#e9eef3',line:'#60768b',letter:'#5ba4bd',cut:'#e59a65',stone:'#ded6bd'};
  const height=125+r.boundaryReport.voids.length*340;
  let body='<rect width="1260" height="'+height+'" fill="#101923"/>';
  const text=(x,y,value,size=16)=>'<text x="'+x+'" y="'+y+'" font-family="Arial,sans-serif" font-size="'+size+'" fill="'+colors.ink+'">'+value+'</text>';
  body+=text(25,35,'Upright interior letters and their actual architectural cuts',25);
  body+=text(25,64,r.request.field.width+' × '+r.request.field.depth+' × '+r.request.field.height+' ft · '+r.request.preferredFeet+' ft preferred letters · identical coordinates in plan',16);
  body+=text(25,98,'Source elevation · inner contour highlighted');
  body+=text(445,98,'Cutter and removed material · plan section');
  body+=text(865,98,'Final architecture · same plan section');
  const planPath=(loops,originX,top)=>loops.map(loop=>'M'+loop.map(p=>[originX+180+p[0]*6.6,top+150-p[1]*6.6].join(',')).join(' L')+' Z').join(' ');
  for(const [index,v] of r.boundaryReport.voids.entries()){
    const top=120+index*340;
    const letter=r.letters.find(l=>l.id===v.source);
    const p=r.request.source[r.letters.indexOf(letter)];
    body+=text(25,top+18,v.source+' · X tilt '+v.tilt+'° · Z turn '+v.yaw+'°',19);
    const projection=point=>[(point[0]-p.x)*v.side[0]+(point[1]-p.y)*v.side[1],point[2]-v.sourcePlaneOrigin[2]];
    const face=point=>{const [x,z]=projection(point);return [205+x*14,top+172-z*14];};
    const m=letter.mesh;
    for(let i=0;i<m.indices.length;i+=3){
      const points=m.indices.slice(i,i+3).map(j=>face(m.positions.slice(j*3,j*3+3)).join(',')).join(' ');
      body+='<polygon points="'+points+'" fill="'+colors.letter+'"/>';
    }
    body+='<polygon points="'+v.sourceContour.map(point=>face(point).join(',')).join(' ')+'" fill="'+colors.cut+'" fill-opacity=".5" stroke="'+colors.cut+'" stroke-width="2"/>';
    body+=text(25,top+304,'Contour uses the placed letter’s exact scale and elevation',13);
    const z=v.profileBounds.floor+(v.profileBounds.crown-v.profileBounds.floor)*.65;
    const cutter=solid(v.cutterMesh).slice(z).toPolygons();
    const removed=solid(v.removedMesh).slice(z).toPolygons();
    const final=architecture.slice(z).toPolygons();
    for(const originX of [445,865]){
      body+='<rect x="'+(originX+48)+'" y="'+(top+18)+'" width="264" height="264" fill="none" stroke="'+colors.line+'"/>';
      body+=text(originX+48,top+303,'Section Z '+z.toFixed(2)+' ft · X → · Y ↑',13);
    }
    body+='<path d="'+planPath(cutter,445,top)+'" fill="'+colors.letter+'" fill-opacity=".32" fill-rule="evenodd"/>';
    body+='<path d="'+planPath(removed,445,top)+'" fill="'+colors.cut+'" fill-rule="evenodd"/>';
    body+='<path d="'+planPath(final,865,top)+'" fill="'+colors.stone+'" fill-rule="evenodd"/>';
    body+='<path d="'+planPath(removed,865,top)+'" fill="'+colors.cut+'" fill-opacity=".48" fill-rule="evenodd"/>';
    body+=text(445,top+324,(v.alcove?'Bounded alcove':'Through opening')+' · removed '+v.removedVolume.toFixed(1)+' ft³',14);
    body+=text(865,top+324,'Orange marks the material removed by '+v.source,14);
  }
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1260" height="'+height+'" viewBox="0 0 1260 '+height+'">'+body+'</svg>';
  fs.writeFileSync(output+'.svg',svg);await sharp(Buffer.from(svg)).png().toFile(output+'.png');
}
draw(process.argv[2],process.argv[3]).catch(e=>{console.error(e);process.exitCode=1});
