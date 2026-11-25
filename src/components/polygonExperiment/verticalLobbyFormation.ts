import type {CrossSection,Manifold,ManifoldToplevel} from 'manifold-3d';
import {lobbyStack} from './allocatedDesign';
import {automaticLetterTarget,maxLetterTarget} from './model';
import {candidates,projectMesh,siteMesh,type FormationPart,type Letter,type PlanLayer} from './continuousFormation';
import type {HeightBand} from './compositionHeights';
import type {Point,Ring} from './territories';
import hashes from './vertical-lobby-stacks.json';

const typology='vertical-void-lobby';
type Mesh=Letter['mesh'];
type Station={point:Point;radius:number};

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

export async function formVerticalLobby(api:ManifoldToplevel,domain:CrossSection,origin:Point,datum:number,
  label:Point,clustering:number,cap:number,bands:HeightBand[],target?:number){
  const letterTarget=target??automaticLetterTarget(domain.area());
  if(!Number.isInteger(letterTarget)||letterTarget<2||letterTarget>maxLetterTarget)
    throw Error('Vertical Void Lobby needs a target between 2 and '+maxLetterTarget+' letters.');
  const owned:{delete():void}[]=[];
  function own<T extends {delete():void}>(s:T){owned.push(s);return s;}
  const stations:Station[]=[],letters:Letter[]=[],parts:FormationPart[]=[],layers:PlanLayer[]=[];
  const solids:Manifold[]=[],projections:CrossSection[]=[];
  const stacks:{key:string;sha256:string;center:Point;fieldHeight:number;count:number}[]=[];
  const pool=candidates(domain,label);
  const contours=(area:CrossSection):Ring[]=>area.toPolygons().map(r=>r.map(([x,z])=>[origin[0]+x,origin[1]+z]));
  function fits(outline:CrossSection,low:HeightBand[],dx:number,dz:number){
    const located=outline.translate([dx,dz]),outside=located.subtract(domain);
    try{
      return outside.area()<=1e-8&&low.every(b=>{
        const overlap=located.intersect(b.section),area=overlap.area();overlap.delete();return area<=1e-8;
      });
    }finally{outside.delete();located.delete();}
  }
  try{
    // A continuous lobby floor joins the native stacks to adjoining territories.
    const floor=own(domain.extrude(.75));
    solids.push(floor);
    layers.push({name:'Lobby floor',typology,top:.75,contours:contours(domain)});
    while(letterTarget-letters.length>=2){
      const remaining=letterTarget-letters.length;
      const count=Math.ceil(remaining/Math.ceil(remaining/10));
      const score=(p:Point)=>{
        const centrality=Math.hypot(p[0]-label[0],p[1]-label[1]);
        if(!stations.length)return -centrality;
        const nearest=Math.min(...stations.map(s=>Math.hypot(p[0]-s.point[0],p[1]-s.point[1])-s.radius));
        return nearest-centrality*clustering/100;
      };
      const ranked=pool.map(p=>({p,score:score(p)})).sort((a,b)=>b.score-a.score).map(v=>v.p);
      const variants=[];
      for(const fieldHeight of [60,40,20]){
        if(fieldHeight>Math.max(20,cap))continue;
        const study=await lobbyStack(fieldHeight,count);
        const native=own(toSolid(api,study.architecture));
        if(native.status()!=='NoError'||native.isEmpty())throw Error('Invalid native Vertical Void Lobby solid.');
        const bottom=native.boundingBox().min[2],height=study.height-bottom;
        if(height>cap+.00001)continue;
        const outline=own(new api.CrossSection([study.envelope],'NonZero'));
        const radius=Math.max(...study.envelope.map(([x,y])=>Math.hypot(x-study.center[0],y-study.center[1])));
        variants.push({study,native,bottom,outline,radius,fieldHeight,low:bands.filter(b=>b.cap+.00001<height)});
      }
      let added=false;
      // Choose the station by clustering first, then the tallest fitting native stack there.
      for(const point of ranked){
        const chosen=variants.find(({study,outline,radius,low})=>
          stations.every(s=>Math.hypot(point[0]-s.point[0],point[1]-s.point[1])>=radius+s.radius+2)
          &&fits(outline,low,point[0]-study.center[0],point[1]-study.center[1]));
        if(!chosen)continue;
        const {study,native,bottom,fieldHeight,radius}=chosen;
        const at={point,radius,dx:point[0]-study.center[0],dz:point[1]-study.center[1]};
        const placed=own(native.translate([at.dx,at.dz,-bottom]));
        const prefix=typology+'/stack-'+(stations.length+1)+'/';
        const translation=[origin[0]+at.dx,datum-bottom,origin[1]+at.dz];
        const sources=study.letters.map(l=>{
          const positions=l.mesh.positions.map((v,i)=>v+translation[i%3]);
          return {...l,id:prefix+l.id,mesh:{positions,indices:l.mesh.indices}};
        });
        solids.push(placed);stations.push(at);letters.push(...sources);
        parts.push({id:prefix+'envelope',sources:sources.map(l=>l.id),mesh:siteMesh(placed,origin,datum)});
        for(const l of sources)projections.push(own(projectMesh(api,l.mesh,origin)));
        const peak=placed.boundingBox().max[2];
        for(const fraction of [.1,.5,.9]){
          const top=peak*fraction;
          layers.push({name:prefix+'section',typology,top,contours:contours(own(placed.slice(top)))});
        }
        const key=fieldHeight+'-'+count;
        stacks.push({key,sha256:(hashes as Record<string,string>)[key],center:[origin[0]+at.point[0],origin[1]+at.point[1]],fieldHeight,count});
        added=true;break;
      }
      if(!added)break;
    }
    if(!stacks.length)throw Error('No native Vertical Void Lobby stack fits the territory and height limits.');
    parts.unshift({id:typology+'/floor',sources:letters.map(l=>l.id),mesh:siteMesh(floor,origin,datum)});
    const solid=own(api.Manifold.union(solids));
    if(solid.status()!=='NoError'||solid.isEmpty())throw Error('Vertical Void Lobby could not be joined to the site floor.');
    const plan=own(projectMesh(api,siteMesh(solid,origin,datum),origin));
    const outside=own(plan.subtract(domain)).area(),missing=own(domain.subtract(plan)).area();
    if(Math.max(outside,missing)>Math.max(.01,domain.area()*1e-6))throw Error('Vertical Void Lobby footprint differs from its allocation.');
    return {solid:solid.translate([0,0,0]),letters,parts,layers,stacks,letterTarget,sourceArea:own(api.CrossSection.union(projections)).area(),
      footprintArea:plan.area(),outside,missing,height:solid.boundingBox().max[2]};
  }finally{for(const s of owned.reverse())s.delete();}
}
