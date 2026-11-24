'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { gunzipSync } = require('node:zlib');

const root = resolve(__dirname, '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const file = name => readFileSync(join(root, name));
const json = name => JSON.parse(file(name));

async function verify() {
  const registry = json('src/components/polygonExperiment/registry-data.json');
  const bindings = registry.items.flatMap(item => [...item.A.bindings, ...item.B.bindings]);
  for (const binding of bindings) {
    assert.equal(sha256(file(binding.sourceFile)), binding.sha256, binding.sourceFile);
  }
  require('./polygon-plate-edge-proof.cjs').authenticate();
  require('./authentic-polygon-domain.cjs').authenticate();
  require('./room-polygon-domain.cjs').authenticate();
  require('./void-polygon-domain.cjs').authenticate();

  require('../vendor/typology-proof-20261121/proof/rule-amphitheater.cjs');
  const { importSite } = require('../src/components/polygonExperiment/model.ts');
  const { visibilityStatus } = require('../src/components/polygonExperiment/orientationPresentation.ts');
  const manifest = json('fixtures/site-development-checkpoint/manifest.json');
  const archive = file(manifest.checkpoint);
  assert.equal(sha256(archive), manifest.sha256);
  const decoded = gunzipSync(archive);
  assert.equal(sha256(decoded), manifest.decodedSha256);

  const { orientations, localStorage } = JSON.parse(decoded);
  const library = JSON.parse(localStorage['luv-experiment-polygon-alternatives-v1']);
  const site = await importSite(localStorage['vul-site-development-v1'], 'file');
  assert.equal(site.coordinates.feetPerModel, 1);
  assert.equal(site.zones.find(zone => zone.id === 'zone-1-1210').polygon.length, 6);
  assert.equal(orientations.length, manifest.orientationCount);
  assert.equal(library.designs.length, manifest.designCount);
  assert.equal(library.items.length, manifest.territoryAlternativeCount);

  for (const orientation of orientations) {
    assert.equal(sha256(JSON.stringify(orientation.components)), orientation.geometryHash, orientation.id);
  }
  for (const entry of manifest.assets) {
    const bytes = file(entry.asset);
    assert.equal(sha256(bytes), entry.sha256, entry.asset);
    const geometry = JSON.parse(bytes);
    assert.equal(geometry.geometryHash, entry.architectureHash);
    assert.equal(geometry.parentOrientationId, entry.id);
    const record = library.designs.find(design => design.id === entry.id);
    assert.equal(record.publishedAt, entry.publishedAt);
    if (record.publishedAt) {
      const orientation = orientations.find(record => record.id === entry.id);
      const view = { id: entry.id, siteVisible: true, letters: true, organizing: true, boundaries: true };
      const result = visibilityStatus(view, orientation, site.zones, site);
      assert(result.visible, result.message);
    }
  }
  const proof = json('public/experiment-inputs/shared-site-rule-proof-v1.json');
  assert.equal(sha256(file('public/samples/miami-waterfront.glb')), proof.source.modelSha256);
  console.log('Verified ' + bindings.length + ' rule bindings, ' + orientations.length + ' orientations and ' + manifest.assets.length + ' saved architecture files.');
}

verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
