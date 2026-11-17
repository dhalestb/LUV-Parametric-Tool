'use client';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { AmphitheaterSource, ProofMesh } from './amphitheaterInteractiveTypes';
import { getLetterVolumeGeometry } from './letterGeometry3d';
import { lobbyExplanation } from './lobbyExplanation';

const GOLD = '#D6AD4F';
const BLUE = '#71BEDA';
const PAPER = '#F7F6F5';

function letterMesh(item: AmphitheaterSource) {
  const geometry = getLetterVolumeGeometry(item.letter, 12);
  const attr = geometry.getAttribute('position');
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
  const positions: number[] = [];
  for (let index = 0; index < attr.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(attr, index).applyMatrix4(matrix);
    positions.push(point.x, point.y, point.z);
  }
  const indices: number[] = [];
  for (let index = 0; index < (geometry.index?.count ?? attr.count); index++) indices.push(geometry.index ? geometry.index.getX(index) : index);
  return { positions, indices };
}

function fitCamera(box: THREE.Box3, width: number, height: number) {
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(1, box.getSize(new THREE.Vector3()).length());
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, span * 12);
  camera.up.set(0, 0, 1);
  camera.position.copy(center).add(new THREE.Vector3(span, -span, span * 0.85));
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const projected = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const extent = projected.getSize(new THREE.Vector3());
  const aspect = width / height;
  const half = Math.max(extent.y / 2, extent.x / (2 * aspect)) / 0.82;
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
  return camera;
}

