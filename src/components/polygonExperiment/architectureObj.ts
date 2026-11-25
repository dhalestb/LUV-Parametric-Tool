type FormMesh={name:string;positions:number[];indices:number[]};

export function objName(name:string){
  return name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'form';
}

// Coordinates and winding come directly from the saved Y-up architectural mesh.
export function architectureObj(forms:FormMesh[]):Blob{
  if(!forms.length)throw Error('Select a form to export.');
  const chunks:string[]=['# Polygon-Driven Architecture\n# Site coordinates in feet, Y up\n'];
  let offset=0;
  const names=new Set<string>();
  for(const {name,positions,indices} of forms){
    if(!positions?.length||positions.length%3||!indices?.length||indices.length%3)
      throw Error('Incomplete triangle mesh for '+name+'.');
    const vertexCount=positions.length/3;
    const base=objName(name);
    let object=base,suffix=2;
    while(names.has(object))object=base+'-'+suffix++;
    names.add(object);
    chunks.push('o '+object+'\n');
    let lines:string[]=[];
    function add(line:string){
      lines.push(line);
      if(lines.length===8192){chunks.push(lines.join('\n')+'\n');lines=[];}
    }
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))throw Error('Invalid vertex in '+name+'.');
      add('v '+x+' '+y+' '+z);
    }
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i],b=indices[i+1],c=indices[i+2];
      for(const index of [a,b,c]){
        if(!Number.isInteger(index)||index<0||index>=vertexCount)throw Error('Invalid face in '+name+'.');
      }
      add('f '+(offset+a+1)+' '+(offset+b+1)+' '+(offset+c+1));
    }
    if(lines.length)chunks.push(lines.join('\n')+'\n');
    offset+=vertexCount;
  }
  return new Blob(chunks,{type:'text/plain;charset=utf-8'});
}
