import * as THREE from 'three';
import type { AmphitheaterSource, ProofMesh, ProofObject } from './amphitheaterInteractiveTypes';
import { getLetterShape, getLetterVolumeGeometry, LINEAR_U_BOW_FT, LINEAR_U_OPENING_FT, LINEAR_U_WIDTH_FT, linearUBend, linearUInnerHalf } from './letterGeometry3d';
import type { Letter } from './letterTypes';

function boundsOf(positions: number[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    size: min.map((value, axis) => max[axis] - value),
    center: min.map((value, axis) => (value + max[axis]) / 2),
  };
}

/** Largest clear gap on a Z ray. For this shell that gap is the through opening. */
function openingOnZ(mesh: ProofMesh, x: number, y: number) {
  const { positions, indices } = mesh;
  const hits: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const vertex = (corner: number) => {
      const start = indices[index + corner] * 3;
      return [positions[start], positions[start + 1], positions[start + 2]];
    };
    const [a, b, c] = [vertex(0), vertex(1), vertex(2)];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const det = abx * acy - acx * aby;
    if (Math.abs(det) < 1e-9) continue;
    const px = x - a[0];
    const py = y - a[1];
    const u = (px * acy - acx * py) / det;
    const v = (abx * py - px * aby) / det;
    if (u < -1e-5 || v < -1e-5 || u + v > 1 + 1e-5) continue;
    hits.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
  }
  hits.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const hit of hits) if (!unique.length || hit - unique[unique.length - 1] > 0.05) unique.push(hit);
  let best: { low: number; high: number } | undefined;
  for (let index = 1; index < unique.length; index++) {
    const low = unique[index - 1];
    const high = unique[index];
    if (!best || high - low > best.high - best.low) best = { low, high };
  }
  return best;
}

/** Tallest clear opening at x, across the section. */
function openingAt(mesh: ProofMesh, x: number) {
  const bounds = boundsOf(mesh.positions);
  const low = bounds.center[1] - bounds.size[1] / 2;
  const high = bounds.center[1] + bounds.size[1] / 2;
  const step = Math.max((high - low) / 24, 0.25);
  let best: { low: number; high: number } | undefined;
  for (let y = low; y <= high + 1e-6; y += step) {
    const span = openingOnZ(mesh, x, y);
    if (span && (!best || span.high - span.low > best.high - best.low)) best = span;
  }
  return best;
}

/** Shortest through-opening along X. Letters have to clear this aperture. */
function controllingOpening(mesh: ProofMesh) {
  const bounds = boundsOf(mesh.positions);
  const low = bounds.center[0] - bounds.size[0] / 2;
  const high = bounds.center[0] + bounds.size[0] / 2;
  const step = Math.max((high - low) / 40, 0.5);
  let best: { low: number; high: number } | undefined;
  for (let x = low + step; x <= high - step; x += step) {
    const span = openingAt(mesh, x);
    if (!span || span.high - span.low < 1) continue;
    if (!best || span.high - span.low < best.high - best.low) best = span;
  }
  return best;
}

/** Clear height of the compressed void, in feet. The black end opening uses this same height. */
const COMPRESSED_MIN_CLEAR_HEIGHT = 10;
/** 1/8 in = 1 ft-0 in, so a 1/16 in model wall is 0.5 ft. */
const MODEL_WALL_FT = 0.5;

function zHits(mesh: ProofMesh, x: number, y: number) {
  const { positions, indices } = mesh;
  const hits: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const vertex = (corner: number) => {
      const start = indices[index + corner] * 3;
      return [positions[start], positions[start + 1], positions[start + 2]];
    };
    const [a, b, c] = [vertex(0), vertex(1), vertex(2)];
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const det = abx * acy - acx * aby;
    if (Math.abs(det) < 1e-9) continue;
    const px = x - a[0];
    const py = y - a[1];
    const u = (px * acy - acx * py) / det;
    const v = (abx * py - px * aby) / det;
    if (u < -1e-5 || v < -1e-5 || u + v > 1 + 1e-5) continue;
    hits.push(a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
  }
  hits.sort((left, right) => left - right);
  const unique: number[] = [];
  for (const hit of hits) if (!unique.length || hit - unique[unique.length - 1] > 0.05) unique.push(hit);
  return unique;
}

