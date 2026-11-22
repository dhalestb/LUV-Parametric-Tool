const path=require('node:path');
const fs=require('node:fs');
const sharp=require('sharp');
const dir=path.join(__dirname,'../../public/centralized-source-review');
const models=require(path.join(dir,'source-evidence.json'));
(async()=>{
  const layers=[];
  const tileWidth=470, tileHeight=375, rowHeight=417;
  for(const [i,m] of models.entries()){
    const primary=[10,70,34][i];
    for(const r of m.reviews){
      for(const [j,view] of ['plan','3D'].entries()){
        const svg=path.join(dir,m.filename+'-R'+r.region+'-'+view+'.svg');
        if(view==='plan'&&(r.region===3||m.filename==='Stepped.obj'&&r.region===70)){
          await sharp(svg,{density:140}).png().toFile(svg.replace(/\.svg$/,'.png'));
        }
        const buf=await sharp(svg).resize(tileWidth,tileHeight,{fit:'contain',background:'#101820'}).png().toBuffer();
        if(r.region===primary)layers.push({input:buf,left:j*tileWidth,top:i*rowHeight+42});
      }
    }
    const title='<svg width="940" height="42"><text x="14" y="28" font-family="Arial" font-size="20" fill="white">'+m.filename+' · R'+primary+'   |   plan and isometric</text></svg>';
    layers.push({input:Buffer.from(title),left:0,top:i*rowHeight});
  }
  await sharp({create:{width:tileWidth*2,height:3*rowHeight,channels:3,background:'#101820'}}).composite(layers).png().toFile(path.join(dir,'three-priority-regions.png'));
  for(const entry of ['index.html','comparison-matrix.json','source-evidence.json'])if(!fs.statSync(path.join(dir,entry)).size)throw Error(entry+' is empty');
  console.log('Rendered all 18 source views. Wrote the three-model annotated overview.');
})().catch(e=>{console.error(e);process.exitCode=1;});
