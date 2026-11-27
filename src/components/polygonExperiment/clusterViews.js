import * as T from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {geometryFor,meshBox,studioLights} from './architectureViews';
import {loadSiteFromArrayBuffer,scaleRootToFeet,miamiParcelScale} from '../siteDevelopment/siteImport';
import {readSiteGeometryCache} from '../siteDevelopment/siteGeometryCache';

const V=(...v)=>new T.Vector3(...v);
const canvas=(width,height)=>Object.assign(document.createElement('canvas'),{width,height});
export function clusterViews(all){
const obj=all.map(zone=>zone.mesh);
function pathOf(rings,project){const path=new Path2D();for(const r of rings){r.forEach((pt,i)=>path[i?'lineTo':'moveTo'](...project(pt)));path.closePath();}return path;}
function makeForm(i,outline,mode){
  const m=obj[i],g=toCreasedNormals(geometryFor(m),Math.PI/7),z=all[i],ctx=canvas(1,1).getContext('2d');
  // The slab tops are deliberately planar. Keep their exact face normals while
  // allowing the shading normals to interpolate across the curved wall facets.
  const points=g.attributes.position.array,normals=g.attributes.normal.array;
  for(let i=0;i<points.length;i+=9){
    if(Math.abs(points[i+1]-points[i+4])>.0001||Math.abs(points[i+4]-points[i+7])>.0001)continue;
    const ny=Math.sign((points[i+5]-points[i+2])*(points[i+6]-points[i])-(points[i+3]-points[i])*(points[i+8]-points[i+2]));
    if(ny)for(let j=0;j<9;j+=3){normals[i+j]=0;normals[i+j+1]=ny;normals[i+j+2]=0;}
  }
  const levels=new Map();
  for(const layer of z.layers.filter(l=>/seating terrace|performance platforms|continuous gallery walk|atrium walk|gallery pad|contour terrace/i.test(l.name))){
    const part=z.parts.find(p=>p.id===layer.typology+'/'+layer.name);if(!part)continue;
    const n=part.mesh.positions;let top=-Infinity;for(let j=1;j<n.length;j+=3)top=Math.max(top,n[j]);
    const key=Math.round(top*1000);if(!levels.has(key))levels.set(key,new Path2D());levels.get(key).addPath(pathOf(layer.contours,p=>p));}
  const pos=g.attributes.position.array,col=new Float32Array(pos.length),base=new T.Color('#F7F6F5'),blue=new T.Color('#71BEDA');
  for(let j=0;j<pos.length;j+=9){let color=base;const mask=levels.get(Math.round(pos[j+1]*1000));
    if(mode!=='plan'&&mask&&Math.abs(pos[j+1]-pos[j+4])<.0002&&Math.abs(pos[j+1]-pos[j+7])<.0002){
    const cx=(pos[j]+pos[j+3]+pos[j+6])/3,cz=(pos[j+2]+pos[j+5]+pos[j+8])/3;
    if([0,3,6].every(k=>ctx.isPointInPath(mask,pos[j+k]*.998+cx*.002,pos[j+k+2]*.998+cz*.002,'evenodd'))&&ctx.isPointInPath(mask,cx,cz,'evenodd'))color=blue;}
    for(let k=0;k<9;k+=3)color.toArray(col,j+k);}
  g.setAttribute('color',new T.BufferAttribute(col,3));const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:false,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});const form=new T.Mesh(g,mat);form.castShadow=form.receiveShadow=true;
  if(outline){const edges=new T.LineSegments(new T.EdgesGeometry(g,38),new T.LineBasicMaterial({color:'#3C4649',transparent:true,opacity:.32,depthWrite:false}));form.add(edges);}
  return form;}
function fit(ms,dir,up,aspect){const right=V().crossVectors(up,dir).normalize(),vert=V().crossVectors(dir,right),box=new T.Box3();ms.forEach(m=>box.union(meshBox(m)));const center=box.getCenter(V()),p=V();let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;for(const m of ms)for(let k=0;k<m.positions.length;k+=3){p.fromArray(m.positions,k).sub(center);const x=p.dot(right),y=p.dot(vert);loX=Math.min(loX,x);hiX=Math.max(hiX,x);loY=Math.min(loY,y);hiY=Math.max(hiY,y);}
  center.addScaledVector(right,(hiX+loX)/2).addScaledVector(vert,(hiY+loY)/2);return {center,h:Math.max(hiY-loY,(hiX-loX)/aspect)*1.066,box};}