/** Open any compressed void shorter than the minimum until its clear height matches that minimum. */
function enforceCompressedClearHeight(architecture: ProofMesh): ProofMesh {
  const positions = architecture.positions.slice();
  const mesh = { positions, indices: architecture.indices };
  const bounds = boundsOf(architecture.positions);
  const xMin = bounds.center[0] - bounds.size[0] / 2;
  const xMax = bounds.center[0] + bounds.size[0] / 2;
  const zMin = bounds.center[2] - bounds.size[2] / 2;
  const zMax = bounds.center[2] + bounds.size[2] / 2;
  for (let pass = 0; pass < 5; pass += 1) {
    const sections: { x: number; outerLow: number; outerHigh: number; innerLow: number; innerHigh: number; newInnerLow: number; newInnerHigh: number; moved: boolean }[] = [];
    for (let x = xMin + 0.45; x <= xMax - 0.3; x += 0.7) {
      const hits = zHits(mesh, x, bounds.center[1]);
      if (hits.length < 4) continue;
      const outerLow = hits[0];
      const innerLow = hits[1];
      const innerHigh = hits[hits.length - 2];
      const outerHigh = hits[hits.length - 1];
      const clear = innerHigh - innerLow;
      if (clear < 0.4 || clear > bounds.size[2] * 0.92) continue;
      const targetClear = Math.max(clear, COMPRESSED_MIN_CLEAR_HEIGHT);
      let newInnerLow = (innerLow + innerHigh) / 2 - targetClear / 2;
      let newInnerHigh = newInnerLow + targetClear;
      if (newInnerLow - MODEL_WALL_FT < zMin + 0.15) { const shift = zMin + 0.15 + MODEL_WALL_FT - newInnerLow; newInnerLow += shift; newInnerHigh += shift; }
      if (newInnerHigh + MODEL_WALL_FT > zMax - 0.15) { const shift = newInnerHigh + MODEL_WALL_FT - (zMax - 0.15); newInnerLow -= shift; newInnerHigh -= shift; }
      const lowerWall = innerLow - outerLow;
      const upperWall = outerHigh - innerHigh;
      sections.push({ x, outerLow, outerHigh, innerLow, innerHigh, newInnerLow, newInnerHigh, moved: Math.abs(targetClear - clear) > 0.05 || Math.abs(lowerWall - MODEL_WALL_FT) > 0.05 || Math.abs(upperWall - MODEL_WALL_FT) > 0.05 });
    }
    if (!sections.some((section) => section.moved)) break;
    for (let index = 0; index < positions.length; index += 3) {
      let x = positions[index];
      const z = positions[index + 2];
      if (x > xMax - 0.35) x = xMax - 0.55;
      if (x < xMin + 0.35) x = xMin + 0.55;
      let left = sections[0];
      let right = sections[sections.length - 1];
      for (const section of sections) if (section.x <= x) left = section;
      for (const section of sections) if (section.x >= x) { right = section; break; }
      if (!left.moved && !right.moved) continue;
      const span = Math.max(right.x - left.x, 1e-6);
      const t = left === right ? 0 : Math.min(1, Math.max(0, (x - left.x) / span));
      const mix = (from: number, to: number) => from + (to - from) * t;
      const outerLow = mix(left.outerLow, right.outerLow);
      const outerHigh = mix(left.outerHigh, right.outerHigh);
      const innerLow = mix(left.innerLow, right.innerLow);
      const innerHigh = mix(left.innerHigh, right.innerHigh);
      const newInnerLow = mix(left.newInnerLow, right.newInnerLow);
      const newInnerHigh = mix(left.newInnerHigh, right.newInnerHigh);
      if (z < outerLow - 0.3 || z > outerHigh + 0.3) continue;
      let next: number;
      if (z <= innerLow) next = newInnerLow - MODEL_WALL_FT + Math.min(1, Math.max(0, (z - outerLow) / Math.max(innerLow - outerLow, 1e-6))) * MODEL_WALL_FT;
      else if (z >= innerHigh) next = newInnerHigh + Math.min(1, Math.max(0, (z - innerHigh) / Math.max(outerHigh - innerHigh, 1e-6))) * MODEL_WALL_FT;
      else next = newInnerLow + ((z - innerLow) / Math.max(innerHigh - innerLow, 1e-6)) * (newInnerHigh - newInnerLow);
      positions[index + 2] = Math.min(zMax - 0.15, Math.max(zMin + 0.15, next));
    }
  }
  return { ...architecture, positions };
}

/** Match the end opening width to the end letter, then set its clear height to the compressed minimum. */
function adjustOpeningToLetters(architecture: ProofMesh, letters: { center: number[]; size: number[]; scale: number[]; shift: number }[]): ProofMesh {
  const arch = boundsOf(architecture.positions);
  const xMax = arch.center[0] + arch.size[0] / 2;
  const ordered = [...letters].sort((left, right) => left.center[0] - right.center[0]);
  const positions = architecture.positions.slice();
  const opening = ordered[ordered.length - 1];
  if (opening) {
    const previous = ordered[ordered.length - 2];
    const x0 = previous ? (previous.center[0] + opening.center[0]) / 2 : opening.center[0] - opening.size[0];
    let lowY = Infinity;
    let highY = -Infinity;
    for (let index = 0; index < positions.length; index += 3) {
      if (positions[index] < xMax - 0.35) continue;
      lowY = Math.min(lowY, positions[index + 1]);
      highY = Math.max(highY, positions[index + 1]);
    }
    const openingY = highY - lowY;
    if (openingY > 0.4) {
      const scaleY = (opening.size[1] * opening.scale[1]) / openingY;
      const originY = (lowY + highY) / 2;
      const pad = 2.6;
      let lowZ = Infinity;
      let highZ = -Infinity;
      for (let index = 0; index < positions.length; index += 3) {
        if (positions[index] < xMax - 0.35) continue;
        lowZ = Math.min(lowZ, positions[index + 2]);
        highZ = Math.max(highZ, positions[index + 2]);
      }
      for (let index = 0; index < positions.length; index += 3) {
        const x = positions[index];
        const y = positions[index + 1];
        const z = positions[index + 2];
        if (x < x0 || y < lowY - pad || y > highY + pad || z < lowZ - pad || z > highZ + pad) continue;
        positions[index + 1] = originY + (y - originY) * scaleY;
      }
    }
  }
  return enforceCompressedClearHeight({ ...architecture, positions });
}

