// Isolated receiver-topology normalization. Native plate construction remains authoritative.
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const VERSION='inserted-horizontal-plate/receiving-edge-domain-v1';
const TOLERANCE_FEET=1e-5;
function continuousEdges(loop,tolerance=TOLERANCE_FEET){
 const points=loop.map(p=>p.slice());
 // Remove only redundant vertices on the same oriented, continuous straight edge.
 // Never join separate loops, walls, corners, gaps or reverse-direction returns.
 let changed=true;
 while(changed&&points.length>3){changed=false;for(let i=0;i<points.length;i++){
  const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]],length=Math.hypot(c[0]-a[0],c[1]-a[1]);
  if(length>tolerance&&u[0]*v[0]+u[1]*v[1]>=0&&Math.abs(u[0]*v[1]-u[1]*v[0])/length<=tolerance){points.splice(i,1);changed=true;break;}
 }}
 return points;
}
let compiled;
function fitPlanks(...args){
 if(!compiled){const file=path.resolve(__dirname,'../vendor/typology-proof-20261121/scripts/fit-planks-to-walls.cjs');let source=fs.readFileSync(file,'utf8');const from='for(const wall of walls)for(const loop of wall.solid.slice(top-.375).toPolygons())',to='for(const wall of walls)for(const loop of wall.solid.slice(top-.375).toPolygons().map(loop=>continuousEdges(loop)))';assert.equal(source.split(from).length,2,'Authenticated receiver operation changed');source='const {continuousEdges}=require('+JSON.stringify(__filename)+');\n'+source.replace(from,to);const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(source,file);compiled=m.exports.fitPlanks;}
 return compiled(...args);
}
module.exports={VERSION,TOLERANCE_FEET,continuousEdges,fitPlanks};
