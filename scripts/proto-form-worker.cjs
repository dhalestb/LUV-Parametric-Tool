require('./ts-test-register.cjs');
const fs=require('node:fs'),path=require('node:path'),T=require('three');
const {getLetterVolumeGeometry}=require('../src/components/letterGeometry3d.ts');
const request=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=path.resolve(process.argv[3]);
const v=(x,y,z)=>new T.Vector3(x,y,z);
function sourceLetters(r){
 return r.source.map((p,i)=>{
 const matrix=new T.Matrix4().compose(v(p.x,p.y,p.z+r.field.height/2),new T.Quaternion().setFromEuler(new T.Euler(...[p.rx,p.ry,p.rz].map(T.MathUtils.degToRad),p.rotationOrder??'XYZ')),v(p.scale*p.scaleX,p.scale*p.scaleY,p.scale*p.scaleZ));
 const g=getLetterVolumeGeometry(p.letter,12),attr=g.getAttribute('position'),positions=[],indices=[];
 for(let k=0;k<attr.count;k++){const q=new T.Vector3().fromBufferAttribute(attr,k).applyMatrix4(matrix);if(Math.abs(q.x)>r.field.width/2||Math.abs(q.y)>r.field.depth/2||q.z<0||q.z>r.field.height)throw Error('Letter '+(i+1)+' extends outside the selected field. Edit its pose or enlarge the field.');positions.push(...q.toArray());}
 for(let k=0;k<(g.index?.count??attr.count);k++)indices.push(g.index?g.index.getX(k):k);
 const id=p.letter+'-'+(i+1);return {id,mesh:{positions,indices}};
 });
}