/** Scale letter solids up to the architecture cross-section. The flat end L is 8 ft on Z and keeps its plan size. The rightmost V is 75% of that fitted size. The compressed opening stays at least 10 ft clear, and the black end opening uses that height. */
export function fitLobbyLettersToArchitecture(letters: ProofObject[], architecture: ProofMesh): { letters: ProofObject[]; architecture: ProofMesh } {
  if (!letters.length || !architecture.positions.length) return { letters, architecture };
  const architectureSize = boundsOf(architecture.positions).size;
  const target = Math.min(architectureSize[1], architectureSize[2]);
  if (!(target > 0)) return { letters, architecture };
  const boxes = letters.map((letter) => boundsOf(letter.mesh.positions));
  const opening = controllingOpening(architecture);
  const flatIndex = boxes.reduce((best, box, index) => {
    if (!letters[index].id.startsWith('L-') || box.size[2] >= best.thickness) return best;
    return { index, thickness: box.size[2] };
  }, { index: -1, thickness: Infinity }).index;
  const markedV = boxes.reduce((best, box, index) => {
    if (!letters[index].id.startsWith('V-') || box.center[0] <= best.x) return best;
    return { index, x: box.center[0] };
  }, { index: -1, x: -Infinity }).index;
  const resized: { center: number[]; size: number[]; scale: number[]; shift: number }[] = [];
  const fitted = letters.map((letter, index) => {
    const box = boxes[index];
    const face = Math.max(...(index === flatIndex ? [box.size[0], box.size[1]] : box.size));
    const openingHeight = opening ? opening.high - opening.low : 0;
    const zLimit = openingHeight > 0 ? openingHeight : target;
    let factor = target / Math.max(face, 1e-8);
    const flatPlan = Math.min(factor, 2 / Math.max(box.size[2], 1e-8));
    if (index !== flatIndex) factor = Math.min(factor, zLimit / Math.max(box.size[2], 1e-8));
    const scale = index === flatIndex
      ? [flatPlan, flatPlan, 8 / Math.max(box.size[2], 1e-8)]
      : [factor, factor, factor].map((value) => index === markedV ? value * 0.75 : value);
    const positions = letter.mesh.positions.map((value, coordinate) => {
      const axis = coordinate % 3;
      return box.center[axis] + (value - box.center[axis]) * scale[axis];
    });
    let shift = 0;
    if (opening && index !== flatIndex) {
      let low = Infinity;
      let high = -Infinity;
      for (let coordinate = 2; coordinate < positions.length; coordinate += 3) {
        low = Math.min(low, positions[coordinate]);
        high = Math.max(high, positions[coordinate]);
      }
      if (low < opening.low) shift = opening.low - low;
      if (high + shift > opening.high) shift = opening.high - high;
      if (shift) for (let coordinate = 2; coordinate < positions.length; coordinate += 3) positions[coordinate] += shift;
    }
    resized.push({ center: box.center, size: box.size, scale, shift });
    return { ...letter, mesh: { ...letter.mesh, positions } };
  });
  return { letters: fitted, architecture: adjustOpeningToLetters(architecture, resized) };
}

export type LobbyTypologyId =
  | 'vertical-void-lobby'
  | 'compressed-sequential-lobby'
  | 'continuous-hall-lobby'
  | 'topographic-ground-field-lobby'
  | 'linear-gallery-lobby';

export type LobbyLink = {
  from: [number, number, number];
  to: [number, number, number];
  kind: 'bridge' | 'plate' | 'void';
};

