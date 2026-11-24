import { buildLobbyFinalExport } from '@/server/lobbyFinalExport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const zip = await buildLobbyFinalExport();
    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="lobby-final-typology-export.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not export the final lobby studies' }, { status: 500 });
  }
}
