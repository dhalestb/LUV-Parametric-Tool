import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const DIRECTORY = "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";
const ALLOWED = new Set(["Gathering Linear.obj", "Gathering, Room within Volume.obj", "Lobby Continuous Hall.obj"]);

/** Local review helper. Serves named original OBJs from the external directory. */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("file") ?? "";
  if (!ALLOWED.has(name)) return NextResponse.json({ error: "That file is not part of the review pair." }, { status: 404 });
  try {
    const text = await readFile(join(DIRECTORY, name), "utf8");
    return new NextResponse(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "The original OBJ directory is not available on this machine." }, { status: 404 });
  }
}
