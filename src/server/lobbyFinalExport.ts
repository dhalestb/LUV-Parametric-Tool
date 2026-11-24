import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { lobbyStudySummaries } from './lobbyStorage';
import type { LobbyStudy } from '@/components/lobbyStudy';
import type { LobbyTypologyId } from '@/components/lobbyProof';

/** Newest saved study with this exact name. Earlier names such as "Linear Final" are not substitutes. */
const APPROVED_FINALS: { typologyId: LobbyTypologyId; name: string }[] = [
  { typologyId: 'linear-gallery-lobby', name: 'Linear Final New' },
  { typologyId: 'compressed-sequential-lobby', name: 'Compressed Final New' },
  { typologyId: 'topographic-ground-field-lobby', name: 'Topo Final 2' },
  { typologyId: 'vertical-void-lobby', name: 'Vertical Final' },
  { typologyId: 'continuous-hall-lobby', name: 'Continuous Hall Final' },
];

const CODE_FILES = [
  'src/components/lobbyProof.ts',
  'src/components/letterGeometry3d.ts',
  'scripts/source-envelope.cjs',
  'scripts/amphitheater-interactive-worker.cjs',
];

type ZipFile = { name: string; data: Buffer };

function crc32(data: Buffer) {
  let crc = ~0;
  for (let index = 0; index < data.length; index++) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zipStore(files: ZipFile[]) {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

function slug(studyNumber: number, name: string) {
  return 'study-' + studyNumber + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function referenceShot(lobbyStudyId: string) {
  const root = path.join(process.cwd(), 'exports', 'approved-lobby-finals');
  let folders: string[] = [];
  try { folders = await readdir(root); } catch { return null; }
  for (const folder of folders) {
    try {
      const summary = JSON.parse(await readFile(path.join(root, folder, 'summary.json'), 'utf8')) as { lobbyStudyId?: string };
      if (summary.lobbyStudyId !== lobbyStudyId) continue;
      return await readFile(path.join(root, folder, 'reference-isometric.png'));
    } catch { /* A folder without this study's screenshot is skipped. */ }
  }
  return null;
}

export async function buildLobbyFinalExport() {
  const studies = await lobbyStudySummaries();
  const byNewest = [...studies].sort((a, b) => b.created.localeCompare(a.created));
  const numberOf = new Map(byNewest.map((study, index) => [study.id, byNewest.length - index]));
  const chosen: { study: LobbyStudy; number: number }[] = [];
  for (const approved of APPROVED_FINALS) {
    const study = byNewest.find(item => item.typologyId === approved.typologyId && item.name === approved.name);
    if (!study?.architectureStudyId) throw Error('Saved final "' + approved.name + '" is not in the lobby repository.');
    chosen.push({ study, number: numberOf.get(study.id) ?? 0 });
  }

  const files: ZipFile[] = [];
  const approved = [];
  for (const { study, number } of chosen) {
    const folder = slug(number, study.name);
    const architecturePath = path.join(process.cwd(), '.amphitheater-runs', study.architectureStudyId!, 'result.json');
    const architecture = JSON.parse(await readFile(architecturePath, 'utf8'));
    const request = architecture.request ?? {};
    const { source, ...parameters } = request;
    const sourceMatch = JSON.stringify(study.source) === JSON.stringify(source);
    const shot = await referenceShot(study.id);
    const summary = {
      studyNumber: number,
      name: study.name,
      typologyId: study.typologyId,
      lobbyStudyId: study.id,
      architectureStudyId: study.architectureStudyId,
      created: study.created,
      fieldFeet: study.field,
      preferredFeet: study.preferredFeet,
      population: study.population,
      sourceCount: study.sourceCount,
      links: study.links,
      parameters,
      generationSeed: null,
      ruleVariant: null,
      displayModes: {
        A: 'Original letters',
        B: 'Letters + architecture',
        C: 'Architecture only',
      },
      sourceMatchesArchitectureRequest: sourceMatch,
      validation: architecture.validation,
      volume: architecture.volume,
      bounds: architecture.bounds,
      warnings: architecture.warnings,
      letters: study.source,
      screenshot: shot ? 'reference-isometric.png' : null,
    };
    files.push(
      { name: folder + '/study.json', data: Buffer.from(JSON.stringify(study)) },
      { name: folder + '/architecture.json', data: await readFile(architecturePath) },
      { name: folder + '/summary.json', data: Buffer.from(JSON.stringify(summary, null, 2)) },
    );
    if (shot) files.push({ name: folder + '/reference-isometric.png', data: shot });
    approved.push({
      studyNumber: number,
      name: study.name,
      typologyId: study.typologyId,
      lobbyStudyId: study.id,
      architectureStudyId: study.architectureStudyId,
      folder,
      screenshot: summary.screenshot,
      sourceMatchesArchitectureRequest: sourceMatch,
    });
  }

  for (const relative of CODE_FILES) {
    files.push({ name: 'code/' + relative, data: await readFile(path.join(process.cwd(), relative)) });
  }

  const manifest = {
    purpose: 'Approved lobby finals for adapter integration. Load these saved studies. Do not regenerate them from defaults, and do not replace the shared typology or letter-geometry files with these copies.',
    approved,
    storedParameters: 'Each architecture request records proof lobby, generator source-preserving, organization proximity, articulationElevation feature, and articulation 0.75. Letter positions are x, y, z in feet. Orientations are rx, ry, rz in degrees. Dimensions are scale, scaleX, scaleY, and scaleZ.',
    notStored: [
      'No arrangement or generation seed is stored. The letter transforms in study.json are the approved configuration.',
      'No Rule A/B generation variant is stored. A, B, and C are display modes in Lobby Proof. Gathering Rule A/B checks belong to gathering studies and are not part of these lobby records.',
    ],
    geometry: 'letters[].mesh in architecture.json is each saved architectural letter solid. primary is the combined envelope. Original LUV outlines are reconstructed from the letter identity and scales by the copied letterGeometry3d.ts. They are not a separate saved mesh.',
    code: CODE_FILES.map(file => 'code/' + file),
    codeUse: 'The code copies show how each typology places letters and how the source-preserving envelope is built. Integrate through an adapter. Leave the application copies of these files unchanged.',
    gitignored: ['/exports/', '/.lobby-runs/', '/.amphitheater-runs/'],
    canonical: {
      configuration: '.lobby-runs/<lobbyStudyId>/study.json',
      meshes: '.amphitheater-runs/<architectureStudyId>/result.json',
    },
    screenshots: 'reference-isometric.png is the saved study opened in Lobby Proof, view B, isometric southeast. It is omitted when that capture is not on disk.',
  };
  files.unshift({ name: 'MANIFEST.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) });
  return zipStore(files);
}
