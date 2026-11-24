// Phase C1: execute frozen Rule A only. No finished OBJ inputs or Rule B calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),V=path.join(ROOT,'vendor/architectural-board');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const registry=require(path.join(ROOT,'src/components/polygonExperiment/registry-data.json')).items[0];
function authenticate(){for(const b of [...registry.A.bindings,...registry.B.bindings])if(hash(fs.readFileSync(path.join(ROOT,b.sourceFile)))!==b.sha256)throw Error('Frozen rule identity mismatch: '+b.sourceFile);}
function ringArea(r){return r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;}
function positive(r){return ringArea(r)>0?r:[...r].reverse();}
function validateRing(r){if(!Array.isArray(r)||r.length<3||r.length>1000||!r.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||Math.abs(ringArea(r))<1e-6)throw Error('Invalid boundary ring');
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let i=0;i<r.length;i++)for(let j=i+2;j<r.length;j++){if(i===0&&j===r.length-1)continue;const a=r[i],b=r[(i+1)%r.length],c=r[j],d=r[(j+1)%r.length];if(cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1])))throw Error('Self-intersecting boundary');}}
async function native(recipe,seed,spacing,rotationSeed=189,field,nativeOptions){authenticate();require(path.join(V,'proof/rule-amphitheater.cjs'));
 if(!['print-contour','perimeter-20'].includes(recipe))throw Error('Unsupported Rule A recipe');
 const evidence=registry.evidence.find(e=>e.variant===(recipe==='print-contour'?'print-contour':'receiver-v3'));
 const request=structuredClone(evidence.request);if(field)request.field={...request.field,...field};if(nativeOptions?.fieldInsetFeet!==undefined)request.linearGallery.footprint.inset=nativeOptions.fieldInsetFeet;request.source=[];request.linearGallery.seed=seed;request.linearGallery.nominalSpacing=spacing;
 if(recipe==='print-contour'){request.sourceSnapshot={rotationSeed};await require(path.join(V,'scripts/linear-gallery-automatic.cjs')).arrangeMixed(request);}
 else {request.linearGallery.footprint={mode:'automatic',inset:1};const a=require(path.join(V,'src/components/linearGalleryPerimeter.ts')).perimeterStudy(request.field,13,request.linearGallery,20);request.source=a.source;request.sourceSnapshot={linearGallery:request.linearGallery,stations:a.stations,layers:a.layers,perimeterJoints:a.perimeterJoints,empty:a.empty};}
 const letters=require(path.join(V,'scripts/source-envelope.cjs')).derive(request).letters;
 return {request,letters,evidenceId:evidence.id};
}
async function generate(input){
 const started=performance.now(),{site,zoneId,recipe='print-contour',seed=2101342521,spacing=13,heading=0,datum=0,rotationSeed=189,reserved=[]}=input;
 if(!site||site.coordinates?.unitAssumption!=='confirmed')throw Error('Source units unresolved: confirm authentic units or explicitly choose the verified fixture.');
 if(!site.protectionMetadataComplete)throw Error('Protection metadata incomplete');
 if(!Number.isSafeInteger(rotationSeed)||rotationSeed<0||rotationSeed>4294967295||!Number.isSafeInteger(seed)||seed<0||seed>4294967295||![12,13,14,15].includes(spacing)||!Number.isFinite(heading)||Math.abs(heading)>360||!Number.isFinite(datum))throw Error('Invalid orientation controls');
 const zone=site.zones.find(z=>z.id===zoneId);if(!zone)throw Error('Source polygon missing');validateRing(zone.polygon);const region=input.generationRegion??zone.polygon;validateRing(region);
 const masks=[...(zone.holes||[]),...(site.exclusions||[]).map(p=>p.polygon),...(site.reservedAreas||[]).map(p=>p.polygon),...reserved.map(p=>p.polygon)];
 for(const c of site.corridors||[]){if(!Number.isFinite(c.widthFeet)||c.widthFeet<=0)throw Error('Invalid corridor');for(let i=1;i<c.points.length;i++){const a=c.points[i-1],b=c.points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),w=c.widthFeet/2;if(!len)continue;const ux=dx/len,uy=dy/len,nx=-uy*w,ny=ux*w;masks.push([[a[0]-ux*w+nx,a[1]-uy*w+ny],[a[0]-ux*w-nx,a[1]-uy*w-ny],[b[0]+ux*w-nx,b[1]+uy*w-ny],[b[0]+ux*w+nx,b[1]+uy*w+ny]]);}}
 masks.forEach(validateRing);
 const w=await require('manifold-3d/manifold.js').default();w.setup();const owned=[];const own=x=>(owned.push(x),x),section=r=>own(new w.CrossSection([positive(r)]));
 try{
 const outer=section(region),protectedRegion=own(w.CrossSection.union(masks.map(section))),basePermitted=own(outer.subtract(protectedRegion)),permitted=input.setbackFeet?own(basePermitted.offset(-input.setbackFeet)):basePermitted;
 if(permitted.area()<1e-6)throw Error('No permitted area remains');
 const {request,letters,evidenceId}=await native(recipe,seed,spacing,rotationSeed,input.adaptiveField,input.nativeOptions);
 const xs=region.map(p=>p[0]),ys=region.map(p=>p[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 const centers=[[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2]];
 for(let i=1;i<10;i++)for(let j=1;j<10;j++)centers.push([bounds[0]+(bounds[2]-bounds[0])*i/10,bounds[1]+(bounds[3]-bounds[1])*j/10]);
 const angles=[heading,...region.map((p,i)=>{const q=region[(i+1)%region.length];return Math.atan2(q[1]-p[1],q[0]-p[0])*180/Math.PI;})];
 const {width:W,depth:D}=request.field;let frame=null,attempts=0,bestOutside=Infinity;
 // Fit the unchanged authentic field, not a scaled letter array. Full field containment is conservative.
 for(const angle of [...new Set(angles)]){for(const center of centers){attempts++;const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),turn=([x,y])=>[center[0]+c*x-s*y,center[1]+s*x+c*y];const corners=[[-W/2,-D/2],[W/2,-D/2],[W/2,D/2],[-W/2,D/2]].map(turn);const f=new w.CrossSection([corners]),outside=f.subtract(permitted),area=outside.area();outside.delete();f.delete();bestOutside=Math.min(bestOutside,area);if(area<=1e-7){frame={center,angle,corners};break;}}if(frame)break;}
 if(!frame)throw Error(`No unchanged ${W} × ${D} ft field fits after ${attempts} placements. Minimum field outside/protected area ${bestOutside.toFixed(6)} ft². Letter sizes were not reduced.`);
 const rad=frame.angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),world=([x,y,z])=>[frame.center[0]+c*x-s*y,datum+z,frame.center[1]+s*x+c*y];
 let outsideArea=0,maxElevationError=0,triangles=0;const components=[];
 for(let i=0;i<letters.length;i++){
 const {id,mesh}=letters[i],pose=request.source[i],station=request.sourceSnapshot.stations[i],positions=[],indices=[];
 for(let k=0;k<mesh.positions.length;k+=3)positions.push(...world(mesh.positions.slice(k,k+3)));
 // Board -> site is a reflection (X,Y,Z -> X,Z,Y); reverse every triangle winding.
 for(let k=0;k<mesh.indices.length;k+=3)indices.push(mesh.indices[k],mesh.indices[k+2],mesh.indices[k+1]);
 const projected=[];for(let k=0;k<indices.length;k+=3){const t=indices.slice(k,k+3).map(j=>[positions[j*3],positions[j*3+2]]);if(Math.abs(ringArea(t))>1e-10)projected.push(positive(t));}
 const coverage=new w.CrossSection(projected,'NonZero'),outside=coverage.subtract(permitted);outsideArea+=outside.area();outside.delete();coverage.delete();triangles+=indices.length/3;
 const lo=[0,1,2].map(a=>Math.min(...Array.from({length:positions.length/3},(_,j)=>positions[j*3+a]))),hi=[0,1,2].map(a=>Math.max(...Array.from({length:positions.length/3},(_,j)=>positions[j*3+a])));
 maxElevationError=Math.max(maxElevationError,Math.abs(lo[1]-datum-station.bottom),Math.abs(hi[1]-datum-station.top));
 components.push({id,letter:pose.letter,pose,nominalSizeFeet:pose.scale*.92,bounds:{min:lo,max:hi},mesh:{positions,indices}});
 }
 if(outsideArea>1e-6||maxElevationError>1e-6)throw Error('Complete mesh validation failed');
 const counts={L:0,U:0,V:0};request.source.forEach(p=>counts[p.letter]++);
 const geometryHash=hash(components),sourceGeometryHash=hash({polygon:zone.polygon,holes:zone.holes,exclusions:site.exclusions,corridors:site.corridors,reservedAreas:site.reservedAreas,reserved});
 return {version:1,id:hash({geometryHash,sourceGeometryHash,recipe,seed,spacing,heading,datum}),kind:'orientation-only',mode:'rule-driven',allocation:{'linear-edge-gallery':100},descriptorDistribution:false,descriptorSpatialTargeting:false,site,zoneId,sourceGeometryHash,parameters:{recipe,seed,rotationSeed,spacing,heading,datum,field:request.field,settings:request.linearGallery},frame,components,counts,geometryHash,stations:request.sourceSnapshot.stations,layers:request.sourceSnapshot.layers.map(l=>({...l,world:l.vertices.map(p=>world([...p,l.nominal]))})),organizingEdges:request.sourceSnapshot.stations.map(st=>({id:st.id,points:st.edge.map(p=>world([...p,st.bottom]))})),provenance:{A:registry.A.bindings,B:{...registry.B,executed:false},evidenceId,rotationSeedNote:recipe==='print-contour'?'Saved output records 55 degrees but omits its rotation seed. Default 189 is a reconstructed seed producing 55 degrees through the unchanged native formula; not claimed as the original seed.':null,entry:recipe==='print-contour'?'linear-gallery-automatic.cjs#arrangeMixed':'linearGalleryPerimeter.ts#perimeterStudy (explicit 20-letter proof recipe)',glyphHash:hash(fs.readFileSync(path.join(V,'src/components/letterGeometry3d.ts'))),nativeMeshHash:hash(letters),request},validation:{outsideArea,maxElevationError,triangles,attempts,grossArea:outer.area(),permittedArea:permitted.area(),protectedArea:outer.area()-permitted.area(),milliseconds:performance.now()-started},limitations:['Rule A source volumes only; no architectural walls, floors or circulation.','Fixed authentic field fitting is conservative; failure is not proof no free-form layout exists.',...(counts.U===0?['This authentic print-contour variant contains L and V; U count is zero.']:[])]};
 }finally{owned.reverse().forEach(x=>x.delete());}
}
module.exports={generate,native,hash};
if(require.main===module){let raw='';process.stdin.on('data',b=>raw+=b);process.stdin.on('end',async()=>{try{process.stdout.write(JSON.stringify(await generate(JSON.parse(raw))));}catch(e){process.stderr.write(e.message);process.exitCode=1;}});}

