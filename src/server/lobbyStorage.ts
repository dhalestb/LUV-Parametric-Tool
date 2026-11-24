import { readFile, mkdir, writeFile, rename, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { LobbyStudy } from '@/components/lobbyStudy';

const localRoot = path.join(process.cwd(), '.lobby-runs');

export async function saveLobbyStudy(study: LobbyStudy) {
  const folder = path.join(localRoot, study.id);
  await mkdir(folder, { recursive: true });
  const pending = path.join(folder, 'study.pending');
  await writeFile(pending, JSON.stringify(study));
  await rename(pending, path.join(folder, 'study.json'));
}

export async function readLobbyStudy(id: string) {
  return JSON.parse(await readFile(path.join(localRoot, id, 'study.json'), 'utf8')) as LobbyStudy;
}

export async function deleteLobbyStudy(id: string) {
  await rm(path.join(localRoot, id), { recursive: true, force: true });
}

export async function lobbyStudySummaries() {
  await mkdir(localRoot, { recursive: true });
  const studies: LobbyStudy[] = [];
  for (const id of await readdir(localRoot)) {
    try { studies.push(await readLobbyStudy(id)); }
    catch { /* A directory is not a saved lobby study until study.json is published. */ }
  }
  return studies.sort((a, b) => b.created.localeCompare(a.created));
}