export const LOBBY_TYPOLOGIES: { id: LobbyTypologyId; label: string; name: string; rules: string[] }[] = [
  {
    id: 'vertical-void-lobby',
    label: 'Vertical Void',
    name: 'Vertical Void Lobby',
    rules: [
      'Taken from Vertical Final, study 26: letters stack on one vertical axis inside a 1:1:1 field.',
      'Letter order is L, then U, then V, at 140%, 100%, and 75%.',
      'Three letters lie on XY and form the floor plates. The other letters stand as walls.',
      'Letters intersect slightly. The overlap replaces bridges.',
      'V tilts from 45° in 15° steps. Plan rotation steps by 15°.',
      'The shell uses the same 0.75 ft terraces, letter boxes, and contour cuts as studies 77, 66, 65, and 12.',
      'Level quantity and the Z interval do not apply. Each letter is drawn as its actual outline.',
    ],
  },
  {
    id: 'compressed-sequential-lobby',
    label: 'Compressed',
    name: 'Compressed Sequential Lobby',
    rules: [
      'L is at each end. U and V alternate through the middle.',
      'Letters roll on the YZ plane through the first half, at half the width and height of that face. From the middle they rotate down toward the XY plane, and the last letter lies on it. Every letter except the last one has the same height, and the largest U is half that size.',
      'The XY letter is half of the previous 80% size. The two letters in the center are 60%. The first two full letters turning down toward XY are half the height of the 80% size, at or below the letter beside them. Every letter is reduced by 75%, then scaled to 150% of that size.',
      'The shell is one continuous bar and stays open on the YZ plane. It stands at least 1 ft outside each letter.',
      'The letters sit in the center, 1 ft apart at a 20 ft width, 2 ft apart at 40, and 3 ft apart at 60.',
      'The compressed space scales to the selected field box. The reference field is 2:1:1, twice as long as it is tall.',
      'Each letter is drawn as its actual outline. The closest outline pairs become the relationships, and tangent alignment prefers edges that point the same way.',
    ],
  },
  {
    id: 'continuous-hall-lobby',
    label: 'Continuous',
    name: 'Continuous Hall Lobby',
    rules: [
      'Letter order is U, then L, then V, all at the same size.',
      'Two letters lie on XY: one is the floor and one is the ceiling.',
      'The other letters are parallel to the short face and turn in 15° steps along the hall. Their openings puncture the sides.',
      'The row is twice as long as it is tall, in a 2:1:1 width to depth to height field.',
      'Each letter is drawn as its actual outline. The closest outline pairs become the relationships, and tangent alignment prefers edges that point the same way.',
    ],
  },
  {
    id: 'topographic-ground-field-lobby',
    label: 'Topographical',
    name: 'Topographic / Ground-Field Lobby',
    rules: [
      'Letter order is U, then L, then V, in a spiral through 120° around the center Z axis.',
      'L plates and U edges keep Y tilt at 0°. L tilts 0°–45° from horizontal and U tilts 45°–90°, both in 15° steps.',
      'V boundaries stand upright, from X 90° through 105° and 120°. Z rotation follows each letter’s place on the spiral.',
      'X tilt is measured from horizontal. Z turns the letter in plan.',
      'Three letters lie on XY and form the floor plates. The other letters keep the spiral tilt and form the walls.',
      'U inside contours stay open recesses above the plates. V caps define the vertical boundaries.',
      'Each step rises as far as it moves in plan, and neighboring letters intersect slightly. The overlap replaces bridges.',
      'The assembly is optimized for a 1:1:1 width to depth to height field.',
      'Scale shrinks with tilt, from 140% at 0° to 75% at 120°. U keeps its width-to-height ratio, L stays a 90° corner, and V stays a 45° wedge.',
      'Plate links are geometric; circulation and structural support are not certified.',
      'Each letter is drawn as its actual outline. The closest outline pairs become the relationships, and tangent alignment prefers edges that point the same way.',
    ],
  },
  {
    id: 'linear-gallery-lobby',
    label: 'Linear',
    name: 'Linear Gallery Lobby',
    rules: [
      'The field is 40 ft wide, 20 ft deep, and 20 ft tall, a 2:1:1 box. The finished shell is clipped to that box.',
      'Level quantity and the Z interval do not apply.',
      'Letter order is L, then U, then V, all from the same preferred size.',
      'Flat and upright letters alternate. Even letters lie flat in plan. Odd letters stand with a 90° turn, so the face is across the row.',
      'An upright letter overlaps the flat letter beside it. A gap of 0.45 times one flat letter separates each pair. The row is then scaled to 98% of the plan box.',
      'Every upright letter except U stretches in height until it reaches the top and bottom of the field.',
      'Each upright U turns 180° in plan. It is 1 ft thick, centered on its place in the row, and bows 4 ft in plan. Each arm is 2 ft tall.',
      'The U opening follows the letter’s curved inner contour and is 10 ft across the mouth. The outside of the shell stays the boxes around the letters.',
      'L keeps its length on X. It scales up on Y to the field depth, and a flat L scales up on Z by the same amount. Every L sits on the bottom of the field.',
      'A 0.75 ft plate, two stepped terraces, and a wall strip are built from each letter outline. Neighboring outlines are hulled into 0.75 ft terraces, so the shell is one bar.',
      'The finished bar is 10% wider than the letters, the same proportion as the earlier linear shell: half of that extra width past each end. It is clipped to the field and is not stretched to fill the box.',
      'A box 1 ft outside each letter is joined on last. Above the 10 ft opening, each flat letter gets a 0.75 ft pad and each upright pad rises 5.4 ft higher, the same step as the earlier linear top, clipped to the ceiling.',
      'Each letter then cuts its inner contour through the bar along its saved rotation. An upright U cuts its curved inner contour. No bridges are added.',
    ],
  },
];

const ORDER: Record<LobbyTypologyId, Letter[]> = {
  'vertical-void-lobby': ['L', 'U', 'V'],
  'compressed-sequential-lobby': ['L', 'V', 'U'],
  'continuous-hall-lobby': ['U', 'L', 'V'],
  'topographic-ground-field-lobby': ['U', 'L', 'V'],
  'linear-gallery-lobby': ['L', 'U', 'V'],
};

/** Place letters on evenly spaced Z levels. Plan position and rotation stay as generated. */
export function applyLobbyZLevels(placed: AmphitheaterSource[], field: { height: number }, levels: number, interval: number) {
  if (!Number.isInteger(levels) || levels < 1) throw Error('Choose at least 1 level.');
  if (![10, 12, 15].includes(interval)) throw Error('Z interval must be 10, 12, or 15 feet.');
  const reach = (levels - 1) * interval;
  if (reach > field.height + 1e-6) throw Error(levels + ' levels at ' + interval + ' ft need ' + reach + ' ft on Z. This field is ' + field.height + ' ft high.');
  const next = placed.map((item, index) => {
    const level = Math.min(levels - 1, Math.floor(index * levels / placed.length));
    const worldZ = (field.height - reach) / 2 + level * interval;
    return { ...item, z: worldZ - field.height / 2 };
  });
  for (const item of next) {
    const size = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
    const center = item.z + field.height / 2;
    if (center - size.z / 2 < -0.05 || center + size.z / 2 > field.height + 0.05) throw Error('A letter does not fit these Z levels. Choose fewer levels, a shorter interval, or a taller field.');
  }
  return next;
}

function source(letter: Letter, scale: number, x: number, y: number, z: number, rx: number, ry: number, rz: number): AmphitheaterSource {
  return { letter, x, y, z, rx, ry, rz, scale, scaleX: 1, scaleY: 1, scaleZ: 1 };
}

function sizeOf(letter: Letter, scale: number, rx: number, ry: number, rz: number, scaleX = 1, scaleY = 1, scaleZ = 1) {
  const geometry = getLetterVolumeGeometry(letter, 12);
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!.clone();
  box.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz), 'XYZ')),
    new THREE.Vector3(scale * scaleX, scale * scaleY, scale * scaleZ),
  ));
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
}

