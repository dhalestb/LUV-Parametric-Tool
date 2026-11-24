import type {AmphitheaterRequest,AmphitheaterSource} from './amphitheaterInteractiveTypes';

export function perimeterLayout(field:AmphitheaterRequest['field'],size:number,levels=2){
 const a=field.width/2-.75*size,b=field.depth/2-.75*size;
 const length=Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
 const base=Math.max(4,Math.ceil(length/(1.05*size)));
 return {a,b,length,base,total:base+(levels-1)*Math.max(4,Math.ceil(length/(1.06*size)))+3};
}
export function perimeterRoomSource(field:AmphitheaterRequest['field'],size:number,quantity:string,phase:number,levels=2,spacing=12){
 if(!Number.isFinite(size)||size<=0)throw Error('Enter a positive letter size.');
 const {a,b,base,total}=perimeterLayout(field,size,levels);
 if(![2,3,4].includes(levels)||!Number.isFinite(spacing)||spacing<=0)throw Error("Choose two to four perimeter levels and positive spacing.");
 const first=Math.min(spacing,field.height-(levels-1)*spacing-size*.15);
 if(first<7.5)throw Error("These levels do not fit. Increase field height, reduce spacing, or choose fewer levels.");
 const reserve=4*(levels-1)+3;
 if(Math.min(a,b)<size*.65)throw Error('Increase the field width or depth, or reduce letter size to leave room inside the perimeter.');
 const count=quantity==='auto'?total:Number(quantity);
 if(!Number.isSafeInteger(count)||count<base+reserve)throw Error('Use at least '+(base+reserve)+' letters for this perimeter, or select Automatic.');
 const bottom=Math.max(base,Math.min(count-reserve,Math.round((count-3)*base/(total-3))));
 const source:AmphitheaterSource[]=[];
 // Sample equal distances along the ellipse, including rectangular fields.
 const arcs=[0],segments=720,turn=2*Math.PI;
 for(let i=1;i<=segments;i++){const t=(i-.5)*turn/segments;arcs.push(arcs[i-1]+Math.hypot(a*Math.sin(t),b*Math.cos(t))*turn/segments);}
 for(const [level,n] of [bottom,...Array.from({length:levels-1},(_,i)=>Math.floor((count-bottom-3+i)/(levels-1)))].entries()){
  for(let i=0;i<n;i++){
   const s=((i/n+phase+(level?.25/n:0))%1)*arcs[segments];
   const j=Math.max(1,arcs.findIndex(v=>v>=s));
   const t=(j-1+(s-arcs[j-1])/(arcs[j]-arcs[j-1]))*turn/segments;
   const letter=(['U','L','V'] as const)[i%3];
   const tangent=Math.atan2(b*Math.cos(t),-a*Math.sin(t))*180/Math.PI;
   // Align the outer L stem or the right outer V flank with the perimeter.
   // The U bend points along local -Y, already outward at the tangent heading.
   const flank=letter==='L'?90:letter==='V'?-Math.atan2(.90,.31)*180/Math.PI:0;
   const oblique=5+5*Math.abs(Math.sin(i+phase*turn));
   const yaw=level===0?tangent+flank+(i%2?-oblique:oblique):tangent;
   source.push({letter,x:a*Math.cos(t),y:b*Math.sin(t),z:first+level*spacing-field.height/2,rz:yaw,rx:i%2?4:-4,ry:0,rotationOrder:'ZYX',scale:size/.92,scaleX:1,scaleY:1,scaleZ:1,levelIndex:level,architecturalRole:'perimeter'});
  }
 }
 for(let i=0;i<3;i++){const t=i*turn/3+phase*turn,r=.40*size;source.push({letter:(['L','U','V'] as const)[i],x:r*Math.cos(t),y:r*Math.sin(t),z:-field.height/2+size*.6,rx:90,ry:0,rz:t*180/Math.PI+90,rotationOrder:'ZYX',scale:size/.92,scaleX:1,scaleY:1,scaleZ:1,architecturalRole:'interior'});}
 return source;
}
