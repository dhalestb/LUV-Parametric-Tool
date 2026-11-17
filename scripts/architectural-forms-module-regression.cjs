const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');
const filename = path.resolve(__dirname, '../src/components/architectural-forms/moduleEnvelope.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const {moduleWorkflow, BASE_MODULE} = loaded.exports;
const mesh = {positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2],normals:[0,0,1,0,0,1,0,0,1],volume:2,area:.5};
const workflow = {source:mesh,intersections:mesh,bridges:mesh,variants:{letters:mesh,voids:mesh,combined:mesh},links:[{start:[0,0,0],end:[1,1,0]}]};
assert.equal(moduleWorkflow(workflow,[0,0,0],BASE_MODULE),workflow);
for (const axis of ['x','y']) {
  const expanded = moduleWorkflow(workflow,[0,0,0],{...BASE_MODULE,[axis]:2});
  assert.notEqual(expanded, workflow);
  assert.equal(expanded.source.volume,4);
  assert.equal(expanded.source.area,1);
  assert.equal(expanded.links[0].end[axis==='x'?0:1],12);
  assert.equal(expanded.variants.combined.volume,4);
}
assert.deepEqual(mesh.positions,[0,0,0,1,0,0,0,1,0]);
console.log('Architectural Forms X/Y expansion preserves the base and updates meshes, volumes, areas, and links.');
