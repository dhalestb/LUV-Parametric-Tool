// Study 135's floating wall bands connect letters on the same level.
// Keep the preserved sweep/seal calculations; constrain only their receivers.
const path=require('node:path'),Module=require('node:module'),load=Module._load,wrapped=new WeakSet();
const target=path.resolve(__dirname,'../vendor/gathering-preserved/scripts');
const compile=Module.prototype._compile,edge=path.join(target,'source-edge-envelope.cjs').toLowerCase();
Module.prototype._compile=function(code,file){
 if(file.toLowerCase()===edge){
  const before='const contacts=untrimmed.filter(other=>other.owner!==item.owner)',after="const contacts=untrimmed.filter(other=>other.owner!==item.owner&&(block.n.p.letter!=='U'||perimeters.find(p=>p.n.id===other.owner)?.n.p.levelIndex===block.n.p.levelIndex))";
  if(code.split(before).length!==2)throw Error('Incompatible preserved Plate contact-selection revision.');
  code=code.replace(before,after);
 }
 return compile.call(this,code,file);
};
Module._load=function(id,parent,...rest){const value=load.call(this,id,parent,...rest);let file;try{file=Module._resolveFilename(id,parent);}catch{return value;}
 if(typeof file!=='string'||wrapped.has(value))return value;
 if(file.toLowerCase()===path.join(target,'seal-curved-walls.cjs').toLowerCase()){
  const original=value.sealCurvedWalls;value.sealCurvedWalls=function(w,perimeters,solids,raw){const seams=[];for(const level of new Set(perimeters.map(p=>p.n.p.levelIndex)))seams.push(...original(w,perimeters.filter(p=>p.n.p.levelIndex===level),solids,raw));return seams;};wrapped.add(value);
 }
 if(file.toLowerCase()===path.join(target,'full-corner-joints.cjs').toLowerCase()){
  const original=value.sealOpposite;value.sealOpposite=function(w,blocks,solids,raw,seam){const panel=blocks.find(p=>p.n.id===seam.panel),wall=blocks.find(p=>p.n.id===seam.wall);if(panel.n.p.levelIndex!==wall.n.p.levelIndex)throw Error('Insufficient reverse U bearing');return original(w,blocks,solids,raw,seam);};wrapped.add(value);
 }
 return value;
};
