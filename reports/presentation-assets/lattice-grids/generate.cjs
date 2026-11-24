/* eslint-disable @typescript-eslint/no-require-imports -- Standalone SVG and PNG asset generator. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const dir=__dirname,C={bg:'#000000',primary:'#F7F6F5',secondary:'#B9BEC6',construction:'#71BEDA',highlight:'#D6AD4F'};
const number=n=>Number(n.toFixed(3)),point=p=>p.map(number).join(','),escape=s=>s.replaceAll('&','&amp;');
const text=(x,y,value,size=16,fill=C.secondary,anchor='start',extra='')=>`<text x="${number(x)}" y="${number(y)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" ${extra}>${escape(value)}</text>`;
const line=(a,b,stroke,width=1,extra='')=>`<line x1="${number(a[0])}" y1="${number(a[1])}" x2="${number(b[0])}" y2="${number(b[1])}" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
const polygon=(pts,extra='')=>`<polygon points="${pts.map(point).join(' ')}" ${extra}/>`;
function grid(n,cx,back,u,id){
 const p=(x,y,z=0)=>[cx+Math.sqrt(3)/2*u*(x-y),back+u*.5*(x+y)-u*z];
 const cells=[];for(let x=0;x<n;x++)for(let y=0;y<n;y++)cells.push(polygon([p(x,y),p(x+1,y),p(x+1,y+1),p(x,y+1)],`id="${id}-cell-${x}-${y}" data-cell-x="${x}" data-cell-y="${y}" fill="none" stroke="none"`));
 let out=`<g id="${id}" data-nx="${n}" data-ny="${n}" data-nz="1" data-horizontal-cells="${n*n}" data-module-feet="20">\n<g id="${id}-editable-cell-footprints">${cells.join('\n')}</g>`;
 out+=`<g id="${id}-vertical-references" fill="none">`;
 for(let x=0;x<=n;x++)for(let y=0;y<=n;y++){const corner=(x===0||x===n)&&(y===0||y===n);out+=line(p(x,y),p(x,y,1),C.secondary,corner?1:.65,`opacity="${corner?.52:.22}" ${corner?'':'stroke-dasharray="2 5"'}`);}out+='</g>';
 out+=`<g id="${id}-upper-registration-datum" fill="none">`;
 for(let i=0;i<=n;i++){const boundary=i===0||i===n;out+=line(p(i,0,1),p(i,n,1),boundary?C.secondary:C.construction,boundary?1:.65,`opacity="${boundary?.55:.32}"`);out+=line(p(0,i,1),p(n,i,1),boundary?C.secondary:C.construction,boundary?1:.65,`opacity="${boundary?.55:.32}"`);}out+='</g>';
 out+=`<g id="${id}-plan-grid" fill="none" stroke-linecap="round">`;
 for(let i=0;i<=n;i++){out+=line(p(i,0),p(i,n),C.primary,1.35,'data-plan-line="x"');out+=line(p(0,i),p(n,i),C.primary,1.35,'data-plan-line="y"');}out+='</g>';
 out+=polygon([p(n-1,n-1),p(n,n-1),p(n,n),p(n-1,n)],`id="${id}-highlighted-module" fill="${C.highlight}" fill-opacity=".065" stroke="${C.highlight}" stroke-width="1.65"`);
 out+=`<g id="${id}-registration-nodes" fill="${C.construction}">`;
 for(let x=0;x<=n;x++)for(let y=0;y<=n;y++)out+=`<circle cx="${number(p(x,y)[0])}" cy="${number(p(x,y)[1])}" r="1.6" opacity=".7"/>`;out+='</g>';
 out+=`<circle cx="${cx}" cy="${back}" r="3.4" fill="${C.highlight}"/>`;
 const dimension=(a,b,label,side)=>{const offset=[side*25,40],aa=a.map((v,k)=>v+offset[k]),bb=b.map((v,k)=>v+offset[k]);let s=line(a,aa,C.construction,.65,'opacity=".65"')+line(b,bb,C.construction,.65,'opacity=".65"')+line(aa,bb,C.construction,.85,'opacity=".8"');for(const q of [aa,bb])s+=line([q[0]-3,q[1]-5],[q[0]+3,q[1]+5],C.construction,.85);const mid=[(aa[0]+bb[0])/2,(aa[1]+bb[1])/2],angle=side<0?30:-30;return s+text(mid[0],mid[1]+19,label,15,C.construction,'middle',`transform="rotate(${angle} ${number(mid[0])} ${number(mid[1]+19)})"`);};
 out+=`<g id="${id}-dimensions">${dimension(p(0,n),p(n,n),`${n*20}′`,-1)}${dimension(p(n,0),p(n,n),`${n*20}′`,1)}</g>`;
 const right=p(n,0),top=p(n,0,1);out+=text(top[0]+15,top[1]+5,'20′ datum',13,C.secondary)+text(right[0]+15,right[1]+5,'0′',13,C.secondary);
 return out+'</g>';
}
function svg(width,height,body,title,desc){return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description"><title id="title">${title}</title><desc id="description">${desc}</desc><rect id="background" width="100%" height="100%" fill="${C.bg}"/><g font-family="Arial, Helvetica, sans-serif" font-weight="400">${body}</g></svg>`;}
const assets=[];
for(const n of [2,4,8]){
 const u=110,width=Math.ceil(Math.max(720,Math.sqrt(3)*u*n+310)),height=n*u+470,cx=width/2,back=255;
 let body=text(60,61,`${n} × ${n} × 1`,40,C.primary,'start','letter-spacing="1.5"');
 body+=text(62,94,`${n*n} HORIZONTAL MODULES  /  ${n*20}′ × ${n*20}′`,13,C.secondary,'start','letter-spacing="1.4"');
 body+=grid(n,cx,back,u,`lattice-${n}`);
 body+=line([60,height-92],[width-60,height-92],C.secondary,.65,'opacity=".35"');
 body+=text(60,height-61,'20′ × 20′ MODULE',14,C.highlight,'start','letter-spacing="1"');
 body+=text(width-60,height-61,'ONE LEVEL · AXONOMETRIC REGISTRATION',12,C.secondary,'end','letter-spacing=".7"');
 body+=text(60,height-32,'Explanatory lattice diagram · not an optimization result',11,C.secondary,'start','opacity=".65"');
 assets.push({name:`lattice-${n}x${n}x1`,width,height,svg:svg(width,height,body,`${n} by ${n} by 1 modular lattice`,`${n*n} horizontal cells, each 20 by 20 feet. One registration level between 0 and 20 feet. Axes project at plus and minus 30 degrees. Original OBJ geometry is not depicted.`),counts:[n*n]});
}
{
 const width=2900,height=1300,u=90,span=n=>Math.sqrt(3)*u*n,left=150,gap=160,centerY=645;let edge=left;
 let body=text(72,70,'MODULAR LATTICE REGISTRATION',30,C.primary,'start','letter-spacing="2"')+text(73,108,'20′ modular pitch  /  one level  /  shared axonometric scale',16,C.secondary);
 for(const n of [2,4,8]){const cx=edge+span(n)/2,back=centerY-n*u/2;body+=grid(n,cx,back,u,`combined-${n}`);body+=text(cx,1144,`${n} × ${n} × 1`,37,C.primary,'middle','letter-spacing="1.5"');body+=text(cx,1180,`${n*n} cells  ·  ${n*20}′ × ${n*20}′`,17,C.secondary,'middle');edge+=span(n)+gap;}
 body+=line([72,1220],[width-72,1220],C.secondary,.65,'opacity=".35"')+text(72,1258,'HIGHLIGHTED CELL = 20′ × 20′',13,C.highlight,'start','letter-spacing=".8"')+text(width-72,1258,'Registration framework only · no optimized arrangement shown',13,C.secondary,'end');
 assets.push({name:'lattice-comparison-horizontal',width,height,svg:svg(width,height,body,'Comparison of 2 by 2, 4 by 4 and 8 by 8 one-level lattices','The three grids contain 4, 16 and 64 horizontal cells, respectively, at identical module pitch and projection. Thin vertical references describe one 20-foot registration interval.'),counts:[4,16,64]});
}
(async()=>{
 const manifest={projection:{axisAngleDegrees:30,verticalAxisDegrees:90},moduleFeet:20,palette:C,assets:[]};
 for(const a of assets){
  const cellCount=(a.svg.match(/data-cell-x=/g)||[]).length;assert.equal(cellCount,a.counts.reduce((n,x)=>n+x,0));
  for(const count of a.counts){const n=Math.sqrt(count);assert.equal(count,n*n);}
  fs.writeFileSync(path.join(dir,a.name+'.svg'),a.svg);
  const transparent=a.svg.replace(/<rect id="background"[^>]*\/>/,'');assert(!transparent.includes('id="background"'));
  const pixels=a.name.includes('comparison')?6400:3600;
  await sharp(Buffer.from(transparent),{density:300}).resize({width:pixels}).png().withMetadata({density:300}).toFile(path.join(dir,a.name+'.png'));
  await sharp(Buffer.from(a.svg),{density:300}).resize({width:pixels}).png().withMetadata({density:300}).toFile(path.join(dir,a.name+'-black.png'));
  const meta=await sharp(path.join(dir,a.name+'.png')).metadata();assert(meta.hasAlpha);
  const {data}=await sharp(path.join(dir,a.name+'.png')).extract({left:0,top:0,width:1,height:1}).raw().toBuffer({resolveWithObject:true});assert.equal(data[3],0);
  manifest.assets.push({svg:a.name+'.svg',transparentPNG:a.name+'.png',blackPNG:a.name+'-black.png',horizontalCellCounts:a.counts,svgViewBox:[a.width,a.height],pngPixels:[meta.width,meta.height],dpi:300});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
