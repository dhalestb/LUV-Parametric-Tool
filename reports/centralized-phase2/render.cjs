const fs=require('fs'),path=require('path');
const {createCanvas,loadImage,GlobalFonts}=require('@napi-rs/canvas');
GlobalFonts.registerFromPath('C:/Windows/Fonts/arial.ttf','Arial');
async function main(){
  const summaries=JSON.parse(fs.readFileSync(path.join(__dirname,'final-model-summary.json')));
  for(const s of summaries){const slug=s.filename.replace(/\.obj$/i,'');
    for(const [name,suffix]of [['isometric',''],['ground-plan','-level-0']]){
      const c=createCanvas(1280,570),ctx=c.getContext('2d');ctx.fillStyle='#101820';ctx.fillRect(0,0,1280,570);
      for(const [index,side]of ['before','after'].entries()){
        const image=await loadImage(fs.readFileSync(path.join(__dirname,slug+suffix+'-'+side+'.svg')));ctx.drawImage(image,index*640,40);
      }
      ctx.fillStyle='white';ctx.font='20px Arial';ctx.fillText(`${s.filename} - ${name}: original / experimental`,20,28);
      ctx.font='13px Arial';ctx.fillText(`${s.originalRegions} retained walk components`,20,560);ctx.fillText(`${s.spaces} spaces + ${s.transitions} small transitions/fragments; production score unchanged`,660,560);
      fs.writeFileSync(path.join(__dirname,slug+'-'+name+'-comparison.png'),c.toBuffer('image/png'));
    }
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
