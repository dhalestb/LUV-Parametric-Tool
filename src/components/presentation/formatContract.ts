/** Approved formatting. Typology generators and rule content must not override this contract. */
export const PRESENTATION_FORMAT_VERSION='luv-presentation-format-v1-2026-11-25' as const;
export const PRESENTATION_EXPORT_WIDTHS=Object.freeze([2048,4096] as const);
export const SHARED_BOARD_RULES=Object.freeze({
 version:'gathering-presentation-2026-11-21',width:4096,height:5156,dpi:300,
 background:'#000000',font:'Arial, sans-serif',
 colors:Object.freeze({letters:'#D6AD4F',form:'#F7F6F5',rules:'#71BEDA'}),
 layout:Object.freeze({margin:.04,columnGap:.03,titleBaseline:.075,titleSize:.045,separatorY:.105,separatorWeight:.0007,contentTop:.12,rowPitch:1.05,panelHeadingY:.045,panelHeadingSize:.036}),
 camera:Object.freeze({occupancy:.86,elevation:.85,near:.01,farSpan:12}),
 material:Object.freeze({roughness:.85,creaseAngle:Math.PI/6,sourceContextOpacity:.105}),
 detail:Object.freeze({imageWidth:.36,textLeft:.38,headingSize:.03,bodySize:.026,firstLine:.052,lineSpacing:.044}),
});
export function assertPresentationExportWidth(width:number){
 if(!PRESENTATION_EXPORT_WIDTHS.some(w=>w===width))throw Error('Choose an approved PNG resolution: 2048 or 4096 pixels. Presentation formatting is locked.');
}
export async function assertCanonicalBoardPNG(blob:Blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 if(bytes.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))throw Error('Presentation export requires a PNG board.');
 if(view.getUint32(16)!==SHARED_BOARD_RULES.width||view.getUint32(20)!==SHARED_BOARD_RULES.height)throw Error('Presentation export requires the canonical 4096 × 5156 board.');
 let density=false;
 for(let at=8;at+12<=bytes.length;){const n=view.getUint32(at);if(at+n+12>bytes.length)throw Error('Incomplete board PNG.');
  if(String.fromCharCode(...bytes.subarray(at+4,at+8))==='pHYs')density=n===9&&view.getUint32(at+8)===11811&&view.getUint32(at+12)===11811&&bytes[at+16]===1;
  at+=n+12;
 }
 if(!density)throw Error('The canonical board must retain 300 ppi metadata.');
}
