const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const THREE = require('three');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText, filename);
const {drawingCamera, stepDownDirection, studioLights, meshBox} = require('../src/components/polygonExperiment/architectureViews.ts');

for (const angle of [0, 0.8, 2.4]) {
  const positions = [], cx = Math.cos(angle), cz = Math.sin(angle);
  for (let x = 0; x <= 120; x += 2) {
    const roof = x < 40 ? 48 : x < 80 ? 40 : 20;
    for (const z of [-20, 20]) for (const y of [0, roof]) {
      positions.push(1100 + x * cx - z * cz, 7 + y, -2200 + x * cz + z * cx);
    }
  }
  const mesh = {positions, indices: []}, side = stepDownDirection(mesh);
  const right = new THREE.Vector3(side.z, 0, -side.x);
  assert(right.dot(new THREE.Vector3(cx, 0, cz)) > 0.75, 'Step-down must read from left to right');
  assert.equal(side.y, 0);
  for (const view of ['Perspective', 'Plan', 'Side']) {
    const {camera} = drawingCamera([mesh], view, side, 1441 / 749);
    const point = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 3) {
      point.fromArray(positions, i).project(camera);
      assert(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) <= 1, 'Camera clipped a form');
    }
  }
  const rig = studioLights(meshBox(mesh), true, side);
  const key = rig.group.children.find(light => light.isDirectionalLight);
  assert(key.castShadow && key.position.clone().sub(key.target.position).dot(side) > 0, 'Visible facade needs direct light');
  rig.dispose();
}
console.log('Passed stepped elevation direction, camera containment and facade lighting for rotated, translated forms.');
