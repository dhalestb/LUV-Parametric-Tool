import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LOBBY_FINALS,LOBBY_ARCHIVE_SHA256} from '../components/lobby-final/registry';
export const LOBBY_FINAL_ASSETS={study:'study.json',architecture:'architecture.json',summary:'summary.json',reference:'reference-isometric.png'} as const;
export async function readLobbyFinal(study:string,asset:string) {
 const entry=LOBBY_FINALS.find(s=>String(s.number)===study||s.id===study||s.lobbyStudyId===study||s.architectureStudyId===study);
 if(!entry||!Object.prototype.hasOwnProperty.call(LOBBY_FINAL_ASSETS,asset))return null;
 const file=LOBBY_FINAL_ASSETS[asset as keyof typeof LOBBY_FINAL_ASSETS];
 const bytes=await readFile(path.join(process.cwd(),'data/lobby-final-studies/v1',entry.folder,file));
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==entry.files[file].sha256)throw Error('Original Lobby asset failed integrity verification.');
 return {entry,bytes,digest,file,archive:LOBBY_ARCHIVE_SHA256};
}

