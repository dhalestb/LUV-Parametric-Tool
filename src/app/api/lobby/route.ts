import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { deleteLobbyStudy, lobbyStudySummaries, readLobbyStudy, saveLobbyStudy } from '@/server/lobbyStorage';
import type { LobbyStudy } from '@/components/lobbyStudy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPOLOGIES = new Set(['vertical-void-lobby', 'compressed-sequential-lobby', 'continuous-hall-lobby', 'topographic-ground-field-lobby', 'linear-gallery-lobby']);

function validate(body: Partial<LobbyStudy>) {
  if (!body.typologyId || !TYPOLOGIES.has(body.typologyId)) throw Error('Choose a lobby typology.');
  if (!body.field || ![body.field.width, body.field.depth, body.field.height].every(n => [20, 40, 60].includes(n))) throw Error('Each field dimension must be 20, 40 or 60 feet.');
  if (!Number.isFinite(body.preferredFeet) || (body.preferredFeet ?? 0) <= 0) throw Error('Preferred letter size must be positive.');
  if (!Number.isSafeInteger(body.population) || (body.population ?? 0) < 2) throw Error('Letter quantity must be a whole number of at least 2.');
  if (!Array.isArray(body.source) || !body.source.length) throw Error('A lobby study needs letter placements.');
  for (const placement of body.source) {
    if (!['L', 'U', 'V'].includes(placement.letter)) throw Error('Lobby letters must be L, U or V.');
    if (!['x', 'y', 'z', 'rx', 'ry', 'rz', 'scale', 'scaleX', 'scaleY', 'scaleZ'].every(key => Number.isFinite(placement[key as keyof typeof placement]))) throw Error('Lobby placements need finite position, rotation and scale values.');
  }
  if (!Array.isArray(body.links)) throw Error('Lobby connections are missing.');
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({ error: 'Invalid study ID' }, { status: 400 });
      try { return NextResponse.json(await readLobbyStudy(id)); }
      catch { return NextResponse.json({ error: 'Lobby study not found' }, { status: 404 }); }
    }
    return NextResponse.json({ studies: await lobbyStudySummaries() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lobby study storage unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<LobbyStudy>;
    validate(body);
    const study: LobbyStudy = {
      id: randomUUID(),
      created: new Date().toISOString(),
      typologyId: body.typologyId!,
      name: body.name || 'Lobby study',
      field: body.field!,
      preferredFeet: body.preferredFeet!,
      population: body.population!,
      sourceCount: body.source!.length,
      source: body.source!,
      links: body.links!,
      ...(body.architectureStudyId && /^[a-f0-9-]{36}$/.test(body.architectureStudyId) ? { architectureStudyId: body.architectureStudyId } : {}),
    };
    await saveLobbyStudy(study);
    return NextResponse.json(study, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save the lobby study' }, { status: 400 });
  }
}

const studyId = /^[a-f0-9-]{36}$/;

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as { id?: string; name?: string };
    if (!body.id || !studyId.test(body.id)) return NextResponse.json({ error: 'Invalid study ID' }, { status: 400 });
    const name = body.name?.trim() ?? '';
    if (!name || name.length > 120) return NextResponse.json({ error: 'Enter a study name of 120 characters or fewer.' }, { status: 400 });
    const study = await readLobbyStudy(body.id);
    study.name = name;
    await saveLobbyStudy(study);
    return NextResponse.json(study);
  } catch {
    return NextResponse.json({ error: 'Lobby study not found' }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id || !studyId.test(id)) return NextResponse.json({ error: 'Invalid study ID' }, { status: 400 });
  try { await readLobbyStudy(id); }
  catch { return NextResponse.json({ error: 'Lobby study not found' }, { status: 404 }); }
  await deleteLobbyStudy(id);
  return NextResponse.json({ id });
}
