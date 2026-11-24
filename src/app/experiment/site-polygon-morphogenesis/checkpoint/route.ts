import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const host = request.headers.get("host");
  const localHost = host && /^(127\.0\.0\.1|localhost):[0-9]+$/.test(host);
  if (process.env.LUV_ENABLE_CHECKPOINT_RESTORE !== "1" ||
      !localHost ||
      request.headers.get("origin") !== "http://" + host) {
    return new Response(null, { status: 404 });
  }

  const archive = await readFile(join(process.cwd(), "fixtures/site-development-checkpoint/miami-session.json.gz"));
  return new Response(new Uint8Array(archive), {
    headers: { "Content-Type": "application/gzip", "Cache-Control": "no-store" },
  });
}
