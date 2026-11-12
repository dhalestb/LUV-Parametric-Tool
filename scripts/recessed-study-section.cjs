// Cross-section of the actual exported meshes, in the vertical plane through the opening probe.
const fs=require('node:fs');
const path=require('node:path');
async function draw(result,output){
  const w=await require('manifold-3d/manifold.js').default();
  w.setup();
  const report=result.boundaryReport.voids;
  const alcove=result.articulationReport.operations.find(op=>op.alcove);
  if(!alcove)throw Error('Section requires a validated alcove.');
  const feature=report.find(v=>alcove.sources.includes(v.source));
  const [ax,ay]=feature.axis;
  const [x,y]=feature.probe.start;
  const offset=ay*x-ax*y;
  const cut=(mesh)=>{
    const data=new w.Mesh({numProp:3,vertProperties:new Float32Array(mesh.positions),triVerts:new Uint32Array(mesh.indices)});
    data.merge();
    const m=new w.Manifold(data);
    return m.rotate([0,0,-Math.atan2(ay,ax)*180/Math.PI]).rotate([-90,0,0]).slice(offset).toPolygons();
  };
  const before=cut(result.primary),after=cut(result.architecture);
  const pts=before.flat().concat(after.flat());
  const left=Math.min(...pts.map(p=>p[0])),right=Math.max(...pts.map(p=>p[0]));
  const floor=Math.min(0,...pts.map(p=>p[1])),roof=Math.max(...pts.map(p=>p[1]));
  const scale=Math.min(770/(right-left),380/(roof-floor));
  const project=p=>[(55+(p[0]-left)*scale).toFixed(2),(470-(p[1]-floor)*scale).toFixed(2)];
  const shape=loops=>loops.map(loop=>'M'+loop.map(p=>project(p).join(',')).join(' L')+' Z').join(' ');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="540" viewBox="0 0 900 540"><rect width="900" height="540" fill="#121b25"/><g fill="#e9edf0" font-family="sans-serif"><text x="45" y="40" font-size="23">Longitudinal section through '+feature.source+' alcove</text><text x="45" y="68" font-size="16">Pale stone = final architecture    /    Copper = material removed</text></g><path d="'+shape(before)+'" fill="#b8744f" fill-rule="evenodd"/><path d="'+shape(after)+'" fill="#e5d9b9" fill-rule="evenodd"/><path d="M55,492h'+(5*scale)+'" stroke="#e9edf0" stroke-width="3"/><text x="55" y="518" fill="#e9edf0" font-family="sans-serif">5 ft</text></svg>';
  fs.writeFileSync(output,svg);
}
if(require.main===module){const [input,output]=process.argv.slice(2);draw(JSON.parse(fs.readFileSync(path.resolve(input))),output).catch(e=>{console.error(e);process.exitCode=1;});}
