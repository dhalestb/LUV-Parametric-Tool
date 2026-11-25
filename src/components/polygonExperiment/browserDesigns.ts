import type { OrientationResult } from './orientationStore';

export type BrowserDesign = {
  architecture: {
    id: string;
    parentOrientationId: string;
    parentGeometryHash: string;
    geometryHash: string;
    exports?: { nativeObj: string; worldObj: string };
  };
  nativeObj?: string;
  worldObj?: string;
};

function openDesigns() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('luv-site-architectural-designs-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('designs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readBrowserDesign(parentId: string): Promise<BrowserDesign | undefined> {
  const db = await openDesigns();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('designs').objectStore('designs').get(parentId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveBrowserDesign(
  orientation: OrientationResult,
  reference: {id: string; geometryHash: string},
  result: BrowserDesign,
) {
  const {architecture} = result;
  if (architecture.id !== reference.id || architecture.geometryHash !== reference.geometryHash ||
      architecture.parentOrientationId !== orientation.id || architecture.parentGeometryHash !== orientation.geometryHash ||
      (architecture.exports && (!result.nativeObj || !result.worldObj))) {
    throw Error('The returned architecture or exports do not match the saved source geometry.');
  }
  const db = await openDesigns();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('designs', 'readwrite');
      transaction.objectStore('designs').add(result, orientation.id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function removeAllocatedArchitectures(ids:string[]){
  const database=await openDesigns();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('designs','readwrite');
    for(const id of ids)tx.objectStore('designs').delete(id);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
  });}finally{database.close();}
}

export function downloadDesignRecord(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