(async()=>{
  const {buildOfficeWorkspace}=request.workspaceTypology==='open-hall-workspace'
    ?require('../src/components/workspace-rules/open-hall-workspace.geometry.ts')
    :require('../src/components/workspace-rules/flat-deep-plan-plate.geometry.ts');
  if(!request.workspacePlan||!request.letterArrangementReport||!request.architecturalGenerationReport)throw Error('Workspace generation requires a resolved plan plus letter-arrangement and architectural-generation reports.');
  const wasm=await require('manifold-3d/manifold.js').default();wasm.setup();
  const owned=[],own=solid=>(owned.push(solid),solid);
  try{
   const solids=buildOfficeWorkspace(wasm,request.workspacePlan,own);
   const lift=[0,0,request.field.height/2];
   const formBase=solids.form||solids.combined;
   const wallsBase=solids.walls;
   const combinedBase=solids.combined||formBase;
   if(!combinedBase||combinedBase.status()!=='NoError'||combinedBase.isEmpty())throw Error('Workspace plan did not produce valid solid geometry.');
   const formSolid=formBase?own(formBase.translate(lift)):null;
   const wallsSolid=wallsBase&&!wallsBase.isEmpty()?own(wallsBase.translate(lift)):null;
   const solid=own(combinedBase.translate(lift));
   const joinWalls=(request.workspaceTypology==='open-hall-workspace'&&request.openHall?.joinWalls===true)||(request.workspaceTypology==='flat-deep-plan-plate'&&request.flatPlate?.joinWalls===true);
   const toMesh=s=>{const mesh=s.getMesh(),positions=[];for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)positions.push(...mesh.vertProperties.slice(i,i+3));return {positions,indices:Array.from(mesh.triVerts)};};
   const architecture=toMesh(joinWalls?solid:(formSolid||solid));
   const perimeterWalls=!joinWalls&&wallsSolid?toMesh(wallsSolid):undefined;
   const {letters}={letters:sourceLetters(request)};
   const bounds=solid.boundingBox();
   const letterArrangementReport=request.letterArrangementReport;
   if(request.workspaceTypology==='open-hall-workspace'){
    const rule=letterArrangementReport.rules.find(item=>item.id==='LA-10');
    if(rule){
     const check=require('../src/components/workspace-rules/open-hall-workspace.ts').validateOpenHallGuidePlacement(request.workspacePlan,request.source,request.field);
     rule.status=check.status;rule.evidence=[check.detail];
     letterArrangementReport.overall=letterArrangementReport.rules.some(r=>r.hard&&r.status==='fail')?'fail':letterArrangementReport.rules.some(r=>r.hard&&r.status==='unverified')?'unverified':'pass';
    }
   }
   const architecturalGenerationReport=structuredClone(request.architecturalGenerationReport);
   if(request.workspaceTypology==='open-hall-workspace'){
    // Compare actual assembly against separately extruded planned components and voids.
    // These witnesses only validate; they never alter the generated geometry.
    const plan=request.workspacePlan, M=wasm.Manifold;
    const roofSizingAdjustment=request.openHall?.roofSizing==='pillar'
     ?'Increase the roof inward offset.'
     :'Reduce the fixed Roof L guide size.';
    const shape=(polygon,top,depth)=>{
     const signed=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
     return own(M.extrude([signed<0?[...polygon].reverse():polygon],depth).translate([0,0,top-depth]));
    };
    const volumeOf=(mesh,label)=>{
     if(mesh.status()!=='NoError'||mesh.isEmpty())throw Error(`Open Hall verification failed: ${label} is invalid or empty.`);
     return mesh.volume();
    };
    const checks=[];
    for(const plate of plan.plates){
     let top=plate.zTop, bottom=plate.zTop-plate.thickness;
     if(plate.role==='support'){
      const roofs=plan.plates.filter(p=>p.role==='roof');
      if(roofs.length)top=Math.max(top,...roofs.map(p=>p.zTop));
     }
     let expected=shape(plate.polygon,top,top-bottom);
     volumeOf(expected,plate.id+' witness');
     for(const hole of plan.voids.filter(v=>v.cut&&(!v.roles?.length||v.roles.includes(plate.role)))){
      const cutter=shape(hole.polygon,top+.05,top-bottom+.1);
      expected=own(expected.subtract(cutter));
      if(plate.role==='roof'&&expected.isEmpty())throw Error('Final workspace geometry failed the architectural generation ruleset. AG-08 The skylight cuts remove the entire roof slab. '+roofSizingAdjustment);
      volumeOf(expected,plate.id+' cut witness');
     }
     const missing=own(expected.subtract(combinedBase));
     if(missing.status()!=='NoError')throw Error(`Open Hall verification failed: cannot compare component ${plate.id}.`);
     const volume=missing.volume();
     checks.push({id:plate.id,volume,expected:expected.volume()});
    }
    const missing=checks.filter(x=>x.volume>Math.max(1e-6,x.expected*1e-6));
    const roof=plan.plates.find(p=>p.role==='roof');
    const skylights=[];
    if(roof)for(const hole of plan.voids.filter(v=>v.cut&&v.roles?.includes('roof'))){
     const probe=shape(hole.polygon,roof.zTop-.001,roof.thickness-.002);
     volumeOf(probe,hole.id+' probe');
     const occupied=own(probe.intersect(combinedBase));
     if(occupied.status()!=='NoError')throw Error(`Open Hall verification failed: cannot inspect ${hole.id}.`);
     skylights.push({id:hole.id,volume:occupied.volume(),expected:probe.volume()});
    }
    const blocked=skylights.filter(x=>x.volume>Math.max(1e-6,x.expected*1e-6));
    const skyRule=architecturalGenerationReport.rules.find(item=>item.id==='AG-08');
    if(skyRule){
     const ok=Boolean(roof)&&skylights.length>0&&!blocked.length;
     skyRule.status=skyRule.status==='fail'||!ok?'fail':'pass';
     skyRule.evidence.push(`Final geometry: ${skylights.length-blocked.length}/${skylights.length} planned skylight volumes clear through the roof slab; obstructed: ${blocked.map(x=>x.id).join(', ')||'none'}.`);
     if(skyRule.status==='fail')skyRule.evidence.push(roofSizingAdjustment);
    }
    const rule=architecturalGenerationReport.rules.find(item=>item.id==='AG-10');
    if(rule){
     const pieces=solid.decompose();
     const count=pieces.filter(piece=>!piece.isEmpty()&&piece.volume()>0).length;
     for(const piece of pieces)if(piece!==solid)piece.delete();
     rule.status=count===1&&!missing.length?'pass':'fail';
     rule.measured=String(count);rule.threshold='1';rule.units='connected solid components';
     rule.evidence=[`Final union contains ${count} connected component(s); ${checks.length-missing.length}/${checks.length} planned slab, pier, roof and wall solids are covered by final geometry. Missing material: ${missing.map(x=>x.id+' ('+x.volume.toFixed(4)+' ft³)').join(', ')||'none'}. Connectivity does not establish structural capacity.`];
    }
   }
   const hx=request.field.width/2,hy=request.field.depth/2,hz=request.field.height;
   const inside=bounds.min[0]>=-hx-1e-4&&bounds.max[0]<=hx+1e-4&&bounds.min[1]>=-hy-1e-4&&bounds.max[1]<=hy+1e-4&&bounds.min[2]>=-1e-4&&bounds.max[2]<=hz+1e-4;
   const spans=[bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1],bounds.max[2]-bounds.min[2]];
   const fieldSpan=`${request.field.width} × ${request.field.depth} × ${request.field.height} ft`;
   const solidSpan=spans.map(v=>v.toFixed(2)).join(' × ');
   const fieldEvidence=inside
    ?`Final solid bounds span ${solidSpan} ft inside the ${fieldSpan} field. No completed geometry was uniformly rescaled.`
    :`The final solid spans ${solidSpan} ft and extends outside the ${fieldSpan} field. Check the field dimensions and the generated component sizes.`;
   const bumpField=(report)=>{
    const rule=report.rules.find(item=>/field|envelope|containment/i.test(item.title)||item.id.startsWith('AG-01'));
    if(rule){rule.status=inside?'pass':'fail';rule.measured=`${spans.map(v=>v.toFixed(2)).join(' × ')}`;rule.threshold=`${request.field.width} × ${request.field.depth} × ${request.field.height}`;rule.units='ft';rule.evidence=[fieldEvidence];}
    report.overall=report.rules.some(item=>item.hard&&item.status==='fail')?'fail':report.rules.some(item=>item.hard&&item.status==='unverified')?'unverified':'pass';
   };
   const solidIsValid=solid.status()==='NoError'&&!solid.isEmpty()&&solid.volume()>0;
   if(request.workspaceTypology==='flat-deep-plan-plate'){
    const rule=architecturalGenerationReport.rules.find(item=>item.id==='AG-10');
    if(rule){
     rule.status=solidIsValid?'pass':'fail';
     rule.evidence=[solidIsValid
      ?`The final slab, pier and wall union has valid Manifold status and positive volume of ${solid.volume().toFixed(2)} ft³.`
      :'The final union failed the Manifold status, nonempty mesh, or positive-volume check.'];
    }
   }
   bumpField(architecturalGenerationReport);
   if(letterArrangementReport.overall==='fail')throw Error('Letter arrangement ruleset failed after plan resolution.');
   if(architecturalGenerationReport.overall==='fail'){
    const message='Final workspace geometry failed the architectural generation ruleset.';
    if(request.workspaceTypology!=='open-hall-workspace'&&request.workspaceTypology!=='flat-deep-plan-plate')throw Error(message);
    const failures=architecturalGenerationReport.rules
     .filter(rule=>rule.hard&&rule.status==='fail')
     .map(rule=>`${rule.id} ${rule.title}. ${rule.evidence.filter(item=>!item.includes(' [pass]: ')).join(' ')}`);
    throw Error([message,...failures].join(' '));
   }
   if(!solidIsValid)throw Error('Workspace solid failed Manifold integrity checks.');
   const validation={passed:true,selfIntersectionPairs:0,nonAdjacentTriangleChecks:0,legacyFlags:0,method:'manifold-status-and-volume'};
   const unverified=[...letterArrangementReport.rules,...architecturalGenerationReport.rules].filter(rule=>rule.status==='unverified').map(rule=>rule.id);
   const components=[{id:'workspace-form',sources:letters.map(letter=>letter.id),mesh:architecture}];
   if(perimeterWalls)components.push({id:'workspace-walls',sources:[],mesh:perimeterWalls});
   const result={id:path.basename(out),created:new Date().toISOString(),request,generator:request.generator,letterArrangementReport,architecturalGenerationReport,architecture,perimeterWalls,letters,components,volume:solid.volume(),bounds,sourceCount:letters.length,architecturalValidation:{passed:architecturalGenerationReport.overall==='pass'&&letterArrangementReport.overall!=='fail',failures:unverified.map(id=>id+' is unverified')},validation,warnings:[`WORKSPACE DUAL RULESETS: ${request.workspacePlan.typology}; letter ${letterArrangementReport.rulesetId} v${letterArrangementReport.rulesetVersion}; architecture ${architecturalGenerationReport.rulesetId} v${architecturalGenerationReport.rulesetVersion}.`, `Source policy: ${letterArrangementReport.sourcePolicy}`, unverified.length?`Unverified rules retained: ${unverified.join(', ')}.`:'Measured letter-arrangement and architectural-generation rules passed on the plan and final envelope.','Mesh integrity checked via Manifold status/volume. Gathering BVH self-intersection scan is not applied to this workspace path.','Geometric proof only. Not certified for occupancy, circulation, accessibility, or structural compliance.']};
   if(request.workspaceTypology==='open-hall-workspace')result.warnings.push('Daylight and structural performance have not been evaluated.');
   fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result));return;
  }finally{for(const solid of owned.reverse())try{solid.delete();}catch{}}
})().catch(error=>{console.error(error);process.exitCode=1;});
