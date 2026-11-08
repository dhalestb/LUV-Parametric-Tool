const assert=require('node:assert/strict');
const placements=Array.from({length:12},(_,z)=>({letter:'U',x:0,y:0,z:z*3,rx:0,ry:0,rz:0,scale:12,scaleX:1,scaleY:1,scaleZ:1}));
const body={workflow:true,placements,thickness:12,typology:'contained-room-within-volume',faceBridges:{enabled:false,gridDivisions:4,maxDistance:1.5,width:70,thickness:80,curvature:35,smoothness:62,maxConnections:4,direction:'all',mode:'all'}};
const send=(value,stream=false)=>fetch('http://127.0.0.1:3107/api/letter-intersections',{method:'POST',headers:{'Content-Type':'application/json',Accept:stream?'application/x-ndjson':'application/json'},body:JSON.stringify(value)});
const bounds=m=>[0,1,2].map(axis=>{const a=m.positions.filter((_,i)=>i%3===axis);return [Math.min(...a),Math.max(...a)]});
(async()=>{
 for(const h of [20,40,60]){
 const response=await send({...body,envelopeHeight:h},h===60);assert(response.ok,await response.clone().text());
 const data=h===60?(await response.text()).trim().split('\n').map(JSON.parse).find(e=>e.type==='result')?.data:await response.json();assert(data);
 const b=bounds(data.enclosure);assert.deepEqual(b.map(v=>Math.round(v[1]-v[0])),[20,20,h]);console.log('PASS API',h,'stream',h===60);
 if(h===60){const edit=await send({...body,envelopeHeight:h,workspaceEdits:{scales:placements.map(()=>1),mirror:[false,false,false],basePlacements:data.arrangement.placements,enclosureCenter:b.map(v=>(v[0]+v[1])/2)}});assert(edit.ok,await edit.clone().text());const d=await edit.json();assert.equal(Math.round(bounds(d.enclosure)[2][1]-bounds(d.enclosure)[2][0]),60);console.log('PASS editing retains 60 feet');}
 }
 assert.equal((await send({...body,envelopeHeight:80})).status,400);console.log('PASS invalid height rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