function letterOutlines(placed: AmphitheaterSource[]) {
  return placed.map((item) => {
    const shape = getLetterShape(item.letter);
    const samples = shape.getPoints(6);
    const center = new THREE.Box2().setFromPoints(shape.getPoints(16)).getCenter(new THREE.Vector2());
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(item.x, item.y, item.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(item.rx),
        THREE.MathUtils.degToRad(item.ry),
        THREE.MathUtils.degToRad(item.rz),
        item.rotationOrder ?? 'XYZ',
      )),
      new THREE.Vector3(item.scale * item.scaleX, item.scale * item.scaleY, item.scale * item.scaleZ),
    );
    return samples.map((point) => new THREE.Vector3(point.x - center.x, point.y - center.y, 0).applyMatrix4(matrix));
  });
}

/** Closest outline pairs, kept as a spanning tree. Alignment prefers edges that point the same way. */
export function outlineRelationships(placed: AmphitheaterSource[], organization: 'proximity' | 'alignment', kind: LobbyLink['kind']): LobbyLink[] {
  const lines = letterOutlines(placed);
  const pairs: { i: number; j: number; q: THREE.Vector3; s: THREE.Vector3; score: number }[] = [];
  for (let i = 0; i < lines.length; i++) for (let j = 0; j < i; j++) {
    let best: { i: number; j: number; q: THREE.Vector3; s: THREE.Vector3; score: number } | undefined;
    const a = lines[i];
    const b = lines[j];
    for (let k = 1; k < a.length; k++) for (let l = 1; l < b.length; l++) {
      const first = new THREE.Line3(a[k - 1], a[k]);
      const second = new THREE.Line3(b[l - 1], b[l]);
      let q = first.getCenter(new THREE.Vector3());
      let s = new THREE.Vector3();
      for (let step = 0; step < 5; step++) {
        s = second.closestPointToPoint(q, true, new THREE.Vector3());
        q = first.closestPointToPoint(s, true, new THREE.Vector3());
      }
      const tangentA = first.delta(new THREE.Vector3()).normalize();
      const tangentB = second.delta(new THREE.Vector3()).normalize();
      const score = q.distanceTo(s) * (1 + (organization === 'alignment' ? 1 : 0.12) * (1 - Math.abs(tangentA.dot(tangentB))));
      if (!best || score < best.score) best = { i, j, q, s, score };
    }
    if (best) pairs.push(best);
  }
  const roots = lines.map((_, index) => index);
  const root = (index: number): number => roots[index] === index ? index : root(roots[index]);
  const links: LobbyLink[] = [];
  for (const edge of pairs.sort((a, b) => a.score - b.score)) {
    if (root(edge.i) === root(edge.j)) continue;
    roots[root(edge.i)] = root(edge.j);
    links.push({ from: edge.q.toArray() as [number, number, number], to: edge.s.toArray() as [number, number, number], kind });
  }
  return links;
}

const OVERLAP = 0.45;

function floorCount(id: LobbyTypologyId, count: number) {
  if (id === 'vertical-void-lobby' || id === 'topographic-ground-field-lobby') return Math.min(3, Math.max(1, count - 1));
  return Math.max(1, Math.min(count - 1, Math.round(count / 2)));
}

function floorSlots(count: number, plates: number) {
  const chosen = new Set<number>();
  for (let index = 0; index < plates; index++) chosen.add(plates === 1 ? Math.floor((count - 1) / 2) : Math.round(index * (count - 1) / (plates - 1)));
  for (let index = 0; chosen.size < plates && index < count; index++) chosen.add(index);
  return chosen;
}

function poseFor(index: number, floors: Set<number>, wall: { rx: number; ry: number; rz: number }) {
  if (floors.has(index)) return { rx: 0, ry: 0, rz: wall.rz };
  if (Math.abs(wall.rx) < 30 && Math.abs(wall.ry) < 30) return { rx: 0, ry: 90, rz: wall.rz };
  return wall;
}

function bounds(placed: AmphitheaterSource[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const item of placed) {
    const size = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
    const center = [item.x, item.y, item.z];
    const half = [size.x / 2, size.y / 2, size.z / 2];
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], center[axis] - half[axis]);
      max[axis] = Math.max(max[axis], center[axis] + half[axis]);
    }
  }
  return { span: min.map((value, axis) => max[axis] - value), mid: min.map((value, axis) => (value + max[axis]) / 2) };
}

function center(placed: AmphitheaterSource[]) {
  const mid = bounds(placed).mid;
  placed.forEach((item) => { item.x -= mid[0]; item.y -= mid[1]; item.z -= mid[2]; });
}

function fitInside(placed: AmphitheaterSource[], field: { width: number; depth: number; height: number }) {
  const span = bounds(placed).span;
  const factor = Math.min(field.width / Math.max(span[0], 0.001), field.depth / Math.max(span[1], 0.001), field.height / Math.max(span[2], 0.001), 1) * 0.9;
  if (factor < 1) placed.forEach((item) => { item.x *= factor; item.y *= factor; item.z *= factor; item.scale *= factor; });
}

