const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function digest(bytes,mode){return crypto.createHash('sha256').update(mode==='text-lf'?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex');}
function verifyPresentationLock(root=path.resolve(__dirname,'..'),read=fs.readFileSync){
 const manifest=JSON.parse(read(path.join(root,'presentation-format-lock.json'),'utf8')),failed=[];
 for(const item of manifest.files){const file=path.resolve(root,item.path);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Invalid presentation lock path.');try{if(digest(read(file),item.mode)!==item.sha256)failed.push(item.path);}catch{failed.push(item.path);}}
 if(failed.length)throw Error('Protected presentation formatting or saved evidence changed:\n'+failed.join('\n')+'\nKeep typology rules/content in their editable modules. Presentation template or baseline changes require the repository owner’s review and an explicit new format revision.');
 return {version:manifest.version,protectedFiles:manifest.files.length,formatFiles:manifest.files.filter(f=>f.group==='format').length,preservedAssets:manifest.files.filter(f=>f.group==='saved-evidence').length};
}
module.exports={digest,verifyPresentationLock};
if(require.main===module){try{console.log('PASS presentation format lock '+JSON.stringify(verifyPresentationLock()));}catch(e){console.error(e.message);process.exitCode=1;}}
