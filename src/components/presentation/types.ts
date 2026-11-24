export type MeshData={positions:readonly number[];indices:readonly number[]};
export type SavedObject={id:string;mesh:MeshData;sources?:readonly string[]};
export type SourcePose={letter:string;rx:number;ry:number;rz:number;[key:string]:unknown};
/** Presentation reads saved geometry. It has no generator or study-storage dependency. */
export type PresentationRecord={
 id:string;architecture:MeshData;letters:readonly SavedObject[];components:readonly SavedObject[];
 request:{field:{width:number;depth:number;height:number};source:readonly SourcePose[];typologyName?:string;envelopeVersion?:string;workspaceTypology?:string;sourceSnapshot?:unknown;[key:string]:unknown};
 sourceCount:number;perimeterWalls?:MeshData;roomShell?:MeshData;[key:string]:unknown;
};
export type PresentationCategory='gathering'|'workspace'|'lobby'|'other';
export type PresentationStudy={record:PresentationRecord;category:PresentationCategory;typology:string;title:string;originalId:string};
export type Iso='SE'|'SW'|'NE'|'NW'|'Pier';
export type PresentationOptions={view:'letters'|'form'|'orientation'|'generation'|'visibility'|'board';size:number;transparent:boolean;iso:Iso;ruleSource:string};
export function adaptPresentationRecord(value:unknown,context?:{category?:PresentationCategory;typology?:string;title?:string}):PresentationStudy{
 const record=value as PresentationRecord;
 if(!record?.id||!record.architecture?.indices?.length||!Array.isArray(record.letters)||!Array.isArray(record.request?.source))throw Error('Presentation requires an existing saved mesh and source configuration.');
 if(!Array.isArray(record.components)||!record.request.field||Object.values(record.request.field).some(n=>!Number.isFinite(n)||n<=0))throw Error('Presentation requires saved components and positive field dimensions.');
 if(record.sourceCount!==record.letters.length||record.sourceCount!==record.request.source.length)throw Error('Saved source and displayed letter counts do not match.');
 const category=context?.category??(record.request.workspaceTypology||record.request.envelopeVersion==='workspace-ten-rule'?'workspace':record.request.proof?'lobby':record.request.envelopeVersion?'gathering':'other');
 const typology=context?.typology??record.request.workspaceTypology??record.request.envelopeVersion??record.request.typologyName??'unregistered';
 return {record,category,typology,title:context?.title??record.request.typologyName??typology,originalId:record.id};
}
