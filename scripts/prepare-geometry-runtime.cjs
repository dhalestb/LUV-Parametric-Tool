// Same-origin browser ESM/WASM assets from the installed dependency, unmodified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const packageRoot=path.join(root,'node_modules/manifold-3d');
const info=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8'));
assert.equal(info.version,'3.5.3','Review browser runtime path when updating the installed dependency');
const destination=path.join(root,'public/geometry-runtime',`manifold-${info.version}`);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assets=['manifold.js','manifold.wasm'].map(name=>({name,bytes:fs.readFileSync(path.join(packageRoot,name))}));
fs.mkdirSync(destination,{recursive:true});
for(const {name,bytes}of assets){
  const output=path.join(destination,name);
  if(fs.existsSync(output))assert.equal(hash(fs.readFileSync(output)),hash(bytes),'Do not overwrite a differing runtime asset');
  else fs.writeFileSync(output,bytes,{flag:'wx'});
}
const manifest=JSON.stringify({package:info.name,version:info.version,assets:assets.map(a=>({name:a.name,sha256:hash(a.bytes),bytes:a.bytes.length}))},null,2);
const file=path.join(destination,'manifest.json');
if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),manifest);else fs.writeFileSync(file,manifest,{flag:'wx'});
console.log('Prepared unchanged browser geometry runtime',destination);
