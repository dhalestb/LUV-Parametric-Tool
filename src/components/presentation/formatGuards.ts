import type {RuleDetail} from './ruleIllustrations';
type Metrics={measureText:(text:string)=>{width:number;actualBoundingBoxDescent?:number}};
export function assertLockedLine(ctx:Metrics,text:string,width:number,label:string){
 if(typeof text!=='string'||/[\r\n]/.test(text)||ctx.measureText(text).width>width+.01)throw Error(label+' exceeds its fixed presentation frame. Shorten the wording; font sizes and illustration positions remain fixed.');
}
/** Same word wrapping as the approved renderer; no automatic font-size reduction. */
export function lockedTextLines(ctx:Metrics,text:string,width:number){
 const lines:string[]=[];let line='';
 for(const word of text.split(/\s+/)){
  if(ctx.measureText(word).width>width+.01)throw Error('A rule word exceeds the fixed text column. Use shorter wording.');
  const trial=line?line+' '+word:word;
  if(line&&ctx.measureText(trial).width>width){lines.push(line);line=word;}else line=trial;
 }
 if(line)lines.push(line);return lines;
}
export function assertLockedTextBottom(ctx:Metrics,lines:string[],y:number,lineHeight:number,bottom:number){
 const descent=ctx.measureText('gj').actualBoundingBoxDescent??lineHeight*.25;
 if(lines.length&&y+(lines.length-1)*lineHeight+descent>bottom+.01)throw Error('Rule text exceeds its fixed presentation panel. Shorten or group the rules, or use a separate board. Font sizes and illustration positions remain fixed.');
}
export function assertRuleContent(details:{orientation:RuleDetail[];generation:RuleDetail[]}){
 if(details.orientation.length<1||details.orientation.length>2||details.generation.length<1||details.generation.length>3)throw Error('The locked board supports up to two orientation details and three generation details. Group related rules or use a separate board.');
 for(const detail of [...details.orientation,...details.generation]){
  if(!detail.heading?.trim()||!Array.isArray(detail.bullets)||detail.bullets.some(b=>typeof b!=='string'||!b.trim()))throw Error('Rule details require a heading and readable rule text.');
  if(detail.layers.some(l=>!['letters','form','rules'].includes(l.color)||l.opacity!==undefined&&(!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1))||detail.lines?.some(l=>!['letters','rules'].includes(l.color)))throw Error('Rule illustrations must use the approved presentation color roles and valid transparency.');
 }
}
