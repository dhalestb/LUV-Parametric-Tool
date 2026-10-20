import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DESCRIPTOR_ALGORITHM_VERSION, LEGACY_DESCRIPTOR_ALGORITHM_VERSION } from "../components/evaluations/descriptorVersion";
import { evaluateTileModel, evaluateTileModelLegacy } from "../components/evaluations/objDescriptorAnalysis";
import { analyzeMesh } from "../components/lattice/analyze";
import { parseObj } from "../components/lattice/parseObj";

/** The original 15 lattice source OBJs. They stay outside the repository. */
export const REGISTRY_DIRECTORY = "C:\\Users\\DHale\\.codex\\worktrees\\organic-surface-integration\\Cursor-APP\\local-test-data\\architectural-objs";

export type RegistryOpenVolumeForm = {
  filename: string;
  absoluteScore: number;
  rank: number;
};

export type RegistryUnavailableForm = {
  filename: string;
  reason: string;
};

export type RegistryDescriptorRanks = {
  id: string;
  name: string;
  /** Ranked forms only. Rank 1 is the weakest among the available forms. */
  forms: RegistryOpenVolumeForm[];
  /** Forms the evaluator could not measure for this descriptor. Not ranked. */
  unavailable: RegistryUnavailableForm[];
};

export type RegistryOpenVolume = {
  version: string;
  cohortSize: number;
  /** Rank 1 is the weakest result. The highest rank is the strongest. */
  direction: string;
  /** Open Volume ranks. Kept so existing readers still find the open-volume list. */
  forms: RegistryOpenVolumeForm[];
  descriptors: RegistryDescriptorRanks[];
  /** The retained v3.5 ranking of the same files, for before/after comparison. */
  legacy: { version: string; descriptors: RegistryDescriptorRanks[] };
};

let pending: Promise<RegistryOpenVolume> | null = null;
let pendingVersion = "";

/** Rank every OBJ in the source registry. The first call measures them; later calls reuse that result. */
export function registryOpenVolume(): Promise<RegistryOpenVolume> {
  if (!pending || pendingVersion !== DESCRIPTOR_ALGORITHM_VERSION) {
    pendingVersion = DESCRIPTOR_ALGORITHM_VERSION;
    pending = scoreRegistry().catch((error: unknown) => {
      pending = null;
      pendingVersion = "";
      throw error;
    });
  }
  return pending;
}

type Bucket = { name: string; rows: Array<{ filename: string; absoluteScore: number }>; unavailable: RegistryUnavailableForm[] };

function rankBuckets(byDescriptor: Map<string, Bucket>): RegistryDescriptorRanks[] {
  return [...byDescriptor.entries()].map(([id, bucket]) => ({
    id,
    name: bucket.name,
    forms: [...bucket.rows]
      .sort((left, right) => left.absoluteScore - right.absoluteScore || left.filename.localeCompare(right.filename))
      .map((row, index) => ({ ...row, rank: index + 1 })),
    unavailable: bucket.unavailable,
  }));
}

async function scoreRegistry(): Promise<RegistryOpenVolume> {
  const names = (await readdir(REGISTRY_DIRECTORY))
    .filter((name) => name.toLowerCase().endsWith(".obj"))
    .sort((left, right) => left.localeCompare(right));
  const current = new Map<string, Bucket>();
  const legacy = new Map<string, Bucket>();
  const collect = (map: Map<string, Bucket>, filename: string, descriptors: Array<{ id: string; name: string; absoluteScore: number; unavailableReason?: string }>) => {
    for (const descriptor of descriptors) {
      const bucket = map.get(descriptor.id) ?? { name: descriptor.name, rows: [], unavailable: [] };
      if (Number.isFinite(descriptor.absoluteScore)) bucket.rows.push({ filename, absoluteScore: descriptor.absoluteScore });
      else bucket.unavailable.push({ filename, reason: descriptor.unavailableReason ?? "Unavailable." });
      map.set(descriptor.id, bucket);
    }
  };
  for (const filename of names) {
    const text = await readFile(join(REGISTRY_DIRECTORY, filename), "utf8");
    const mesh = parseObj(text, filename);
    const model = analyzeMesh(mesh, null, 1, "y");
    const source = { positions: mesh.positions, faces: mesh.faces, up: "y" as const, unitScale: 1 };
    collect(current, filename, evaluateTileModel(model, source).descriptors);
    collect(legacy, filename, evaluateTileModelLegacy(model, source).descriptors);
  }
  const descriptors = rankBuckets(current);
  return {
    version: DESCRIPTOR_ALGORITHM_VERSION,
    cohortSize: names.length,
    direction: "1 is the weakest result in the source registry. The highest rank is the strongest. A measured 0 is ranked. Only a geometry-processing failure is listed as unavailable.",
    forms: descriptors.find((descriptor) => descriptor.id === "openVolume")?.forms ?? [],
    descriptors,
    legacy: { version: LEGACY_DESCRIPTOR_ALGORITHM_VERSION, descriptors: rankBuckets(legacy) },
  };
}
