import { NextResponse } from "next/server";
import { registryOpenVolume } from "../../../server/registryOpenVolume";

export const dynamic = "force-dynamic";

/** Ranks every descriptor from 1 (weakest) through the size of the lattice source registry. */
export async function GET() {
  try {
    return NextResponse.json(await registryOpenVolume());
  } catch {
    return NextResponse.json({ error: "The source registry could not be ranked." }, { status: 404 });
  }
}
