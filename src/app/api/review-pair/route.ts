import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

const DIRECTORY = "C:\\design 7\\assignment 2\\obj files";
const ALLOWED = new Set([
  "Gathering Linear.obj",
  "Gathering, Room within Volume.obj",
  "Lobby Continuous Hall.obj",
  "Lobby, Cont Hall.obj",
]);

const SEARCH_DIRS = [
  "",
  "gathering",
  "lobbies",
  "workspaces\\v2\\original forms",
  "workspaces\\v1\\original forms",
];

async function resolveObj(name: string) {
  for (const relative of SEARCH_DIRS) {
    const directory = relative ? join(DIRECTORY, relative) : DIRECTORY;
    try {
      const names = await readdir(directory);
      if (names.includes(name)) return join(directory, name);
    } catch {
      // Folder may be absent on this machine.
    }
  }
  return null;
}

/** Local review helper. Serves named original OBJs from the external directory. */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("file") ?? "";
  if (!ALLOWED.has(name)) return NextResponse.json({ error: "That file is not part of the review pair." }, { status: 404 });
  try {
    const path = await resolveObj(name);
    if (!path) return NextResponse.json({ error: "The original OBJ directory is not available on this machine." }, { status: 404 });
    const text = await readFile(path, "utf8");
    return new NextResponse(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "The original OBJ directory is not available on this machine." }, { status: 404 });
  }
}
