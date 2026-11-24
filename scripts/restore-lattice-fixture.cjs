// Restore the byte-identical original fixture without overwriting local work.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, 'fixtures/original-obj/lattice-session.json.gz');
const manifest = JSON.parse(fs.readFileSync(archive + '.manifest.json', 'utf8'));
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const compressed = fs.readFileSync(archive);
if (digest(compressed) !== manifest.archiveSha256) throw new Error('Archive hash mismatch');
const original = zlib.gunzipSync(compressed);
if (digest(original) !== manifest.sourceSha256) throw new Error('Original fixture hash mismatch');
const destination = path.join(root, manifest.source);
if (fs.existsSync(destination)) {
  if (digest(fs.readFileSync(destination)) !== manifest.sourceSha256) {
    throw new Error('Existing checkpoint differs; refusing to overwrite it');
  }
} else {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, original, { flag: 'wx' });
}
console.log('Verified original fixture:', manifest.sourceSha256);
