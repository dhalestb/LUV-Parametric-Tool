import { searchAssignmentCopies, type AssemblyTestMode, type AssignmentResult, type AssignmentSearchOptions } from "./assignmentSearch";
import { initializeExtensionReconstruction } from "./extensionReconstruction";
import { geometryRevision } from "./geometryRevision";
import type { TileModel, LatticeField } from "./types";
export type AssignmentWorkerRequest={models:TileModel[];count:1|2|3|4|8;mode:AssemblyTestMode;field:LatticeField;seedIds:string[];options:AssignmentSearchOptions};
export type AssignmentWorkerResponse={kind:"progress";message:string;percent?:number}|{kind:"result";result:AssignmentResult}|{kind:"error";message:string};
const scope=self as unknown as {onmessage:((event:MessageEvent<AssignmentWorkerRequest>)=>void)|null;postMessage:(message:AssignmentWorkerResponse)=>void};
let active=false;
let previousGeometry=new Map<string,NonNullable<TileModel["connectionSurface"]>>();
const equal=(a:ArrayLike<number>,b:ArrayLike<number>)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))return false;return true;};
scope.onmessage=event=>{if(active)return;active=true;const request=event.data;
  // Reuse ONLY exact private geometry copies across completed jobs. All new
  // placement, orientation, voxel, scoring and connection parameters remain
  // those of the incoming request, and connectors are validated freshly.
  let reusedSourceGeometries=0;const nextGeometry=new Map<string,NonNullable<TileModel["connectionSurface"]>>();
  for(const model of request.models){const surface=model.connectionSurface;if(!surface)continue;const old=previousGeometry.get(model.id);
    if(old&&equal(old.positions,surface.positions)&&equal(old.triangles,surface.triangles)){model.connectionSurface=old;reusedSourceGeometries++;}
    nextGeometry.set(model.id,model.connectionSurface!);
  }
  previousGeometry=nextGeometry;
  const guards=request.models.map(m=>m.connectionSurface?geometryRevision(m.connectionSurface):null);
  void (async()=>{
    if(request.models.some(m=>m.sourceResponsiveExtensions))await initializeExtensionReconstruction();
    const result=await searchAssignmentCopies(request.models,request.count,{cancelled:()=>false,onProgress:(message,percent)=>scope.postMessage({kind:"progress",message,percent})},request.mode,request.field,request.models.filter(m=>request.seedIds.includes(m.id)),new Set(request.models.map(m=>m.id)),request.options);
    if(!request.models.every((m,i)=>!m.connectionSurface||geometryRevision(m.connectionSurface)===guards[i]))throw new Error("Worker source geometry changed; result rejected");
    result.execution={environment:"browser module worker",reusedSourceGeometries};scope.postMessage({kind:"result",result});
  })().catch(error=>scope.postMessage({kind:"error",message:error instanceof Error?error.message:String(error)})).finally(()=>{active=false;});
};