function createBoard(title: string, letters: AmphitheaterSource[], form?: ProofMesh) {
  const meshes = letters.map(letterMesh);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 1900;
  const ctx = canvas.getContext('2d');
  if (!ctx) { renderer.dispose(); throw Error('The rules board could not be drawn.'); }
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const resources: { dispose: () => void }[] = [];
  const boundsOf = (items: { positions: number[] }[]) => {
    const box = new THREE.Box3();
    for (const mesh of items) box.union(new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.positions, 3)));
    return box;
  };
  const addMesh = (scene: THREE.Scene, mesh: { positions: number[]; indices: number[] }, color: string, opacity = 1) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setIndex(mesh.indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, transparent: opacity < 1, opacity });
    resources.push(geometry, material);
    scene.add(new THREE.Mesh(geometry, material));
  };
  const drawView = (items: { positions: number[]; indices: number[]; color: string; opacity?: number }[], x: number, y: number, width: number, height: number) => {
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(40, -60, 90);
    scene.add(light);
    for (const item of items) addMesh(scene, item, item.color, item.opacity ?? 1);
    const box = boundsOf(items);
    renderer.setSize(width, height, false);
    renderer.setClearColor('#000000', 0);
    renderer.render(scene, fitCamera(box, width, height));
    ctx.drawImage(renderer.domElement, x, y, width, height);
    scene.clear();
  };
  const text = (value: string, x: number, y: number, size: number, color = PAPER) => {
    ctx.fillStyle = color;
    ctx.font = `${size}px Arial, sans-serif`;
    ctx.fillText(value, x, y);
  };
  const noted = (['L', 'U', 'V'] as const).map(letter => {
    const index = letters.findIndex(item => item.letter === letter);
    return index < 0 ? undefined : { item: letters[index], mesh: meshes[index], index };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  ctx.strokeStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.moveTo(40, 72);
  ctx.lineTo(1560, 72);
  ctx.moveTo(800, 100);
  ctx.lineTo(800, 980);
  ctx.moveTo(40, 1000);
  ctx.lineTo(1560, 1000);
  ctx.stroke();
  text(title.toUpperCase(), 40, 52, 32);
  text('ORIGINAL LETTERS', 40, 130, 22, GOLD);
  text('ARCHITECTURAL FORM', 840, 130, 22, GOLD);
  drawView(meshes.map(mesh => ({ ...mesh, color: GOLD })), 40, 160, 720, 620);
  if (form?.positions.length) drawView([{ ...form, color: PAPER }], 840, 160, 720, 620);
  else drawView(meshes.map(mesh => ({ ...mesh, color: PAPER })), 840, 160, 720, 620);
  text(form?.positions.length ? 'Validated architectural mesh from the current study.' : 'Generate Design to build the architectural form. The letters stay in these poses.', 840, 820, 16);
  text('Original source identities and transformations.', 40, 820, 16);

  const copy = lobbyExplanation(title);
  text('ORIENTATION RULES', 40, 1060, 22, GOLD);
  const leftW = 420;
  const leftH = 460;
  drawView(meshes.map(mesh => ({ ...mesh, color: GOLD })), 40, 1090, leftW, leftH);
  const leftCamera = fitCamera(boundsOf(meshes), leftW, leftH);
  noted.forEach((note, order) => {
    const origin = new THREE.Vector3(note.item.x, note.item.y, note.item.z);
    const projected = origin.clone().project(leftCamera);
    const px = 40 + (projected.x + 1) * leftW / 2;
    const py = 1090 + (1 - projected.y) * leftH / 2;
    const labelY = 1160 + order * 130;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(500, labelY);
    ctx.stroke();
    text(`${note.item.letter}-${note.index + 1}`, 520, labelY, 18, BLUE);
    text(`X ${note.item.rx.toFixed(0)}°   Y ${note.item.ry.toFixed(0)}°`, 520, labelY + 26, 16);
    text(`Z ${note.item.rz.toFixed(0)}°`, 520, labelY + 48, 16);
  });
  const wrap = (value: string, max: number) => {
    const words = value.split(' ');
    const lines: string[] = [];
    let line = '';
    ctx.font = '15px Arial, sans-serif';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  let captionY = 1572;
  for (const caption of copy?.lines ?? []) {
    for (const line of wrap(caption, 1520)) {
      text(line, 40, captionY, 15);
      captionY += 20;
    }
  }

  text(`${title.toUpperCase()} — ACTUAL COMPONENTS`, 840, 1060, 20, GOLD);
  const stages: { title: string; items: { positions: number[]; indices: number[]; color: string; opacity?: number }[] }[] = [
    { title: 'Original sources', items: meshes.map(mesh => ({ ...mesh, color: GOLD })) },
    { title: 'Connections', items: letters.flatMap((item, index) => item.letter === 'L' ? [{ ...meshes[index], color: PAPER }] : []) },
    { title: 'Edges + boundaries', items: letters.flatMap((item, index) => item.letter === 'L' ? [] : [{ ...meshes[index], color: item.letter === 'V' ? BLUE : GOLD }]) },
  ];
  stages.forEach((stage, index) => {
    const x = 840 + index * 250;
    text(stage.title, x, 1110, 14);
    if (stage.items.length) drawView(stage.items, x, 1130, 230, 340);
  });
  resources.forEach(resource => resource.dispose());
  renderer.dispose();
  renderer.forceContextLoss();
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('PNG encoding failed.')), 'image/png'));
}

export default function TopographicLobbyBoard({ title, letters, form }: { title: string; letters: AmphitheaterSource[]; form?: ProofMesh }) {
  const [url, setUrl] = useState('');
  const key = JSON.stringify({ title, form: form?.positions.length ?? 0, letters: letters.map(item => [item.letter, item.x, item.y, item.z, item.rx, item.ry, item.rz, item.scale]) });
  useEffect(() => {
    let active = true;
    let current = '';
    createBoard(title, letters, form).then(blob => {
      if (!active) return;
      current = URL.createObjectURL(blob);
      setUrl(current);
    }).catch(() => { if (active) setUrl(''); });
    return () => { active = false; if (current) URL.revokeObjectURL(current); };
  }, [title, letters, form, key]);
  return <figure className="space-y-2">{url?<img src={url} alt={`${title} rules board`} style={{ display: 'block', width: '100%', height: 'auto', background: '#000' }}/>:<figcaption className="text-xs">Preparing the rules board…</figcaption>}</figure>;
}
