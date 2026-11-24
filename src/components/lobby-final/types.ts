export type SavedMesh = Readonly<{positions: readonly number[]; indices: readonly number[]}>;
export type OriginalSource = Readonly<{letter:'L'|'U'|'V'; x:number; y:number; z:number; rx:number; ry:number; rz:number; scale:number; scaleX:number; scaleY:number; scaleZ:number; rotationOrder?:'XYZ'|'ZYX'}>;
export type OriginalArchitecture = Readonly<{
 id:string; created:string; sourceCount:number; architecture:SavedMesh; primary:SavedMesh;
 letters:readonly Readonly<{id:string; mesh:SavedMesh}>[];
 components:readonly Readonly<{id:string; sources?:readonly string[]; mesh:SavedMesh}>[];
 request:Readonly<{source:readonly OriginalSource[]; field:{width:number;depth:number;height:number}; preferredFeet:number; sourceId:string; sourceName:string; [key:string]:unknown}>;
 validation:Readonly<{passed:boolean;selfIntersectionPairs:number;nonAdjacentTriangleChecks:number;legacyFlags:number}>;
 [key:string]:unknown;
}>;

