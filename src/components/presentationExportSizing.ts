import {pngWithDpi,type ExportView} from './amphitheaterPresentationExport';
import {SHARED_BOARD_RULES} from './presentation/rules';
import {assertPresentationExportWidth,assertCanonicalBoardPNG} from './presentation/formatContract';

/** Export dimensions only. The approved board layout remains at its canonical size. */
export function presentationExportDimensions(view:ExportView,width:number){
 assertPresentationExportWidth(width);
 return {width,height:view==='board'?Math.round(width*SHARED_BOARD_RULES.height/SHARED_BOARD_RULES.width):width};
}

/** Keep the canonical PNG byte-for-byte; resize a separate export copy on request. */
export async function sizeBoardPNG(blob:Blob,width:number){
 const dimensions=presentationExportDimensions('board',width);
 await assertCanonicalBoardPNG(blob);
 if(width===SHARED_BOARD_RULES.width)return blob;
 const image=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
  const context=canvas.getContext('2d');if(!context)throw Error('PNG export canvas is unavailable.');
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
  const resized=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('PNG export failed.')),'image/png'));
  return pngWithDpi(resized,SHARED_BOARD_RULES.dpi);
 }finally{image.close();}
}
