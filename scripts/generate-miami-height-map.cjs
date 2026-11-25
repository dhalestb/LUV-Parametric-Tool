// Build the reusable Miami street/water envelope in native model coordinates.
// Scaling both reference surfaces and the parcel preserves the distance ratio.
const fs=require('node:fs');
const path=require('node:path');
const {distanceFunction,scalarClip,hash}=require('./shared-site-rules.cjs');
const input=require('../public/experiment-inputs/shared-site-rule-references-v1.json');

async function main(){
  const model=fs.readFileSync(path.join(__dirname,'..',input.asset));
  if(require('node:crypto').createHash('sha256').update(model).digest('hex')!==input.modelSha256)throw Error('Miami model changed');
  for(const layer of input.layers)if(hash(layer.contours)!==layer.geometryHash)throw Error('Reference contours changed');
  const api=await require('manifold-3d/manifold.js').default();api.setup();
  const layer=name=>input.layers.find(l=>l.layer===name);
  const site=layer('Site'),parcel=site.contours[0];
  const distance=name=>distanceFunction(layer(name).contours,parcel);
  const road=distance('Roadways'),water=distance('Water');
  const lo=site.bounds.min.map(Math.floor),hi=site.bounds.max.map(Math.ceil);
  const step=.5,bands=[[],[],[]];
  function row(x){
    const points=[];
    for(let z=lo[2];z<=hi[2];z+=step){
      const point=[x,z],a=road(point),b=water(point);
      points.push([x,z,a/(a+b)]);
    }
    return points;
  }
  let prev=row(lo[0]);
  for(let x=lo[0]+step;x<=hi[0];x+=step){
    const next=row(x);
    for(let j=1;j<next.length;j++){
      for(const triangle of [[prev[j-1],next[j-1],next[j]],[prev[j-1],next[j],prev[j]]]){
        for(let i=0;i<3;i++){
          let p=triangle;
          if(i<2)p=scalarClip(p,(i+1)/3,true);
          if(i>0)p=scalarClip(p,i/3,false);
          if(p.length>=3)bands[i].push(p.map(([x,z])=>[x,z]));
        }
      }
    }
    prev=next;
  }
  const regions=bands.map((rings,i)=>{
    const shape=new api.CrossSection(rings,'NonZero');
    const contours=shape.toPolygons();shape.delete();
    return {id:['street','intermediate','water'][i],heightFeet:[60,40,20][i],contours};
  });
  const result={modelSha256:input.modelSha256,parcel,base:site.bounds.min[1],regions};
  fs.writeFileSync(path.join(__dirname,'../src/components/polygonExperiment/miami-height-regions.json'),JSON.stringify(result)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