function placeLong(order: Letter[], count: number, preferred: number, spin: (index: number) => { rx: number; ry: number; rz: number }, liftEnds: boolean, field: { width: number; depth: number; height: number }, options?: { scaleAt?: (index: number) => number; gap?: number; dip?: boolean; keepSize?: boolean }) {
  const placed: AmphitheaterSource[] = [];
  const gap = options?.gap ?? -OVERLAP;
  let x = 0;
  for (let index = 0; index < count; index++) {
    const letter = order[index % order.length];
    const rotation = spin(index);
    const scale = preferred * (options?.scaleAt?.(index) ?? 1);
    const reach = sizeOf(letter, scale, rotation.rx, rotation.ry, rotation.rz);
    if (placed.length) {
      const previous = placed[placed.length - 1];
      const previousReach = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz);
      x = previous.x + previousReach.x / 2 + reach.x / 2 + gap;
    }
    placed.push(source(letter, scale, x, 0, 0, rotation.rx, rotation.ry, rotation.rz));
  }
  if (options?.keepSize) {
    if (options.dip && count > 2) {
      const mid = (count - 1) / 2;
      for (let index = 1; index < count - 1; index++) placed[index].z -= preferred * 0.15 * (1 - Math.abs(index - mid) / mid);
    }
    center(placed);
    fitInside(placed, field);
    return placed;
  }
  const length = bounds(placed).span[0];
  const height = bounds(placed).span[2];
  if (count > 1 && liftEnds) {
    const first = sizeOf(placed[0].letter, placed[0].scale, placed[0].rx, placed[0].ry, placed[0].rz);
    const lastItem = placed[placed.length - 1];
    const last = sizeOf(lastItem.letter, lastItem.scale, lastItem.rx, lastItem.ry, lastItem.rz);
    const rise = length / 2 - first.z / 2 - last.z / 2;
    if (rise > 0) { placed[0].z = -rise / 2; lastItem.z = rise / 2; }
  } else if (count > 1 && length < height * 2) {
    const extra = (height * 2 - length) / (count - 1);
    for (let index = 1; index < placed.length; index++) placed[index].x += extra * index;
  } else if (count > 1) {
    let spread = Math.max(0, length / 2 - height);
    for (let attempt = 0; attempt < 6; attempt++) {
      for (let index = 0; index < placed.length; index++) placed[index].z = (index / (count - 1) - 0.5) * spread;
      const span = bounds(placed).span[2];
      const target = length / 2;
      if (Math.abs(span - target) < 0.05) break;
      spread += target - span;
    }
  }
  if (options?.dip && count > 2) {
    const mid = (count - 1) / 2;
    for (let index = 1; index < count - 1; index++) {
      const towardCenter = 1 - Math.abs(index - mid) / mid;
      placed[index].z -= preferred * (0.35 + 0.3 * towardCenter);
    }
    const span = bounds(placed).span;
    if (span[0] < span[2] * 2) {
      const extra = (span[2] * 2 - span[0]) / (count - 1);
      for (let index = 1; index < count; index++) placed[index].x += extra * index;
    }
  }
  center(placed);
  fitInside(placed, field);
  return placed;
}

function yzRoll(along: number) {
  const spin = (1 - along) * Math.PI / 2;
  const quaternion = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), spin));
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return { rx: THREE.MathUtils.radToDeg(euler.x), ry: THREE.MathUtils.radToDeg(euler.y), rz: THREE.MathUtils.radToDeg(euler.z) };
}

function layTowardXY(along: number) {
  const stand = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0, 'XYZ'));
  const quaternion = stand.slerp(new THREE.Quaternion(), along);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  return { rx: THREE.MathUtils.radToDeg(euler.x), ry: THREE.MathUtils.radToDeg(euler.y), rz: THREE.MathUtils.radToDeg(euler.z) };
}

function compressedCenter(count: number) {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, item) => item)
    .filter((item) => count === 1 || item !== count - 1)
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)
    .slice(0, Math.min(2, Math.max(1, count - 1)));
}

function compressedPortion(index: number, count: number) {
  if (count > 1 && index === count - 1) return 0.4;
  return compressedCenter(count).includes(index) ? 0.6 : 1;
}

function compressedShoulder(index: number, count: number) {
  const mid = (count - 1) / 2;
  const center = compressedCenter(count);
  const pair = Array.from({ length: count }, (_, item) => item)
    .filter((item) => item >= mid && item !== count - 1 && !center.includes(item))
    .slice(0, 2);
  return pair.includes(index) ? 0.4 : 1;
}

