import { PNG } from "pngjs";
import { createWorker, type Worker } from "tesseract.js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function enlargePng(bytes: Buffer) {
  try {
    const source = PNG.sync.read(bytes);
    const scale = source.width >= 1400 ? 1 : 4;
    if (scale === 1) return bytes;
    const target = new PNG({ width: source.width * scale, height: source.height * scale });
    for (let y = 0; y < target.height; y += 1) {
      const sy = Math.floor(y / scale);
      for (let x = 0; x < target.width; x += 1) {
        const sx = Math.floor(x / scale);
        const from = (source.width * sy + sx) << 2;
        const to = (target.width * y + x) << 2;
        target.data[to] = source.data[from];
        target.data[to + 1] = source.data[from + 1];
        target.data[to + 2] = source.data[from + 2];
        target.data[to + 3] = source.data[from + 3];
      }
    }
    return PNG.sync.write(target);
  } catch {
    return bytes;
  }
}

let engine: Promise<Worker> | null = null;
let pending: Promise<unknown> = Promise.resolve();

function getEngine() {
  engine ??= createWorker("eng").catch(error => {
    engine = null;
    throw error;
  });
  return engine;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "Choose a PNG file." }, { status: 400 });
  const bytes = enlargePng(Buffer.from(await image.arrayBuffer()));
  const run = pending.then(async () => {
    const worker = await getEngine();
    const result = await worker.recognize(bytes);
    return result.data.text ?? "";
  });
  pending = run.then(() => undefined, () => undefined);
  try {
    return NextResponse.json({ text: await run });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the PNG." }, { status: 500 });
  }
}