async function view(name,w,h,index,mode){
  const c=canvas(w,h),cx=c.getContext('2d'),scene=new T.Scene();scene.background=new T.Color(0);const site=mode==='site',indices=index===null?all.map((_,i)=>i):[index],meshes=indices.map(i=>site?all[i].mesh:obj[i]);
  for(const i of indices){const f=site?new T.Mesh(geometryFor(all[i].mesh),new T.MeshStandardMaterial({color:'#F7F6F5',roughness:1,flatShading:true})):makeForm(i,mode==='persp',mode);f.castShadow=f.receiveShadow=true;scene.add(f);}
  if(site){
    const s=all[0].site, ref=s.modelReference;
    const miami=ref?ref.id==='miami-waterfront':s.name==='Miami waterfront study';
    const cache=await readSiteGeometryCache().catch(()=>null);
    let bytes,filename;
    if(cache&&ref&&[cache.sampleId,cache.filename,cache.filename.replace(/\.glb$/i,'')].includes(ref.id)){
      bytes=cache.buffer; filename=cache.filename;
    } else if(miami){
      const response=await fetch('/samples/miami-waterfront.glb');
      if(!response.ok)throw Error('Could not load the Miami site context.');
      bytes=await response.arrayBuffer(); filename='miami-waterfront.glb';
    } else throw Error('Open the matching site model in Site Development before exporting.');
    const {root,info}=await loadSiteFromArrayBuffer(bytes,filename);
    const declared=ref?.scale??s.coordinates.feetPerModel;
    const scale=miami?miamiParcelScale(info,all.map(z=>z.zone),declared)??miamiParcelScale(info,all.map(z=>z.zone),1):declared;
    if(!scale)throw Error('The architecture does not align with the selected site model.');
    scaleRootToFeet(root,scale);scene.add(root);
  }
  const sideDir=i=>{
    const ordinal=all[i].site.zones.findIndex(z=>z.id===all[i].zone.id);
    const yaw=(ordinal===0?337.5:22.5)*Math.PI/180;
    return V(Math.sin(yaw),0,Math.cos(yaw));
  };
  const dir=mode==='side'?sideDir(index):mode==='plan'?V(0,1,0):site?V(.9,.75,.9).normalize():V(1.0,1.32,1.72).normalize(),up=mode==='plan'?V(1,0,0):V(0,1,0);
  const fitOne=fit(meshes,dir,up,w/h),box=fitOne.box,center=fitOne.center;
  let worldH=fitOne.h;
  if(index!==null)worldH=Math.max(...obj.map((m,i)=>fit([m],mode==='side'?sideDir(i):dir,up,w/h).h));
  const radius=box.getBoundingSphere(new T.Sphere()).radius;
  let cam;
  if(site||mode==='persp'){cam=new T.PerspectiveCamera(site?32:29,w/h,2,9000);const right=V().crossVectors(up,dir).normalize(),v=V().crossVectors(dir,right),tan=Math.tan(cam.fov*Math.PI/360),p=V();let distance=10;for(const m of meshes)for(let j=0;j<m.positions.length;j+=3){p.fromArray(m.positions,j).sub(center);distance=Math.max(distance,p.dot(dir)+Math.max(Math.abs(p.dot(right))/(w/h),Math.abs(p.dot(v)))/tan);}cam.position.copy(center).addScaledVector(dir,distance*(site?1.16:1.045));}
  else{cam=new T.OrthographicCamera(-worldH*w/h/2,worldH*w/h/2,worldH/2,-worldH/2,1,radius*6);if(mode==='side')center.y=box.min.y+worldH*.41;cam.position.copy(center).addScaledVector(dir,radius*3);}
  cam.up.copy(up);cam.lookAt(center);cam.updateProjectionMatrix();cam.updateMatrixWorld();
  const project=p=>{const n=p.clone().project(cam);return [(n.x+1)*w/2,(1-n.y)*h/2,n.z];};
  const right=V().crossVectors(up,dir).normalize(),calibration=[project(center),project(center.clone().addScaledVector(right,50))];
  const cameraMatrix=new T.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse).toArray();
  const sourceBarPixels=calibration[1][0]-calibration[0][0];
  const rig=studioLights(box,true,mode==='side'?dir:undefined);
  if(mode==='plan'){for(const light of rig.group.children)if(light.isHemisphereLight){light.color.set('#ffffff');light.groundColor.set('#909090');light.intensity=.94;}}
  for(const light of rig.group.children)if(light.isDirectionalLight){light.shadow.mapSize.set(4096,4096);light.intensity=2.05;light.shadow.radius=1.5;}scene.add(rig.group);
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setPixelRatio(1);
  // A depth pass gives local ambient occlusion. In linear eye depth, nearby
  // foreground samples darken only the recessed surface, across a finite radius.
  const depthMat=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});const rt=new T.WebGLRenderTarget(1,1,{minFilter:T.NearestFilter,magFilter:T.NearestFilter});
  const post=new T.Scene(),quad=new T.ShaderMaterial({uniforms:{d:{value:rt.texture},sz:{value:new T.Vector2()},nearFar:{value:new T.Vector2(cam.near,cam.far)},pers:{value:cam.isPerspectiveCamera?1:0},radius:{value:(mode==='plan'?1.5:mode==='side'?5/3:2)*21}},vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`#include <packing>
  varying vec2 uv0;uniform sampler2D d;uniform vec2 sz,nearFar;uniform float pers,radius;
  float dep(vec2 u){float s=unpackRGBAToDepth(texture2D(d,u));return pers>.5? -perspectiveDepthToViewZ(s,nearFar.x,nearFar.y):-orthographicDepthToViewZ(s,nearFar.x,nearFar.y);}
  void main(){float z=dep(uv0),ao=0.;for(int i=0;i<16;i++){float f=float(i),r=radius*(.3+.7*fract(f*.618)),a=f*2.39996;float delta=z-dep(uv0+vec2(cos(a),sin(a))*r/sz);ao+=smoothstep(.20,1.8,delta)*(1.-smoothstep(4.,12.,delta));}gl_FragColor=vec4(vec3(1.-.36*ao/16.),1.);}`});post.add(new T.Mesh(new T.PlaneGeometry(2,2),quad));const camera2=new T.Camera();
  const tile=1400,guard=64;for(let y=0;y<h;y+=tile)for(let x=0;x<w;x+=tile){const tw=Math.min(tile,w-x),th=Math.min(tile,h-y),left=Math.max(0,x-guard),top=Math.max(0,y-guard),ww=Math.min(w,x+tw+guard)-left,hh=Math.min(h,y+th+guard)-top;renderer.setSize(ww,hh,false);cam.setViewOffset(w,h,left,top,ww,hh);renderer.setRenderTarget(null);renderer.render(scene,cam);renderer.shadowMap.autoUpdate=false;cx.drawImage(renderer.domElement,x-left,y-top,tw,th,x,y,tw,th);
    if(!site){rt.setSize(ww,hh);quad.uniforms.sz.value.set(ww,hh);scene.overrideMaterial=depthMat;scene.background.set(0xffffff);renderer.setRenderTarget(rt);renderer.render(scene,cam);scene.overrideMaterial=null;scene.background.set(0);renderer.setRenderTarget(null);renderer.render(post,camera2);cx.globalCompositeOperation='multiply';cx.drawImage(renderer.domElement,x-left,y-top,tw,th,x,y,tw,th);cx.globalCompositeOperation='source-over';}}
  renderer.dispose();renderer.forceContextLoss();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});rt.dispose();depthMat.dispose();quad.dispose();post.children[0].geometry.dispose();rig.dispose();
  return {canvas:c,name,width:w,height:h,worldH,cameraMatrix,calibration,sourceBarPixels,zone:index===null?null:all[index].zone.id,baseFraction:mode==='side'?.91:null};}

return view;
}
