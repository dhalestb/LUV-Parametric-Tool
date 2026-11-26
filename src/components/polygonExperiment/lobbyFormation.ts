import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {lobbyStudy,lobbyStudyHashes} from './allocatedDesign';
import {automaticLetterTarget,maxLetterTarget,type LobbyTypology,type RegistryItem} from './model';
import {candidates,projectMesh,siteMesh,type FormationPart,type Letter,type PlanLayer} from './continuousFormation';
import {developLobbyTerritory,type LobbyStation} from './lobbyTerritory';
import type {HeightBand} from './compositionHeights';
import type {Point,Ring} from './territories';

const layouts={
  'vertical-void-lobby':{name:'Vertical Void Lobby',unit:'stack',collection:'stacks',limit:10,heights:[60,40,20],headings:[0]},
  'compressed-sequential-lobby':{name:'Compressed Sequential Lobby',unit:'sequence',collection:'sequences',limit:15,heights:[20],headings:[0,90,45,135,30,60,120,150]},
  'linear-gallery-lobby':{name:'Linear Gallery Lobby',unit:'gallery',collection:'galleries',limit:15,heights:[20],headings:[0,90,45,135,30,60,120,150]},
  'topographic-ground-field-lobby':{name:'Topographic Lobby',unit:'field',collection:'fields',limit:15,heights:[60,40,20],headings:[0,90,45,135,30,60,120,150]},
} satisfies Record<LobbyTypology,{name:string;unit:string;collection:string;limit:number;heights:number[];headings:number[]}>;
type Mesh=Letter['mesh'];

function toSolid(api:ManifoldToplevel,mesh:Mesh){
  // Invert the saved Y-up site conversion to recover the native Z-up solid.
  const vertices=new Float32Array(mesh.positions.length),triangles=new Uint32Array(mesh.indices.length);
  for(let i=0;i<vertices.length;i+=3){
    vertices.set([mesh.positions[i],mesh.positions[i+2],mesh.positions[i+1]],i);
  }
  for(let i=0;i<triangles.length;i+=3){
    triangles.set([mesh.indices[i],mesh.indices[i+2],mesh.indices[i+1]],i);
  }
  const packed=new api.Mesh({numProp:3,vertProperties:vertices,triVerts:triangles});
  packed.merge();
  return new api.Manifold(packed);
}

// Distribute group centers across the sampled territory, snapping each centroid
// to an interior sample so a target cannot fall into a courtyard or gap.
function distributionCenters(samples:Point[], groups:number):Point[] {
  const distance=(a:Point,b:Point)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
  const centers=[samples[0]];
  while(centers.length<groups){
    let farthest=samples[0],best=-1;
    for(const p of samples){
      const nearest=Math.min(...centers.map(c=>distance(c,p)));
      if(nearest>best){best=nearest;farthest=p;}
    }
    centers.push(farthest);
  }
  for(let pass=0;pass<5;pass++){
    const cells=centers.map(()=>[] as Point[]);
    for(const p of samples){
      let nearest=0;
      for(let i=1;i<centers.length;i++)if(distance(p,centers[i])<distance(p,centers[nearest]))nearest=i;
      cells[nearest].push(p);
    }
    cells.forEach((cell,i)=>{
      if(!cell.length)return;
      const mean:Point=[0,0];
      for(const p of cell){mean[0]+=p[0]/cell.length;mean[1]+=p[1]/cell.length;}
      centers[i]=cell.reduce((best,p)=>distance(p,mean)<distance(best,mean)?p:best);
    });
  }
  return centers;
}

export async function formLobby(typology:LobbyTypology,api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,
  label:Point,clustering:number,cap:number,bands:HeightBand[],rule:RegistryItem,target:number|undefined,distributed:boolean,extend:boolean){
  const {name,limit}=layouts[typology];
  const letterTarget=target??automaticLetterTarget(domain.area());
  if(!Number.isInteger(letterTarget)||letterTarget<2||letterTarget>maxLetterTarget)
    throw Error(name+' needs a target between 2 and '+maxLetterTarget+' letters.');
  const motifSize=typology==='vertical-void-lobby'||typology==='topographic-ground-field-lobby'?3:4;
  const minimum=Math.ceil(letterTarget/limit);
  const preferred=distributed?Math.max(1,Math.floor(letterTarget/motifSize)):minimum;
  let bestCount=0;
  for(let groups=preferred;groups>=minimum;groups--){
    const layout=await tryLobbyLayout(typology,api,domain,origin,datum,label,clustering,cap,bands,rule,letterTarget,distributed,groups,extend);
    if(!('placedCount' in layout))return layout;
    bestCount=Math.max(bestCount,layout.placedCount??0);
  }
  throw Error(name+' placed '+bestCount+' of '+letterTarget+' letters in the available layouts. Reduce the letter target or increase its territory.');
}

