// Exact saved studies used for the user's approved Presentation PNGs.
// Opening a reference loads its saved result; it never samples or regenerates letters.
export const gatheringPresentationReferences = [
  {id:'1c16cdee-59af-4ca0-ad74-9695a120d4b8',name:'Stepped Amphitheater'},
  {id:'7f45b9b2-b404-4ce9-bab5-11997e124ed6',name:'Linear Edge Gallery'},
  {id:'51c37bd5-0170-47a5-8184-5961d97e7e3a',name:'Inserted Horizontal Plate · Study 135'},
  {id:'c1fbdb4a-6f45-4b98-86d3-0255b7fdab01',name:'Void-Field · four levels, face-normal walls'},
  {id:'72883ed3-ea47-4475-8172-3dc491735798',name:'Room Within Volume · joined top planks'},
] as const;

export type RoomTopJoint = 'none'|'full-rim'|'center'|'ring';
export function roomTopJoint(snapshot:unknown):RoomTopJoint {
  const value=(snapshot as {openTopPlanks?:unknown}|undefined)?.openTopPlanks;
  return value==='full-rim'||value==='center'?value:value?'ring':'none';
}
export function withRoomTopJoint(snapshot:unknown,joint:RoomTopJoint){
  return {...(snapshot as Record<string,unknown>|undefined),openTopPlanks:joint==='none'?undefined:joint==='ring'?true:joint};
}