export function populateLobby(id: LobbyTypologyId, preferred: number, count: number, field: { width: number; depth: number; height: number } | number, organization: 'proximity' | 'alignment' = 'proximity', letters: Letter[] = ['L', 'U', 'V']) {
  if (!Number.isSafeInteger(count) || count < 2) throw Error('Enter Automatic or a whole letter quantity of at least 2.');
  if (!(preferred > 0)) throw Error('Enter a positive letter size.');
  const box = typeof field === 'number' ? { width: field, depth: field, height: field } : field;
  const order = ORDER[id].filter((letter) => letters.includes(letter));
  if (!order.length) throw Error('Turn on at least one of L, U, or V.');
  if (id === 'vertical-void-lobby') {
    const placed: AmphitheaterSource[] = [];
    const floors = floorSlots(count, floorCount(id, count));
    let vCount = 0;
    for (let index = 0; index < count; index++) {
      const letter = order[index % order.length];
      const factor = letter === 'L' ? 1.4 : letter === 'U' ? 1 : 0.75;
      const scale = preferred * factor;
      const rotation = poseFor(index, floors, letter === 'V' ? { rx: 45 + (vCount % 7) * 15, ry: 0, rz: (index % 4) * 15 } : { rx: 0, ry: 90, rz: (index % 4) * 15 });
      if (letter === 'V' && !floors.has(index)) vCount++;
      const height = sizeOf(letter, scale, rotation.rx, rotation.ry, rotation.rz).z;
      let z = 0;
      if (placed.length) {
        const previous = placed[placed.length - 1];
        const previousHeight = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz).z;
        z = previous.z + previousHeight / 2 + height / 2 - OVERLAP;
      }
      placed.push(source(letter, scale, 0, 0, z, rotation.rx, rotation.ry, rotation.rz));
    }
    center(placed);
    fitInside(placed, box);
    return { source: placed, links: [] };
  }
  if (id === 'compressed-sequential-lobby') {
    const mids = (['U', 'V'] as Letter[]).filter((letter) => letters.includes(letter));
    const end = letters.includes('L') ? 'L' : order[0];
    const middle = mids.length ? mids : [end];
    const sequence = Array.from({ length: count }, (_, index) => index === 0 || index === count - 1 ? end : middle[(index - 1) % middle.length]);
    const gap = box.width / 20;
    let factor = 1;
    let placed: AmphitheaterSource[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      placed = [];
      let x = 0;
      for (let index = 0; index < count; index++) {
        const mid = (count - 1) / 2;
        const pose = index < mid
          ? yzRoll(mid <= 0 ? 0 : index / mid)
          : layTowardXY(count - 1 === mid ? 1 : (index - mid) / (count - 1 - mid));
        const letter = sequence[index];
        const portion = compressedPortion(index, count);
        const scale = preferred * factor * portion * compressedShoulder(index, count) * 0.25 * 1.5;
        const face = index < mid ? 0.5 : 1;
        const reach = sizeOf(letter, scale, pose.rx, pose.ry, pose.rz, face, face, 1);
        if (placed.length) {
          const previous = placed[placed.length - 1];
          const previousReach = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz, previous.scaleX, previous.scaleY, previous.scaleZ);
          x = previous.x + previousReach.x / 2 + reach.x / 2 + gap;
        }
        const item = source(letter, scale, x, 0, 0, pose.rx, pose.ry, pose.rz);
        item.scaleX = face;
        item.scaleY = face;
        placed.push(item);
      }
      const upright = placed.filter((_, index) => index < (count - 1) / 2);
      const target = Math.max(...upright.map((item) => sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ).z));
      placed.forEach((item, index) => {
        if (count > 1 && index === count - 1) return;
        const height = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ).z;
        item.scale *= target / Math.max(height, 0.001);
      });
      const largestU = placed.reduce<{ item: AmphitheaterSource; size: number } | undefined>((best, item) => {
        if (item.letter !== 'U') return best;
        const size = item.scale * item.scaleX * item.scaleY;
        return !best || size > best.size ? { item, size } : best;
      }, undefined);
      if (largestU) largestU.item.scale *= 0.5;
      let cursor = 0;
      placed.forEach((item, index) => {
        const reach = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
        if (index) {
          const previous = placed[index - 1];
          const previousReach = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz, previous.scaleX, previous.scaleY, previous.scaleZ);
          cursor = previous.x + previousReach.x / 2 + reach.x / 2 + gap;
        }
        item.x = index ? cursor : 0;
      });
      const span = bounds(placed).span;
      if (span[0] <= box.width * 0.9 && span[1] <= box.depth * 0.96 && span[2] <= box.height * 0.96) break;
      factor *= Math.min(0.92, (box.width * 0.9) / Math.max(span[0], 0.001), (box.depth * 0.96) / Math.max(span[1], 0.001), (box.height * 0.96) / Math.max(span[2], 0.001));
    }
    const midX = bounds(placed).mid[0];
    placed.forEach((item) => { item.x -= midX; });
    return { source: placed, links: [] };
  }
  if (id === 'continuous-hall-lobby') {
    let wall = 0;
    const placed = placeLong(order, count, preferred, (index) => index === 0 || index === count - 1 ? { rx: 0, ry: 0, rz: index === 0 ? 0 : 90 } : { rx: (wall++) * 15, ry: 90, rz: 0 }, true, box);
    return { source: placed, links: [] };
  }
  if (id === 'linear-gallery-lobby') {
    const placed: AmphitheaterSource[] = [];
    const flatReach = sizeOf(order[0], preferred, 0, 0, 0);
    for (let index = 0; index < count; index++) {
      const letter = order[index % order.length];
      const upright = letter === 'U' || index % 2 === 1;
      const pose = letter === 'U' ? { rx: 0, ry: 90, rz: 180 } : upright ? { rx: 0, ry: 90, rz: 0 } : { rx: 0, ry: 0, rz: 0 };
      const reach = sizeOf(letter, preferred, pose.rx, pose.ry, pose.rz);
      const item = source(letter, preferred, 0, 0, 0, pose.rx, pose.ry, pose.rz);
      const previous = placed[placed.length - 1];
      if (previous && upright) {
        const previousReach = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz);
        item.x = previous.x + previousReach.x / 2 - reach.x * 0.2;
      } else if (previous) {
        const previousReach = sizeOf(previous.letter, previous.scale, previous.rx, previous.ry, previous.rz);
        item.x = previous.x + previousReach.x / 2 + reach.x / 2 + flatReach.x * 0.45;
      }
      placed.push(item);
    }
    const stand = sizeOf(order[0], preferred, 0, 90, 0);
    for (const item of placed) if (item.ry === 0) item.z = -stand.z * 0.2;
    center(placed);
    const span = bounds(placed).span;
    const plan = Math.min(box.width / Math.max(span[0], 0.001), box.depth / Math.max(span[1], 0.001)) * 0.98;
    placed.forEach((item) => { item.x *= plan; item.y *= plan; item.z *= plan; item.scale *= plan; });
    for (const item of placed) {
      if (Math.abs(item.ry) !== 90) continue;
      const reach = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
      if (item.letter === 'U') {
        const factor = Math.min(box.height * 0.99 / Math.max(reach.z, 0.001), box.depth * 0.99 / Math.max(reach.y, 0.001));
        item.scaleY *= factor;
        const depth = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, 1).y;
        item.scaleY *= Math.max(0.35, (depth - LINEAR_U_BOW_FT * 2) / Math.max(depth, 0.001));
        const thick = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, 1).x;
        item.scaleZ = LINEAR_U_WIDTH_FT / Math.max(thick, 0.001);
        // 0.43 is the centered outer half of the even U, including the bevel.
        // A 2 ft arm on each side then leaves the 10 ft opening.
        const armScale = (2 + LINEAR_U_OPENING_FT / 2) / 0.43;
        item.scaleX *= Math.min(factor, armScale / Math.max(item.scale, 0.001));
        const geometry = getLetterVolumeGeometry('U', 12, linearUInnerHalf(item.scale * item.scaleX), false, linearUBend(item.scale, item.scaleY));
        geometry.computeBoundingBox();
        const fitted = geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(item.rx), THREE.MathUtils.degToRad(item.ry), THREE.MathUtils.degToRad(item.rz), 'XYZ')),
          new THREE.Vector3(item.scale * item.scaleX, item.scale * item.scaleY, item.scale * item.scaleZ),
        ));
        item.y = -((fitted.min.y + fitted.max.y) / 2);
        item.z = 0;
        continue;
      }
      item.scaleX *= box.height * 0.99 / Math.max(reach.z, 0.001);
      item.z = 0;
    }
    for (const item of placed) {
      if (item.letter !== 'L') continue;
      const reach = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
      item.scaleY *= 10 / Math.max(reach.y, 0.001);
    }
    const lift = box.depth * 0.98 / 10;
    for (const item of placed) {
      if (item.letter !== 'L') continue;
      if (Math.abs(item.ry) === 90) item.scaleY *= lift;
      else { item.scaleY *= lift; item.scaleZ *= lift; }
    }
    for (const item of placed) {
      if (item.letter !== 'L') continue;
      const reach = sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ);
      item.z = reach.z / 2 + 0.05 - box.height / 2;
    }
    // Study 9's shell is 53.5 ft wide around letters 48.6 ft wide.
    const shellToLetters = 53.5 / 48.6;
    const reachX = placed.map((item) => sizeOf(item.letter, item.scale, item.rx, item.ry, item.rz, item.scaleX, item.scaleY, item.scaleZ).x);
    let minX = Infinity;
    let maxX = -Infinity;
    placed.forEach((item, index) => {
      minX = Math.min(minX, item.x - reachX[index] / 2);
      maxX = Math.max(maxX, item.x + reachX[index] / 2);
    });
    const current = { min: minX, max: maxX, span: maxX - minX };
    const limit = (box.width - 0.2) / shellToLetters;
    if (current.span > limit) {
      const mid = (current.min + current.max) / 2;
      let low = 0;
      let high = 1;
      for (let step = 0; step < 24; step++) {
        const scale = (low + high) / 2;
        let min = Infinity;
        let max = -Infinity;
        placed.forEach((item, index) => {
          const x = mid + (item.x - mid) * scale;
          min = Math.min(min, x - reachX[index] / 2);
          max = Math.max(max, x + reachX[index] / 2);
        });
        if (max - min > limit) high = scale;
        else low = scale;
      }
      placed.forEach((item) => { item.x = mid + (item.x - mid) * low; });
    }
    return { source: placed, links: [] };
  }
  const tilts = { L: [0, 15, 30, 45], U: [45, 60, 75, 90], V: [90, 105, 120] };
  const seen = { L: 0, U: 0, V: 0 };
  const spiral: AmphitheaterSource[] = [];
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < count; index++) {
    const letter = order[index % order.length];
    const tilt = tilts[letter][seen[letter] % tilts[letter].length];
    seen[letter]++;
    const scale = preferred * (1.4 - 0.65 * (tilt / 120));
    const angle = (count === 1 ? 60 : (index / Math.max(1, count - 1)) * 120) * Math.PI / 180;
    spiral.push(source(letter, scale, x, y, z, tilt, 0, THREE.MathUtils.radToDeg(angle) + 180));
    if (index < count - 1) {
      const nextLetter = order[(index + 1) % order.length];
      const nextTilt = tilts[nextLetter][seen[nextLetter] % tilts[nextLetter].length];
      const nextScale = preferred * (1.4 - 0.65 * (nextTilt / 120));
      const reach = sizeOf(letter, scale, tilt, 0, THREE.MathUtils.radToDeg(angle) + 180);
      const nextAngle = ((index + 1) / Math.max(1, count - 1)) * 120 * Math.PI / 180;
      const nextReach = sizeOf(nextLetter, nextScale, nextTilt, 0, THREE.MathUtils.radToDeg(nextAngle) + 180);
      const plan = Math.max(0.4, Math.hypot((reach.x + nextReach.x) / 2, (reach.y + nextReach.y) / 2) - OVERLAP);
      const step = Math.min(plan, (reach.z + nextReach.z) / 2);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      z += step;
    }
  }
  const floors = floorSlots(count, floorCount('topographic-ground-field-lobby', count));
  spiral.forEach((item, index) => {
    if (!floors.has(index)) return;
    item.rx = 0;
    item.ry = 0;
  });
  center(spiral);
  fitInside(spiral, box);
  return { source: spiral, links: [] };
}