// Narrow territories may fit fewer, longer native sequences. Each attempt starts
// from the original Rule A and B study and retains the full letter target.
async function tryLobbyLayout(typology:LobbyTypology,api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,
  label:Point,clustering:number,cap:number,bands:HeightBand[],rule:RegistryItem,letterTarget:number,distributed:boolean,groupCount:number,extend:boolean){
  const {name,unit,collection,limit:groupLimit,heights,headings}=layouts[typology];
  const footprintCutFeet=1; // Above the 0.75 ft shared floor, measured from the site datum.
  const owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(s:T){owned.push(s);return s;}
  const stations:LobbyStation[]=[],letters:Letter[]=[],parts:FormationPart[]=[],layers:PlanLayer[]=[];
  const solids:Manifold[]=[],projections:CrossSection[]=[],clearances:CrossSection[]=[];
  const placements:{headingDegrees?:number;key:string;sha256:string;center:Point;fieldHeight:number;count:number}[]=[];
  const pool=candidates(domain,label);
  const centers=distributed?distributionCenters(pool,groupCount):[];
  const contours=(area:CrossSection):Ring[]=>area.toPolygons().map(r=>r.map(([x,z])=>[origin[0]+x,origin[1]+z]));
  function fits(outline:CrossSection,low:HeightBand[],dx:number,dz:number){
    const located=outline.translate([dx,dz]),outside=located.subtract(domain);
    try{
      if(outside.area()>1e-8)return false;
      for(const prior of clearances){
        const overlap=located.intersect(prior),area=overlap.area();overlap.delete();
        if(area>1e-8)return false;
      }
      return low.every(b=>{
        const overlap=located.intersect(b.section),area=overlap.area();overlap.delete();return area<=1e-8;
      });
    }finally{outside.delete();located.delete();}
  }
  try{
    const floor=extend?own(domain.extrude(.75)):undefined;
    if(floor){
      solids.push(floor);
      layers.push({name:'Lobby floor',typology,top:.75,contours:contours(domain)});
    }
    while(letterTarget-letters.length>=2){
      const remaining=letterTarget-letters.length;
      const groupsLeft=distributed?groupCount-stations.length:Math.ceil(remaining/groupLimit);
      const count=Math.ceil(remaining/groupsLeft);
      const score=(p:Point)=>{
        if(distributed){
          const center=centers[stations.length];
          return -Math.hypot(p[0]-center[0],p[1]-center[1]);
        }
        const centrality=Math.hypot(p[0]-label[0],p[1]-label[1]);
        if(!stations.length)return -centrality;
        const nearest=Math.min(...stations.map(s=>Math.hypot(p[0]-s.point[0],p[1]-s.point[1])-s.radius));
        return nearest-centrality*clustering/100;
      };
      const ranked=pool.map(p=>({p,score:score(p)})).sort((a,b)=>b.score-a.score).map(v=>v.p);
      const variants=[];
      for(const fieldHeight of heights){
        if(fieldHeight>Math.max(20,cap))continue;
        const study=await lobbyStudy(typology,fieldHeight,count);
        const native=own(toSolid(api,study.architecture));
        if(native.status()!=='NoError'||native.isEmpty())throw Error('Invalid native '+name+' solid.');
        const bottom=native.boundingBox().min[2],height=study.height+study.datum-bottom;
        if(height>cap+.00001)continue;
        const outline=own(new api.CrossSection([study.envelope],'NonZero'));
        const radius=Math.max(...study.envelope.map(([x,y])=>Math.hypot(x-study.center[0],y-study.center[1])));
        for(const angle of headings){
          const radians=angle*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
          const [x,z]=study.center;
          const center:Point=[cos*x-sin*z,sin*x+cos*z];
          variants.push({study,native,bottom,outline:angle?own(outline.rotate(angle)):outline,radius,fieldHeight,
            angle,cos,sin,center,low:bands.filter(b=>b.cap+.00001<height)});
        }
      }
      let added=false;
      // Choose the station by clustering first, then the tallest fitting native stack there.
      for(const point of ranked){
        const chosen=variants.find(({center,outline,radius,low})=>
          (distributed||stations.every(s=>Math.hypot(point[0]-s.point[0],point[1]-s.point[1])>=radius+s.radius+2))
          &&fits(outline,low,point[0]-center[0],point[1]-center[1]));
        if(!chosen)continue;
        const {study,native,bottom,fieldHeight,radius,angle,cos,sin,center}=chosen;
        const at={point,radius,dx:point[0]-center[0],dz:point[1]-center[1]};
        if(distributed){
          const boundary=own(chosen.outline.translate([at.dx,at.dz]));
          clearances.push(own(boundary.offset(2)));
        }
        const oriented=angle?own(native.rotate([0,0,angle])):native;
        const placed=own(oriented.translate([at.dx,at.dz,-bottom]));
        const prefix=typology+'/'+unit+'-'+(stations.length+1)+'/';
        const translation=[origin[0]+at.dx,datum-bottom,origin[1]+at.dz];
        const sources=study.letters.map(l=>{
          const positions=l.mesh.positions.map((v,i)=>v+translation[i%3]);
          if(angle)for(let i=0;i<positions.length;i+=3){
            const x=l.mesh.positions[i],z=l.mesh.positions[i+2];
            positions[i]=cos*x-sin*z+translation[0];
            positions[i+2]=sin*x+cos*z+translation[2];
          }
          return {...l,id:prefix+l.id,mesh:{positions,indices:l.mesh.indices}};
        });
        solids.push(placed);letters.push(...sources);
        const upper=own(placed.trimByPlane([0,0,1],footprintCutFeet+.01));
        const footprint=own(projectMesh(api,siteMesh(upper,origin,datum),origin));
        // Retain the checkpoint's actual floor elevations and its longitudinal
        // shell profile when continuing a stack or a sequence into the site.
        const peak=placed.boundingBox().max[2];
        const levels=study.letters.map(l=>{
          let top=0;
          for(let i=1;i<l.mesh.positions.length;i+=3)top=Math.max(top,l.mesh.positions[i]-bottom);
          return top;
        }).sort((a,b)=>a-b);
        if(extend&&typology==='compressed-sequential-lobby'){
          const axial=own(native.rotate([0,-90,0])),box=native.boundingBox();
          for(let i=0;i<levels.length;i++){
            const x=box.min[0]+(i+.5)/levels.length*(box.max[0]-box.min[0]);
            const profile=own(axial.slice(x));
            levels[i]=profile.isEmpty()?peak:-profile.bounds().min[0]-bottom;
          }
        }
        stations.push({...at,heading:angle,peak,levels,footprint,prefix,sources:sources.map(l=>l.id)});
        parts.push({id:prefix+'envelope',sources:sources.map(l=>l.id),mesh:siteMesh(placed,origin,datum)});
        for(const l of sources)projections.push(own(projectMesh(api,l.mesh,origin)));
        if(!extend){
          const base=own(projectMesh(api,siteMesh(placed,origin,datum),origin));
          layers.push({name:prefix+'projected envelope',typology,top:0,contours:contours(base)});
        }
        for(const fraction of [.1,.5,.9]){
          const top=peak*fraction;
          layers.push({name:prefix+'section',typology,top,contours:contours(own(placed.slice(top)))});
        }
        const key=fieldHeight+'-'+count;
        placements.push({key,...(headings.length>1?{headingDegrees:angle}:{}),sha256:lobbyStudyHashes[typology][key],center:[origin[0]+at.point[0],origin[1]+at.point[1]],fieldHeight,count});
        added=true;break;
      }
      if(!added)break;
    }
    if(distributed&&letters.length!==letterTarget)return {placedCount:letters.length};
    if(!placements.length)throw Error('No native '+name+' fits the territory and height limits.');
    if(floor){
      developLobbyTerritory(api,typology,domain,stations,bands,cap,origin,datum,own,solids,parts,layers,
        Number(rule.A.parameters.preferredFeet),Number(rule.B.parameters.platformThicknessFeet??rule.B.parameters.wallThicknessFeet));
      parts.unshift({id:typology+'/floor',sources:letters.map(l=>l.id),mesh:siteMesh(floor,origin,datum)});
    }
    const solid=own(api.Manifold.union(solids));
    if(solid.status()!=='NoError'||solid.isEmpty())throw Error(name+' produced invalid architectural geometry.');
    // Measure built architecture in the finished mesh independently of the 0.75 ft joining floor.
    const architecture=extend?own(solid.trimByPlane([0,0,1],footprintCutFeet)):solid;
    const plan=own(projectMesh(api,siteMesh(architecture,origin,datum),origin));
    const outside=own(plan.subtract(domain)).area(),missing=own(domain.subtract(plan)).area();
    if(Math.max(outside,extend?missing:0)>Math.max(.01,domain.area()*1e-6))throw Error(name+' architecture differs from its allocation ('+missing.toFixed(3)+' ft² missing, '+outside.toFixed(3)+' ft² outside).');
    return {solid:solid.translate([0,0,0]),letters,parts,layers,placements,collection,letterTarget,sourceArea:own(api.CrossSection.union(projections)).area(),
      footprintCutFeet:extend?footprintCutFeet:undefined,footprintArea:plan.area(),outside,missing,height:solid.boundingBox().max[2]};
  }finally{for(const s of owned.reverse())s.delete();}
}
