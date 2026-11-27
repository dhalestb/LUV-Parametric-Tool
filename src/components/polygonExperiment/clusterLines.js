import * as T from 'three';
import {geometryFor} from './architectureViews';
// Visible architectural crease edges, using the board's orthographic depth buffer.
export function visibleEdges(mesh,meta){
  const {positions:pos,indices:idx}=mesh, {width:w,height:h,cameraMatrix:m}=meta, g=geometryFor(mesh);
  function project(x,y,z){return [(1+m[0]*x+m[4]*y+m[8]*z+m[12])*w/2,(1-m[1]*x-m[5]*y-m[9]*z-m[13])*h/2,m[2]*x+m[6]*y+m[10]*z+m[14]];}
  const projected=new Float64Array(pos.length),depth=new Float32Array(w*h).fill(Infinity);
  for(let k=0;k<pos.length;k+=3)projected.set(project(pos[k],pos[k+1],pos[k+2]),k);
  for(let k=0;k<idx.length;k+=3){const a=3*idx[k],b=3*idx[k+1],c=3*idx[k+2],p=projected,ax=p[a],ay=p[a+1],az=p[a+2],bx=p[b],by=p[b+1],cx=p[c],cy=p[c+1],ux=bx-ax,uy=by-ay,vx=cx-ax,vy=cy-ay,det=ux*vy-uy*vx;if(Math.abs(det)<1e-7)continue;
    const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(w-1,Math.floor(Math.max(ax,bx,cx)-.5)),y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(h-1,Math.floor(Math.max(ay,by,cy)-.5));
    for(let y=y0;y<=y1;y++){for(let x=x0;x<=x1;x++){const px=x+.5-ax,py=y+.5-ay,u=(px*vy-py*vx)/det,v=(ux*py-uy*px)/det;if(u>=0&&v>=0&&u+v<=1){const d=az+u*(p[b+2]-az)+v*(p[c+2]-az),j=y*w+x;if(d<depth[j])depth[j]=d;}}}
  }
  const edges=new T.EdgesGeometry(g,36), E=edges.attributes.position.array,strokes=[];
  const tolerance=.18*Math.hypot(m[2],m[6],m[10]);
  for(let k=0;k<E.length;k+=6){const a=project(E[k],E[k+1],E[k+2]),b=project(E[k+3],E[k+4],E[k+5]);const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy);if(len<2)continue;const steps=Math.ceil(len/1.5);let start=-1;
    for(let j=0;j<=steps;j++){const t=(j+.5)/steps,x=a[0]+t*dx,y=a[1]+t*dy;
      const visible=j<steps&&x>=0&&x<w&&y>=0&&y<h&&a[2]+t*dz<=depth[Math.floor(y)*w+Math.floor(x)]+tolerance;
      if(visible&&start<0)start=j;if(!visible&&start>=0){if((j-start)*len/steps>=2)strokes.push('M'+(a[0]+dx*start/steps).toFixed(1)+' '+(a[1]+dy*start/steps).toFixed(1)+'L'+(a[0]+dx*j/steps).toFixed(1)+' '+(a[1]+dy*j/steps).toFixed(1));start=-1;}
    }
  }
  edges.dispose();g.dispose();return strokes.join('');
}
