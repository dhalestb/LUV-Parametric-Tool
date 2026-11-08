const sharp=require('sharp');
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{let n=Math.hypot(...a)||1;return a.map(v=>v/n)};
function corners(b){return Array.from({length:8},(_,i)=>[0,1,2].map(a=>i&(1<<a)?b.max[a]:b.min[a]))}
async function render(meshes,view,frame,section=false){const W=520,H=360,rgba=Buffer.alloc(W*H*4),zbuf=new Float64Array(W*H).fill(-Infinity);for(let i=0;i<W*H;i++){rgba[i*4]=14;rgba[i*4+1]=22;rgba[i*4+2]=31;rgba[i*4+3]=255;}
 const basis=view==='iso'?[[.70710678,.70710678,0],[-.40824829,.40824829,.81649658],[.57735027,-.57735027,.57735027]]:view==='plan'?[[1,0,0],[0,1,0],[0,0,1]]:[[1,0,0],[0,0,1],[0,-1,0]];
 const c=corners(frame),us=c.map(p=>dot(p,basis[0])),vs=c.map(p=>dot(p,basis[1])),umin=Math.min(...us),umax=Math.max(...us),vmin=Math.min(...vs),vmax=Math.max(...vs),s=Math.min((W-50)/Math.max(umax-umin,.1),(H-40)/Math.max(vmax-vmin,.1)),uc=(umin+umax)/2,vc=(vmin+vmax)/2;
 const project=p=>[W/2+(dot(p,basis[0])-uc)*s,H/2-(dot(p,basis[1])-vc)*s,dot(p,basis[2])];
 const pixel=(x,y,color)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H){let k=(y*W+x)*4;rgba[k]=color[0];rgba[k+1]=color[1];rgba[k+2]=color[2]}};
 const line=(a,b,color)=>{const n=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]),1);for(let t=0;t<=n;t++)pixel(a[0]+(b[0]-a[0])*t/n,a[1]+(b[1]-a[1])*t/n,color)};
 let cuts=0;const plane=(frame.min[1]+frame.max[1])/2;
 for(const mesh of meshes){const verts=Array.from({length:mesh.positions.length/3},(_,i)=>mesh.positions.slice(i*3,i*3+3)),pv=verts.map(project);for(let k=0;k<mesh.indices.length;k+=3){const ix=mesh.indices.slice(k,k+3),world=ix.map(i=>verts[i]);if(section){let hits=[];for(let e=0;e<3;e++){const a=world[e],b=world[(e+1)%3],da=a[1]-plane,db=b[1]-plane;if(da*db<0){const t=da/(da-db);hits.push(a.map((v,i)=>v+t*(b[i]-v)));}}if(hits.length===2){line(project(hits[0]),project(hits[1]),mesh.color);cuts++;}continue;}
 const p=ix.map(i=>pv[i]),[a,b,d]=p,den=(b[1]-d[1])*(a[0]-d[0])+(d[0]-b[0])*(a[1]-d[1]);if(Math.abs(den)<1e-9)continue;const normal=norm(cross(sub(world[1],world[0]),sub(world[2],world[0]))),light=.35+.65*Math.abs(dot(normal,norm([.4,-.6,1]))),color=(mesh.color??[215,226,233]).map(v=>Math.round(v*light));
 for(let y=Math.max(0,Math.floor(Math.min(...p.map(p=>p[1]))));y<=Math.min(H-1,Math.ceil(Math.max(...p.map(p=>p[1]))));y++)for(let x=Math.max(0,Math.floor(Math.min(...p.map(p=>p[0]))));x<=Math.min(W-1,Math.ceil(Math.max(...p.map(p=>p[0]))));x++){const u=((b[1]-d[1])*(x-d[0])+(d[0]-b[0])*(y-d[1]))/den,v=((d[1]-a[1])*(x-d[0])+(a[0]-d[0])*(y-d[1]))/den,w=1-u-v;if(u>=0&&v>=0&&w>=0){const z=u*a[2]+v*b[2]+w*d[2],j=y*W+x;if(z>zbuf[j]){zbuf[j]=z;pixel(x,y,color)}}}
 }}
 if(!section)for(let i=0;i<8;i++)for(let axis=0;axis<3;axis++)if(!(i&(1<<axis)))line(project(c[i]),project(c[i|(1<<axis)]),[76,102,120]);
 return {png:await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),cuts,plane};}
module.exports=render;
